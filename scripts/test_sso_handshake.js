import assert from 'node:assert/strict'
import http from 'node:http'
import { generateKeyPairSync, sign, createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const track = process.argv.includes('--track')
const toolId = track ? 'track_project_progress' : 'compare_planned_vs_actual'
const cookieName = track ? 'tpp_session' : 'cpa_session'
const recordPath = track ? '/api/records' : '/api/analyses'
const issuer = 'https://idp.fixture.invalid'
const clientId = 'fixture-client'
const secret = 'fixture-session-secret-at-least-32-characters'
const temp = await mkdtemp(path.join(os.tmpdir(), 'isotools-oidc-'))
const originalFetch = globalThis.fetch
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture-rsa', alg: 'RS256', use: 'sig' }
let mode = 'valid', idpRoles = ['operations.manager'], authorization, tokenCalls = 0
let tool
const server = http.createServer((req, res) => tool.app(req, res))
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
Object.assign(process.env, { NODE_ENV: 'test', OIDC_ISSUER: '', OIDC_CLIENT_ID: '', OIDC_CLIENT_SECRET: '', ISSUER_ENDPOINT: issuer, APP_ID: clientId, APP_SECRETS: 'fixture-client-secret', OIDC_REDIRECT_URI: `${base}/auth/callback`, SESSION_SECRET: secret, SESSION_COOKIE_NAME: cookieName, SESSION_INSECURE_COOKIES: '', TOOL_API_KEY: '', TOOL_PAGE_ID: toolId, TOOL_CONSUMER_ENABLED: 'false', TOOL_STATE_DIR: path.join(temp, 'state'), WEB_DIST_DIR: path.join(temp, 'dist') })
globalThis.fetch = async (url, options) => {
  const parsed = new URL(typeof url === 'string' ? url : url.url || url.href)
  if (parsed.origin !== issuer) return originalFetch(url, options)
  if (parsed.pathname.endsWith('/.well-known/openid-configuration')) return Response.json({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_post'], code_challenge_methods_supported: ['S256'] })
  if (parsed.pathname === '/jwks') return Response.json({ keys: [jwk] })
  assert.equal(parsed.pathname, '/token')
  tokenCalls++
  const body = new URLSearchParams(options.body.toString())
  assert.equal(body.get('client_id'), clientId)
  assert.equal(body.get('client_secret'), 'fixture-client-secret')
  assert.equal(body.get('redirect_uri'), `${base}/auth/callback`)
  assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), authorization.searchParams.get('code_challenge'), 'real PKCE verifier matches S256 challenge')
  if (mode === 'invalid_code') return Response.json({ error: 'invalid_grant' }, { status: 400 })
  const now = Math.floor(Date.now() / 1000)
  const claims = { iss: mode === 'wrong_issuer' ? 'https://other.invalid' : issuer, aud: mode === 'wrong_audience' ? 'other-client' : clientId, sub: 'verified-user', name: 'Fixture operator', roles: idpRoles, nonce: mode === 'wrong_nonce' ? 'other-nonce' : authorization.searchParams.get('nonce'), iat: now, exp: mode === 'expired' ? now - 60 : now + 600 }
  const payload = [Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url'), Buffer.from(JSON.stringify(claims)).toString('base64url')].join('.')
  const signature = sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url')
  return Response.json({ access_token: 'fixture-access-token', token_type: 'Bearer', expires_in: 600, id_token: `${payload}.${mode === 'bad_signature' ? `${signature.slice(0, -8)}AAAAAAAA` : signature}` })
}
const cookies = response => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
async function login (stateOverride) {
  const start = await originalFetch(`${base}/auth/login?return_to=${encodeURIComponent('/deep/link?x=1')}`, { redirect: 'manual' })
  assert.equal(start.status, 302)
  authorization = new URL(start.headers.get('location'))
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256')
  const handshake = start.headers.getSetCookie()[0]
  assert.match(handshake, /HttpOnly/)
  assert.match(handshake, /Secure/)
  assert.match(handshake, /Path=\/auth/)
  return originalFetch(`${base}/auth/callback?code=fixture-code&state=${encodeURIComponent(stateOverride || authorization.searchParams.get('state'))}`, { redirect: 'manual', headers: { cookie: cookies(start) } })
}
try {
  await mkdir(process.env.WEB_DIST_DIR)
  await writeFile(path.join(process.env.WEB_DIST_DIR, 'index.html'), '<html>fixture tool</html>')
  await writeFile(path.join(process.env.WEB_DIST_DIR, 'asset.js'), 'console.log("public asset")')
  await mkdir(path.join(process.env.WEB_DIST_DIR, 'assets'))
  await writeFile(path.join(process.env.WEB_DIST_DIR, 'assets/manifest.json'), JSON.stringify({ 'index.html': { file: 'assets/app.js', isEntry: true } }))
  await writeFile(path.join(process.env.WEB_DIST_DIR, 'assets/app.js'), 'console.log("public build asset")')
  const { createToolApp } = await import('../src/tool-server.js')
  tool = await createToolApp()
  assert.equal((await originalFetch(`${base}/health`)).status, 200)
  assert.equal((await originalFetch(`${base}/asset.js`, { redirect: 'manual' })).status, 200)
  assert.equal((await originalFetch(`${base}/assets/manifest.json`, { redirect: 'manual' })).status, 200)
  assert.equal((await originalFetch(`${base}/auth/me`, { redirect: 'manual' })).status, 401)
  assert.equal((await originalFetch(`${base}/api/tool/status`, { redirect: 'manual' })).status, 401)
  const unauthenticated = await originalFetch(base + recordPath, { redirect: 'manual' })
  assert.equal(unauthenticated.status, 401)
  assert.equal((await unauthenticated.json()).error, 'authentication_required')
  const completed = await login()
  assert.equal(completed.status, 302)
  assert.equal(completed.headers.get('location'), '/deep/link?x=1')
  const session = completed.headers.getSetCookie().find(value => value.startsWith(`${cookieName}=`))
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(session.includes(attribute))
  assert.ok(!session.includes('Domain='))
  assert.ok(!session.includes('fixture-access-token'))
  const operatorCookie = session.split(';')[0]
  const me = await originalFetch(`${base}/auth/me`, { headers: { cookie: operatorCookie } })
  assert.deepEqual((await me.json()).user.roles, ['OperationsManager'])
  assert.equal((await originalFetch(base + recordPath, { headers: { cookie: operatorCookie } })).status, 200)
  const evaluation = await originalFetch(`${base}/api/tool/${toolId}/run`, { method: 'POST', headers: { cookie: operatorCookie, 'content-type': 'application/json' }, body: JSON.stringify({ input: {}, actor: { subject: 'attacker', role: 'Director' } }) })
  assert.equal(evaluation.status, 400)
  assert.deepEqual((await evaluation.json()).result.audit.evaluated_by, { subject: 'verified-user', role: 'OperationsManager' }, 'actor is bound from the verified session before domain evaluation')
  const logout = await originalFetch(`${base}/auth/logout`, { redirect: 'manual', headers: { cookie: operatorCookie } })
  assert.match(logout.headers.getSetCookie()[0], /Max-Age=0/)
  const beforeWrongState = tokenCalls
  assert.equal((await login('wrong-state')).status, 502)
  assert.equal(tokenCalls, beforeWrongState, 'state rejection happens before code exchange')
  for (mode of ['wrong_nonce', 'wrong_issuer', 'wrong_audience', 'expired', 'bad_signature', 'invalid_code']) {
    const invalid = await login()
    assert.equal(invalid.status, 502, mode)
    assert.ok(!invalid.headers.getSetCookie().some(value => value.startsWith(`${cookieName}=`)), mode)
  }
  mode = 'valid'
  for (idpRoles of [['platform.auditor'], ['unknown.admin'], []]) {
    const signedIn = await login()
    const cookie = cookies(signedIn)
    const request = await originalFetch(`${base}/api/tool/${toolId}/run`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{"input":{},"authorizedByRole":"OperationsManager"}' })
    assert.equal(request.status, 403, 'IdP role controls permission; body cannot grant it')
  }
  console.log(`${toolId}: real OIDC library discovery, PKCE, RSA/JWKS, state/nonce/issuer/audience/expiry/signature checks, callback/deep link, logout and roles PASS (local IdP fixture)`)
} finally {
  globalThis.fetch = originalFetch
  tool?.stop()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await rm(temp, { recursive: true, force: true })
}
