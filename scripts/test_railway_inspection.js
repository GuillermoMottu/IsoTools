import assert from 'node:assert/strict'
import { inspectConfiguration, inspectConnection } from './inspect_railway_tool.js'

const vars = { ISOTOOLS_API_URL: 'https://api-events.orcalabs.mx/api/v1', ISOTOOLS_API_KEY: 'secret-fixture-not-for-logs', RAILWAY_PUBLIC_DOMAIN: 'fixture.up.railway.app', RAILWAY_VOLUME_MOUNT_PATH: '/data', SESSION_SECRET: 'another-secret-fixture' }
const calls = []
const report = await inspectConnection(vars, 'compare_planned_vs_actual', '', async (url, options) => {
  calls.push({ url, options })
  return new Response(JSON.stringify(url.includes('/subscriptions/') ? { consumer: 'compare_planned_vs_actual', consumes: ['ERP_SALES_PERIOD_CLOSED'], events: [] } : { status: 'ok', tool: 'compare_planned_vs_actual', auth: 'open' }))
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
assert.equal((await inspectConnection({ ...vars, ISOTOOLS_API_URL: 'https://untrusted.example' }, 'compare_planned_vs_actual', '', async () => { throw new Error('no key may be sent here') })).central_api_key_works, null)
const sealed = await inspectConnection({ ...vars, ISOTOOLS_API_KEY: null }, 'compare_planned_vs_actual', '', async () => new Response('{}'))
assert.equal(sealed.api_key_configured, true)
assert.equal(sealed.api_key_readable, false)
assert.equal(sealed.central_api_key_works, null, 'a sealed key is present but cannot be verified through CLI variables')
console.log('Railway inspection: GET only, central credential check, anonymous health and secret-free reports PASS')
