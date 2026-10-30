import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { resolveProjectContext } from '../src/utils/projectContext.js'
import { createToolConsumer } from '../src/services/toolConsumer.js'
import { replayToolsReadonly } from './replay_tools_readonly.js'

const configUrl = new URL('./fixtures/tpp_projects.development.json', import.meta.url)
const config = JSON.parse(await readFile(configUrl, 'utf8'))
const before = structuredClone(config)
const full = resolveProjectContext({ projectId: 'QA-PRJ-ISO' }, config)
assert.equal(full.project_id, 'QA-PRJ-ISO')
assert.equal(full.actual_progress_percent, 34)
assert.equal(full.test, true)
assert.equal(resolveProjectContext({ projectId: 'QA-PRJ-ISO', actualProgressPercent: 15 }, config).actual_progress_percent, 15)
assert.equal(resolveProjectContext({ project_id: 'QA-PRJ-ISO', actual_progress_percent: null }, config).actual_progress_percent, null)
assert.equal(resolveProjectContext({ projectId: 'unknown' }, config).project_name, undefined)
assert.equal(resolveProjectContext({ projectId: 'toString' }, config).project_name, undefined)
assert.equal(resolveProjectContext({}, config).project_id, undefined)
assert.equal(resolveProjectContext({ projectId: 42 }, config).project_name, undefined)
assert.deepEqual(config, before)
for (const projects of [null, [], { 'QA-PRJ-ISO': null }, { 'QA-PRJ-ISO': { project_id: 'OTHER' } }]) {
  assert.throws(() => resolveProjectContext({ projectId: 'QA-PRJ-ISO' }, { projects }), /invalid_project_context/)
}
const ajv = new Ajv({ strict: false })
addFormats(ajv)
const tools = JSON.parse(await readFile(new URL('../src/data/agents/tools.json', import.meta.url), 'utf8'))
const validate = ajv.compile(tools.find(tool => tool.id === 'track_project_progress').inputSchema)
assert.equal(validate({ projectId: 'QA-PRJ-ISO' }), true)
assert.equal(validate({ project_id: 'QA-PRJ-ISO' }), true)
assert.equal(validate({}), false)
assert.equal(validate({ projectId: '' }), false)

