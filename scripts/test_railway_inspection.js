import assert from 'node:assert/strict'
import { inspectConfiguration, inspectConnection, hasDataVolume, inspectFrontendBundle } from './inspect_railway_tool.js'

const vars = { ISOTOOLS_API_URL: 'https://api-events.orcalabs.mx/api/v1', ISOTOOLS_API_KEY: 'secret-fixture-not-for-logs', RAILWAY_PUBLIC_DOMAIN: 'fixture.up.railway.app', RAILWAY_VOLUME_MOUNT_PATH: '/data', SESSION_SECRET: 'another-secret-fixture' }
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
assert.ok(!JSON.stringify(report).includes(vars.ISOTOOLS_API_KEY))
assert.ok(!JSON.stringify(report).includes(vars.SESSION_SECRET))
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
  assert.equal(report.frontend_key_leak, leak)
  assert.ok(!JSON.stringify(report).includes(vars.ISOTOOLS_API_KEY))
}
