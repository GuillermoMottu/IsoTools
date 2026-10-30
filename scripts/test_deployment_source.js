import assert from 'node:assert/strict'
import { inspectDeploymentSource } from './inspect_railway_tool.js'

const variables = { RAILWAY_ENVIRONMENT_ID: '11111111-1111-4111-8111-111111111111', RAILWAY_PROJECT_ID: '22222222-2222-4222-8222-222222222222', RAILWAY_SERVICE_ID: '33333333-3333-4333-8333-333333333333' }
const token = 'fixture-project-token-never-print'
const privateValue = 'fixture-encrypted-variable-never-print'
const fixture = (repo, branch) => async (url, options) => {
  assert.equal(url, 'https://backboard.railway.com/graphql/v2')
  assert.equal(options.redirect, 'error')
  assert.equal(options.headers['Project-Access-Token'], token)
  const request = JSON.parse(options.body)
  assert.ok(request.query.startsWith('query ') && !request.query.includes('mutation'))
  assert.ok(request.query.includes('decryptVariables: false'))
  return Response.json({ data: { environment: {
    config: { services: { [variables.RAILWAY_SERVICE_ID]: { source: { repo, branch }, variables: { PRIVATE: privateValue } } } },
    serviceInstances: { edges: [{ node: { serviceId: variables.RAILWAY_SERVICE_ID, source: repo ? { repo } : null } }] }
  } } })
}
const linked = await inspectDeploymentSource(variables, token, fixture('GuillermoMottu/IsoTools', 'main'))
assert.equal(linked.main_push_may_deploy, true)
assert.equal((await inspectDeploymentSource(variables, token, fixture('GuillermoMottu/IsoTools', undefined))).main_push_may_deploy, null)
assert.equal((await inspectDeploymentSource(variables, token, fixture('HTTPS://github.com/guillermomottu/IsoTools.git', 'main'))).main_push_may_deploy, true)
assert.equal((await inspectDeploymentSource(variables, token, fixture('unknown-repository-format', 'main'))).main_push_may_deploy, null)
assert.equal((await inspectDeploymentSource(variables, token, fixture('GuillermoMottu/IsoTools', 'comm/our-tools'))).main_push_may_deploy, false)
assert.equal((await inspectDeploymentSource(variables, token, fixture('carcamfer/IsoTools', 'main'))).github_source_is_our_fork, false)
assert.equal((await inspectDeploymentSource(variables, token, fixture(null, undefined))).github_source_connected, false)
const rejected = await inspectDeploymentSource(variables, token, async () => Response.json({}, { status: 403 }))
assert.equal(rejected.source_query_succeeded, false)
assert.equal(rejected.main_push_may_deploy, null)
assert.equal((await inspectDeploymentSource({}, token, async () => assert.fail('invalid IDs cannot cause a request'))).source_query_succeeded, false)
assert.ok(!JSON.stringify(linked).includes(token) && !JSON.stringify(linked).includes(privateValue))
console.log('Deployment source: query only, no variable decryption, own-service filtering, main linkage, unknown state and sanitized output PASS (fixtures only)')