const temp = await mkdtemp(path.join(os.tmpdir(), 'isotools-project-'))
let server, app
try {
  const toolId = 'track_project_progress'
  const outputs = []
  const row = { seq: 1, event_id: 'fixture-project-input', timestamp: '2026-10-29T12:00:00Z', module_id: 'generate_kpis', asset_id: 'QA-ERP', plant_id: 'QA-PLANT', event_type: 'KPI_REPORT_GENERATED', correlation_id: 'fixture-project-chain', data: { projectId: 'QA-PRJ-ISO' } }
  const consumer = await createToolConsumer({
    toolId,
    apiUrl: 'https://fixture.invalid',
    apiKey: 'fixture-central-key',
    stateDir: path.join(temp, 'consumer'),
    businessConfigFile: fileURLToPath(configUrl),
    initialCursor: 0,
    logger: () => {},
    fetcher: async (url, options) => {
      assert.equal(new URL(url).origin, 'https://fixture.invalid')
      if (options.method === 'POST') {
        const output = JSON.parse(options.body)
        outputs.push(output)
        return Response.json({ status: 'accepted', event_id: output.event_id }, { status: 201 })
      }
      return Response.json({ consumer: toolId, consumes: ['KPI_REPORT_GENERATED'], events: [row], next_seq: 1 })
    }
  })
  assert.equal((await consumer.tick()).status, 'ready')
  assert.equal(outputs.length, 1)
  assert.equal(outputs[0].data.status, 'at_risk')
  assert.equal(outputs[0].causation_id, row.event_id)
  assert.equal(outputs[0].metadata.test, true, 'configured synthetic project cannot produce unmarked business evidence')
  const replay = await replayToolsReadonly({
    apiKey: 'fixture-read-key',
    businessConfig: config,
    selectedTool: toolId,
    fetcher: async (url, options) => {
      assert.equal(options.method, 'GET')
      return Response.json(url.includes('/subscriptions/')
        ? { consumer: toolId, consumes: ['KPI_REPORT_GENERATED'], events: [row], next_seq: 1 }
        : { events: [{ module_id: 'erp_connector', event_type: 'ERP_SALES_PERIOD_CLOSED' }, { module_id: toolId, event_type: 'PROJECT_AT_RISK', event_id: 'fixture-output', causation_id: row.event_id, data: { status: 'at_risk' } }] })
    }
  })
  assert.equal(replay.tools[0].baseline.status, 'at_risk')
  assert.equal(replay.tools[0].configured_context_is_test, true)
  assert.equal(replay.tools[0].acceptance, 'requires_review')

  Object.assign(process.env, { NODE_ENV: 'test', OIDC_ISSUER: '', ISSUER_ENDPOINT: '', OIDC_CLIENT_ID: '', OIDC_CLIENT_SECRET: '', APP_ID: '', APP_SECRETS: '', TOOL_API_KEY: 'fixture-project-machine-key' })
  const { createToolApp } = await import('../src/tool-server.js')
  app = await createToolApp({ TOOL_PAGE_ID: toolId, TOOL_STATE_DIR: path.join(temp, 'api'), TOOL_BUSINESS_CONFIG_FILE: fileURLToPath(configUrl), WEB_DIST_DIR: path.join(temp, 'absent-dist') })
  server = http.createServer(app.app)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const endpoint = `http://127.0.0.1:${server.address().port}/api/tool/${toolId}/run`
  const run = input => fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'fixture-project-machine-key' }, body: JSON.stringify({ input }) })
  const state = app.consumer.snapshot()
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"input":{"projectId":"QA-PRJ-ISO"}}' })).status, 401)
  const response = await run({ projectId: 'QA-PRJ-ISO' })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).result.status, 'at_risk')
  const delayed = await run({ projectId: 'QA-PRJ-ISO', actualProgressPercent: 15 })
  assert.equal((await delayed.json()).result.status, 'delayed')
  const missing = await run({ projectId: 'UNKNOWN' })
  assert.equal(missing.status, 400)
  assert.equal((await missing.json()).result.status, 'not_calculable')
  assert.equal((await run({ projectId: 42 })).status, 400)
  const explicitNull = await run({ projectId: 'QA-PRJ-ISO', actual_progress_percent: null })
  assert.equal(explicitNull.status, 400, 'explicit invalid facts are not replaced by configured values')
  assert.deepEqual(app.consumer.snapshot(), state, 'API evaluation does not publish or move the consumer cursor')
  app.stop()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  app = await createToolApp({ TOOL_PAGE_ID: toolId, TOOL_STATE_DIR: path.join(temp, 'consumer'), WEB_DIST_DIR: path.join(temp, 'absent-dist') })
  server = http.createServer(app.app)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const cachedState = app.consumer.snapshot()
  const cached = await fetch(`http://127.0.0.1:${server.address().port}/api/tool/${toolId}/run`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'fixture-project-machine-key' }, body: '{"input":{"projectId":"QA-PRJ-ISO"}}' })
  assert.equal(cached.status, 200, 'persisted project context works without a config file')
  assert.equal((await cached.json()).result.status, 'at_risk')
  assert.deepEqual(app.consumer.snapshot(), cachedState)
  const nextRow = { ...row, seq: 2, event_id: 'fixture-cached-update', data: { projectId: 'QA-PRJ-ISO', actualProgressPercent: 15 } }
  const resumed = await createToolConsumer({ toolId, apiUrl: 'https://fixture.invalid', apiKey: 'fixture-central-key', stateDir: path.join(temp, 'consumer'), logger: () => {}, fetcher: async (url, options) => {
    if (options.method === 'POST') {
      const output = JSON.parse(options.body)
      assert.equal(output.data.status, 'delayed')
      assert.equal(output.metadata.test, true, 'cached test context keeps test lineage')
      return Response.json({ status: 'accepted', event_id: output.event_id }, { status: 201 })
    }
    return Response.json({ consumer: toolId, consumes: ['KPI_REPORT_GENERATED'], events: [nextRow], next_seq: 2 })
  } })
  assert.equal((await resumed.tick()).status, 'ready')
  assert.equal(resumed.snapshot().cursor, 2)
  assert.equal(resumed.snapshot().last_evaluation.result.status, 'delayed')
  assert.deepEqual(resumed.snapshot().records['QA-PRJ-ISO'].source.source_record_ids, [nextRow.event_id, row.event_id], 'cached context retains its source event alongside the new trigger')
  console.log('Project context lookup: projectId-only API/consumer/replay, alias precedence, missing/invalid context, test lineage and no API publications PASS')
} finally {
  app?.stop()
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()))
  assert.ok(path.basename(temp).startsWith('isotools-project-'))
  await rm(temp, { recursive: true, force: true })
}
