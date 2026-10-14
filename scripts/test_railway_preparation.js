import assert from 'node:assert/strict'
import { runtimePlan, configureCentralKey, consumerActivationReady } from './prepare_railway_tool.js'
import { deploymentConfigurationReady, stateDirectoryIsPersistent } from './inspect_railway_tool.js'
import { deploymentIsCurrent } from './wait_tool_deployment.js'

const tool = 'compare_planned_vs_actual'
const activationConnection = { central_api_key_works: true, health_url: 'https://cpa.orcalabs.mx/health' }
const registered = { id: tool, kind: 'federated', url: 'https://cpa.orcalabs.mx', healthUrl: activationConnection.health_url, health: { state: 'up' } }
assert.equal(consumerActivationReady({ tools: [registered] }, tool, activationConnection), true)
assert.equal(consumerActivationReady({ tools: [] }, tool, activationConnection), false)
assert.equal(consumerActivationReady({ tools: [{ ...registered, url: null }] }, tool, activationConnection), false)
assert.equal(consumerActivationReady({ tools: [{ ...registered, kind: 'native' }] }, tool, activationConnection), false)
assert.equal(consumerActivationReady({ tools: [{ ...registered, health: { state: 'down' } }] }, tool, activationConnection), false)
assert.equal(consumerActivationReady({ tools: [registered] }, tool, { ...activationConnection, central_api_key_works: false }), false)
const service = 'compare-planned-vs-actual'
const calls = []
const variables = { ISOTOOLS_API_KEY: 'old-fixture-key' }
const cli = (args, input) => { calls.push({ args, input }); return { success: true } }
const acceptedKey = async (url, options) => {
  assert.equal(options.method, undefined, 'key verification is GET only')
  assert.equal(options.headers['x-api-key'], 'valid-fixture-key')
  return new Response(JSON.stringify({ consumer: tool, consumes: ['ERP_SALES_PERIOD_CLOSED'], events: [] }))
}
assert.deepEqual(await configureCentralKey(variables, tool, service, 'valid-fixture-key', cli, acceptedKey), { supplied: true, changed: true })
assert.equal(calls.length, 1)
assert.equal(calls[0].input, 'valid-fixture-key')
assert.ok(calls[0].args.includes('--stdin'))
assert.ok(calls[0].args.every(arg => !arg.includes('valid-fixture-key')), 'key is not a command-line argument')
assert.equal(variables.ISOTOOLS_API_KEY, 'valid-fixture-key')
assert.deepEqual(await configureCentralKey(variables, tool, service, 'valid-fixture-key', cli, acceptedKey), { supplied: true, changed: false })
assert.equal(calls.length, 1, 'matching key is preserved')
await assert.rejects(configureCentralKey(variables, tool, service, 'invalid-fixture', cli, async () => new Response('{}', { status: 401 })), /supplied_central_key_rejected/)
assert.equal(calls.length, 1, 'rejected key is never written')
await assert.rejects(configureCentralKey({ ISOTOOLS_API_KEY: null }, tool, service, 'valid-fixture-key', cli, acceptedKey), /sealed_central_key_requires_review/)
assert.deepEqual(await configureCentralKey(variables, tool, service, '', cli, acceptedKey), { supplied: false, changed: false })
const serviceId = 'e3638694-09d1-4e56-9060-207657d62b89'
const initial = runtimePlan(tool, service, { RAILWAY_SERVICE_ID: serviceId, ISOTOOLS_API_KEY: 'never-change-this-key' }, { volumes: [] })
assert.equal(initial.createVolume, true)
assert.equal(initial.volumeServiceId, serviceId, 'volume creation uses the service ID rather than its name')
assert.throws(() => runtimePlan(tool, service, {}, { volumes: [] }), /missing_volume_service_id/)
assert.ok(initial.assignments.includes('TOOL_STATE_DIR=/data'))
assert.ok(initial.assignments.includes('TOOL_CONSUMER_ENABLED=false'))
assert.ok(initial.assignments.every(value => !value.includes('never-change-this-key') && !value.startsWith('ISOTOOLS_API_KEY=')))
const existing = { volumes: [{ serviceName: service, mountPath: '/existing' }] }
const reuse = runtimePlan(tool, service, { TOOL_STATE_DIR: '/existing/cursors', TOOL_CONSUMER_ENABLED: 'true' }, existing)
assert.equal(reuse.createVolume, false)
assert.ok(reuse.assignments.includes('TOOL_STATE_DIR=/existing/cursors'))
assert.ok(reuse.assignments.every(value => !value.startsWith('TOOL_CONSUMER_ENABLED=')))
assert.equal(stateDirectoryIsPersistent(existing, service, '/existing/cursors'), true)
assert.equal(stateDirectoryIsPersistent(existing, service, '/existing-elsewhere'), false)
assert.equal(runtimePlan(tool, service, { TOOL_STATE_DIR: '/existing/../outside' }, existing).assignments.includes('TOOL_STATE_DIR=/existing'), true)
assert.throws(() => runtimePlan(tool, service, {}, { volumes: [{ serviceName: service, mountPath: '/data', isPendingDeletion: true }] }), /existing_volume_requires_review/)
assert.throws(() => runtimePlan(tool, service, { OIDC_ISSUER: 'https://idp.example' }, existing), /existing_authentication_requires_review/)
assert.throws(() => runtimePlan(tool, service, { TOOL_API_KEY: null }, existing), /existing_authentication_requires_review/)
assert.throws(() => runtimePlan(tool, service, { TOOL_CONSUMER_ENABLED: 'true', TOOL_STATE_DIR: '/ephemeral' }, existing), /existing_state_directory_requires_review/)
const report = { api_url_matches: true, consumer_enabled: false, central_api_key_works: false, tool_id_matches: true, dockerfile_matches: true, open_mode_configured: true, state_directory_persistent: true, health_url: 'https://cpa.orcalabs.mx/health' }
assert.equal(deploymentConfigurationReady(report), true, 'paused service may deploy while its central key is pending')
assert.equal(deploymentConfigurationReady({ ...report, consumer_enabled: true }), false, 'active worker cannot deploy with a rejected key')
assert.equal(deploymentConfigurationReady({ ...report, consumer_enabled: true, central_api_key_works: true }), true)
assert.equal(deploymentConfigurationReady({ ...report, state_directory_persistent: false }), false)
const sha = 'a'.repeat(40)
const health = { status: 'ok', service: 'isotools-tool', tool, auth: 'open', build_sha: sha }
assert.equal(deploymentIsCurrent(health, tool, sha), true)
assert.equal(deploymentIsCurrent({ status: 'ok', service: 'isotools-tool' }, tool, sha), false, 'old deployment returning HTTP 200 is insufficient')
assert.equal(deploymentIsCurrent({ ...health, build_sha: 'b'.repeat(40) }, tool, sha), false)
assert.equal(deploymentIsCurrent({ ...health, tool: 'track_project_progress' }, tool, sha), false)
console.log('Railway preparation: volume reuse, active-consumer preservation, paused deployment and secret preservation PASS')
