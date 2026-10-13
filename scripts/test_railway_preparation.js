import assert from 'node:assert/strict'
import { runtimePlan } from './prepare_railway_tool.js'
import { deploymentConfigurationReady, stateDirectoryIsPersistent } from './inspect_railway_tool.js'
import { deploymentIsCurrent } from './wait_tool_deployment.js'

const tool = 'compare_planned_vs_actual'
const service = 'compare-planned-vs-actual'
const initial = runtimePlan(tool, service, { ISOTOOLS_API_KEY: 'never-change-this-key' }, { volumes: [] })
assert.equal(initial.createVolume, true)
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
