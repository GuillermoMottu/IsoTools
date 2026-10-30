import assert from 'node:assert/strict'
import { inspectConfiguration, inspectConnection, hasDataVolume, inspectFrontendBundle, inspectRailwayOperations } from './inspect_railway_tool.js'

const vars = { ISOTOOLS_API_URL: 'https://api-events.orcalabs.mx/api/v1', ISOTOOLS_API_KEY: 'secret-fixture-not-for-logs', RAILWAY_PUBLIC_DOMAIN: 'fixture.up.railway.app', RAILWAY_VOLUME_MOUNT_PATH: '/data', SESSION_SECRET: 'another-session-secret-fixture-at-least-32-characters', ISSUER_ENDPOINT: 'https://idp.fixture.invalid/oidc', APP_ID: 'fixture-client', APP_SECRETS: 'logto-secret-fixture-not-for-logs', OIDC_REDIRECT_URI: 'https://cpa.orcalabs.mx/auth/callback' }
const calls = []
const report = await inspectConnection(vars, 'compare_planned_vs_actual', '', async (url, options) => {
  calls.push({ url, options })
  return new Response(JSON.stringify(url.includes('/subscriptions/') ? { consumer: 'compare_planned_vs_actual', consumes: ['ERP_SALES_PERIOD_CLOSED'], events: [] } : url.endsWith('/auth/me') ? { mode: 'open' } : { status: 'ok', tool: 'compare_planned_vs_actual' }))
})
assert.equal(report.central_api_key_works, true)
assert.equal(report.volume_mounted_at_data, true)
assert.equal(report.health_url, 'https://fixture.up.railway.app/health')
assert.equal(report.deployed_tool_identity_matches, true)
assert.equal(report.deployed_auth_mode_open, true)
assert.equal(report.sso_configured, true)
assert.deepEqual(report.sso_missing_variables, [])
assert.equal(report.tool_api_key_configured, false)
assert.equal(report.redirect_uri_matches, true)
assert.equal(report.roles_claim_is_roles, true)
assert.equal(report.role_map_uses_default, true)
assert.equal(report.operator_role_mapping_valid, true)
assert.equal(report.auditor_role_mapping_valid, true)
const customRoles = inspectConfiguration({ ...vars, OIDC_ROLES_CLAIM: 'private-claim-never-print', ROLE_MAP: 'operations.manager=WrongDomain,platform.auditor=Auditor' }, 'compare_planned_vs_actual')
assert.equal(customRoles.roles_claim_is_roles, false)
assert.equal(customRoles.role_map_uses_default, false)
assert.equal(customRoles.operator_role_mapping_valid, false)
assert.equal(customRoles.auditor_role_mapping_valid, true)
assert.equal(JSON.stringify(customRoles).includes('private-claim-never-print'), false)
assert.equal(JSON.stringify(customRoles).includes('WrongDomain'), false)
const sealedRoles = inspectConfiguration({ ...vars, OIDC_ROLES_CLAIM: null, ROLE_MAP: null }, 'compare_planned_vs_actual')
assert.equal(sealedRoles.roles_claim_readable, false)
assert.equal(sealedRoles.roles_claim_is_roles, null)
assert.equal(sealedRoles.role_map_readable, false)
assert.equal(sealedRoles.operator_role_mapping_valid, null)
assert.equal(sealedRoles.auditor_role_mapping_valid, null)
assert.ok(!JSON.stringify(report).includes(vars.ISOTOOLS_API_KEY))
assert.ok(!JSON.stringify(report).includes(vars.SESSION_SECRET))
assert.ok(!JSON.stringify(report).includes(vars.APP_SECRETS))
assert.deepEqual(inspectConfiguration({ ...vars, APP_SECRETS: '', SESSION_SECRET: '' }, 'compare_planned_vs_actual').sso_missing_variables, ['OIDC_CLIENT_SECRET/APP_SECRETS', 'SESSION_SECRET'])
assert.ok(calls.every(call => !call.options.method || call.options.method === 'GET'))
assert.equal(calls[0].options.headers['x-api-key'], vars.ISOTOOLS_API_KEY)
assert.equal(calls[1].options.headers, undefined, 'health must be anonymous')
assert.equal(inspectConfiguration({ ...vars, OIDC_ISSUER: 'https://idp.example' }, 'track_project_progress').open_mode_configured, false)
assert.throws(() => inspectConfiguration(vars, 'compare_planned_vs_actual', 'https://example.com/health?key=secret'), /invalid_health_url/)
assert.equal((await inspectConnection(vars, 'compare_planned_vs_actual', '', async () => new Response('{}', { status: 401 }))).central_api_key_works, false)
await inspectConnection({ ...vars, ISOTOOLS_API_URL: 'https://untrusted.example' }, 'compare_planned_vs_actual', '', async (url, options) => {
  if (options.headers?.['x-api-key']) assert.ok(url.startsWith('https://api-events.orcalabs.mx/api/v1/'), 'the key is sent only to the official API')
  return new Response('{}')
})
const sealed = await inspectConnection({ ...vars, ISOTOOLS_API_KEY: null }, 'compare_planned_vs_actual', '', async () => new Response('{}'))
assert.equal(sealed.api_key_configured, true)
assert.equal(sealed.api_key_readable, false)
assert.equal(sealed.central_api_key_works, null, 'a sealed key is present but cannot be verified through CLI variables')
assert.equal(inspectConfiguration({ ...vars, ISOTOOLS_API_URL: 'https://api-events.orcalabs.mx' }, 'compare_planned_vs_actual').api_url_is_origin_only, true)
assert.equal(hasDataVolume({ volumes: [{ serviceName: 'compare-planned-vs-actual', mountPath: '/data' }] }, 'compare-planned-vs-actual'), true)
assert.equal(hasDataVolume({ volumes: [{ serviceName: 'other', mountPath: '/data' }] }, 'compare-planned-vs-actual'), false)
assert.equal(hasDataVolume({ volumes: [{ serviceName: 'compare-planned-vs-actual', mountPath: '/data', isPendingDeletion: true }] }, 'compare-planned-vs-actual'), false)
assert.equal(hasDataVolume({ volumes: [] }, 'compare-planned-vs-actual'), false)
console.log('Railway inspection: GET only, central credential check, anonymous health and secret-free reports PASS')
for (const leak of [false, true]) {
  const report = await inspectFrontendBundle(vars, 'https://cpa.orcalabs.mx/health', async (url, options) => {
    assert.equal(options.headers, undefined, 'public assets never receive a key')
    assert.ok(url.startsWith('https://cpa.orcalabs.mx'))
    return url.endsWith('/assets/app.js')
      ? new Response(leak ? vars.ISOTOOLS_API_KEY.slice(0, 8) : 'console.log("safe")')
      : new Response('<html><script src="/assets/app.js"></script><script src="https://external.invalid/a.js"></script></html>', { headers: { 'content-type': 'text/html' } })
  })
  assert.equal(report.frontend_bundle_checked, true)
  assert.equal(report.frontend_actual_key_checked, true)
  assert.equal(report.frontend_actual_client_secret_checked, true)
  assert.equal(report.frontend_actual_session_secret_checked, true)
  assert.equal(report.frontend_key_leak, leak)
  assert.ok(!JSON.stringify(report).includes(vars.ISOTOOLS_API_KEY))
}
const protectedTool = await inspectConnection(vars, 'compare_planned_vs_actual', 'https://cpa.orcalabs.mx/health', async url => {
  if (url.includes('/subscriptions/')) return Response.json({ consumer: 'compare_planned_vs_actual', consumes: ['ERP_SALES_PERIOD_CLOSED'], events: [] })
  if (url.endsWith('/auth/me')) return Response.json({ mode: 'sso', authenticated: false }, { status: 401 })
  if (url.endsWith('/api/tool/status')) return Response.json({ error: 'authentication_required' }, { status: 401 })
  return Response.json({ tool: 'compare_planned_vs_actual', auth: 'sso', build_sha: 'a'.repeat(40) })
})
assert.equal(protectedTool.deployed_auth_mode_sso, true)
assert.equal(protectedTool.anonymous_session_rejected, true)
assert.equal(protectedTool.anonymous_api_rejected, true)
for (const secret of ['APP_SECRETS', 'SESSION_SECRET', 'OIDC_CLIENT_SECRET']) {
  const fixture = { ...vars, [secret]: 'distinct-secret-prefix-for-test' }
  const result = await inspectFrontendBundle(fixture, 'https://cpa.orcalabs.mx/health', async (url, options) => {
    assert.equal(options.headers, undefined, 'neither session nor API credentials go to public assets')
    if (url === 'https://cpa.orcalabs.mx') return new Response(null, { status: 302, headers: { location: '/auth/login' } })
    if (url.endsWith('/assets/manifest.json')) return Response.json({ 'index.html': { file: 'assets/app.js', isEntry: true } })
    return new Response(fixture[secret].slice(0, 8))
  })
  assert.equal(result.frontend_bundle_checked, true)
  assert.equal(result.frontend_key_leak, true, `${secret} value is detected behind a protected shell`)
}
const sealedClient = await inspectFrontendBundle({ ...vars, OIDC_CLIENT_SECRET: null }, 'https://cpa.orcalabs.mx/health', async url => url.endsWith('/assets/app.js') ? new Response('safe') : new Response('<script src="/assets/app.js"></script>', { headers: { 'content-type': 'text/html' } }))
assert.equal(sealedClient.frontend_actual_client_secret_checked, false, 'a readable inactive alias cannot certify a sealed active secret')
console.log('Railway inspection: SSO 401, protected-shell manifests and Logto/session secret scanning PASS')
const connectorVars = { ...vars, CF_ACCESS_CLIENT_SECRET: null, ERP_PASSWORD: 'private-fixture-credential', ERP_API_KEY: '', OIDC_SCOPES: 'openid roles', OIDC_POST_LOGOUT_REDIRECT_URI: 'https://api-events.orcalabs.mx' }
const connectorReport = inspectConfiguration(connectorVars, 'compare_planned_vs_actual')
assert.deepEqual(connectorReport.connector_credential_names_to_review, ['CF_ACCESS_CLIENT_SECRET', 'ERP_PASSWORD'])
assert.equal(connectorReport.roles_scope_configured, true)
assert.equal(connectorReport.post_logout_redirect_uri_matches, true)
assert.equal(JSON.stringify(connectorReport).includes(connectorVars.ERP_PASSWORD), false)
const operationCalls = []
const ops = inspectRailwayOperations('compare_planned_vs_actual', 'compare-planned-vs-actual', args => {
  operationCalls.push(args)
  return [{ id: '6bf4dda7-06a8-48f4-a217-668e63cc861d', status: 'SUCCESS', meta: { private: 'never-print-fixture-secret' } }]
}, args => {
  operationCalls.push(args)
  return [
    JSON.stringify({ timestamp: '2026-10-20T12:00:00Z', message: JSON.stringify({ tool: 'compare_planned_vs_actual', action: 'poll', cursor: 7, count: 1, next_seq: 8, api_key: 'never-print-fixture-secret' }) }),
    JSON.stringify({ message: JSON.stringify({ tool: 'compare_planned_vs_actual', action: 'published', input_seq: 8, http_status: 201, event_id: 'never-print-fixture-secret' }) }),
    JSON.stringify({ message: '', tool: 'compare_planned_vs_actual', action: 'processed', seq: 9, secret: 'never-print-fixture-secret' }),
    JSON.stringify({ message: 'null' }),
    JSON.stringify({ message: JSON.stringify({ tool: 'other_tool', action: 'retry' }) }),
    'unstructured private log never-print-fixture-secret'
  ].join('\n')
})
assert.equal(ops.latest_deployment_status, 'SUCCESS')
assert.equal(ops.runtime_log_queries_succeeded, true)
assert.deepEqual(ops.observed_log_actions, ['poll', 'processed', 'published'])
assert.equal(ops.runtime_json_logs_read, 10)
assert.ok(ops.runtime_log_samples.some(sample => sample.action === 'processed' && sample.seq === 9))
assert.equal(JSON.stringify(ops).includes('never-print-fixture-secret'), false)
assert.ok(operationCalls.every(args => ['deployment', 'logs'].includes(args[0]) && !args.includes('redeploy') && !args.includes('set')))
assert.ok(operationCalls.some(args => args.includes('--filter') && args.at(-1).includes('@action:published')), 'structured attributes need attribute filters')
const failedOps = inspectRailwayOperations('compare_planned_vs_actual', 'compare-planned-vs-actual', () => { throw new Error('private-fixture-secret') }, () => { throw new Error('private-fixture-secret') })
assert.equal(failedOps.deployment_query_succeeded, false)
assert.equal(failedOps.runtime_log_queries_succeeded, false)
assert.equal(JSON.stringify(failedOps).includes('private-fixture-secret'), false)
console.log('Railway operations: read-only deployment/log queries, credential-name checks and whitelisted reports PASS')
