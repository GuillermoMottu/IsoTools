import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import { createAuthGateway } from '../src/tool-auth/auth-gateway.js'
import { createLoginProtection } from '../src/tool-auth/login-protection.js'

let time = Date.now()
const admit = createLoginProtection(() => time)
for (let i = 0; i < 10; i++) assert.equal(admit('client-a'), 0)
assert.equal(admit('client-a'), 60)
for (let i = 0; i < 20; i++) assert.equal(admit(`client-${i}`), 0)
assert.equal(admit('new-client'), 60, 'global quota also limits distinct clients')
time += 60001
assert.equal(admit('client-a'), 0, 'expired windows release quota and client entries')

const issuer = 'https://idp.fixture.invalid'
const config = { issuer: new URL(issuer), clientId: 'fixture-client', clientSecret: 'fixture-client-secret', redirectUri: 'https://tool.fixture.invalid/auth/callback', sessionSecret: 'fixture-session-secret-at-least-32-characters', scopes: 'openid roles', secureCookies: true }
const originalFetch = globalThis.fetch
const logs = []
const options = { now: () => time, logger: entry => logs.push(entry) }
let gateway = createAuthGateway(config, options)
let mode = 429, calls = 0
globalThis.fetch = async (url, init) => {
  const target = new URL(typeof url === 'string' ? url : url.url || url.href)
  if (target.origin !== issuer) return originalFetch(url, init)
  calls++
  if (mode === 'network') throw new Error('fixture-private-provider-error')
  if (target.pathname === '/token') return Response.json({ error: 'invalid_grant' }, { status: 400 })
  if (mode !== 200) return Response.json({ error: 'fixture-private-response' }, { status: mode, headers: { 'retry-after': mode === 429 ? '120' : 'invalid' } })
  return Response.json({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_post'] })
}
const app = express()
app.set('trust proxy', 1)
app.get('/auth/:action', (req, res) => gateway.handleRoute(req, res, req.params.action))
const server = http.createServer(app)
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const login = () => originalFetch(`${base}/auth/login?return_to=fixture-private-query`, { redirect: 'manual' })
try {
  let response = await login()
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('retry-after'), '120')
  for (let i = 0; i < 6; i++) assert.equal((await login()).status, 503)
  assert.equal(calls, 1, '429 discovery does not produce repeated provider calls')
  const logout = await originalFetch(`${base}/auth/logout`, { redirect: 'manual' })
  assert.equal(logout.status, 200)
  assert.equal(logout.headers.get('location'), null)
  assert.equal((await logout.json()).logged_out, true)
  assert.ok(logout.headers.getSetCookie().every(cookie => cookie.includes('Max-Age=0')))
  assert.equal(calls, 1, 'local logout never contacts or redirects to a cooling-down provider')
  time += 120001
  mode = 200
  assert.equal((await login()).status, 302)
  assert.equal(calls, 2, 'manual login recovers after the provider cooldown')
  for (const failure of [500, 'network']) {
    gateway = createAuthGateway(config, options)
    mode = failure
    response = await login()
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('retry-after'), '30')
    const previous = calls
    assert.equal((await login()).status, 503)
    assert.equal(calls, previous)
    time += 30001
    mode = 200
    assert.equal((await login()).status, 302)
  }
  gateway = createAuthGateway(config, options)
  const statuses = []
  for (let i = 0; i < 20; i++) statuses.push((await login()).status)
  assert.deepEqual(statuses, [...Array(10).fill(302), ...Array(10).fill(429)])
  gateway = createAuthGateway(config, options)
  const start = await login()
  const state = new URL(start.headers.get('location')).searchParams.get('state')
  const cookie = start.headers.getSetCookie()[0].split(';')[0]
  const beforeReplay = calls
  for (let i = 0; i < 11; i++) {
    const replay = await originalFetch(`${base}/auth/callback?code=fixture-private-code&state=${encodeURIComponent(state)}`, { redirect: 'manual', headers: { cookie } })
    assert.equal(replay.status, i < 10 ? 502 : 429)
  }
  assert.equal(calls, beforeReplay + 10, 'replayed valid handshakes cannot bypass the callback quota')
  response = await originalFetch(`${base}/auth/callback?code=fixture-private-code&state=fixture-private-state`, { redirect: 'manual' })
  assert.equal(response.status, 400)
  assert.equal(response.headers.get('location'), null)
  assert.ok(logs.length > 20)
  assert.equal(new Set(logs.map(entry => entry.request_id)).size, logs.length)
  for (const entry of logs) {
    assert.deepEqual(Object.keys(entry).sort(), ['action', 'build_sha', 'component', 'duration_ms', 'http_status', 'instance_id', 'request_id'].sort())
    assert.ok(Number.isFinite(entry.duration_ms) && entry.duration_ms >= 0)
  }
  for (const secret of ['fixture-private', config.clientSecret, config.sessionSecret, issuer]) assert.ok(!JSON.stringify(logs).includes(secret))
  console.log('Auth protection: per-client/global quotas, 429/500/network cooldown, recovery, terminal callback and allowlisted secret-free logs PASS')
} finally {
  globalThis.fetch = originalFetch
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
