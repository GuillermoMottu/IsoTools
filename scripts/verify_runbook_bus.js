import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, appendFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { createToolConsumer, TOOL_CONTRACTS } from '../src/services/toolConsumer.js'

const apiUrl = 'https://api-events.orcalabs.mx/api/v1'
const key = process.env.ISOTOOLS_API_KEY
if (!key) throw new Error('missing_central_key')
const dir = await mkdtemp(path.join(os.tmpdir(), 'isotools-qa-bus-'))
const now = new Date().toISOString()
const date = now.slice(0, 10)
const prefix = `qa-runbook-${randomUUID()}`
const outputIds = new Set()
const selected = Object.keys(TOOL_CONTRACTS).filter(toolId => !process.env.TOOL_SELECTED || process.env.TOOL_SELECTED === 'all' || process.env.TOOL_SELECTED === toolId)
assert.ok(selected.length > 0, 'known tool selection is required')
const report = { test_prefix: prefix, execution: 'isolated_runner_using_tool_consumer', deployed_consumers_changed: false, tests: [] }
async function request (route, output) {
  if (output) assert.equal(output.metadata?.test, true, 'only explicitly marked test events may be published')
  const response = await fetch(apiUrl + route, { method: output ? 'POST' : 'GET', headers: { 'x-api-key': key, ...(output ? { 'content-type': 'application/json' } : {}) }, ...(output ? { body: JSON.stringify(output) } : {}), redirect: 'error', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`central_http_${response.status}`)
  let payload
  try { payload = await response.json() } catch { throw new Error('central_invalid_json') }
  return { payload, status: response.status }
}
try {
  for (const toolId of selected) {
    const contract = TOOL_CONTRACTS[toolId]
    const catalog = (await request(`/catalog/tools/${toolId}`)).payload
    assert.ok(catalog.consumes.includes(contract.consumes), 'central input contract matches')
    assert.ok(catalog.produces.includes(contract.produces), 'central output contract matches')
    const latest = (await request(`/events/latest?type=${contract.consumes}`)).payload
    const cursor = latest.max_seq ?? 0
    const inputId = `${prefix}-${toolId}`
    const data = toolId === 'compare_planned_vs_actual'
      ? { module: 'sales', period: date, periodStart: date, periodEnd: date, plantId: 'plant_01', actual: '152340.50', unit: 'MXN', documentos: '41', unidades: '380', devuelto: '0', erpType: 'microsip' }
      : { organization_id: 'QA-RUNBOOK', project_id: `QA-PROJECT-${prefix}`, project_name: 'Prueba de integración — sin proyecto real', as_of_date: now, planned_start_date: new Date(Date.now() - 86400000).toISOString(), planned_end_date: new Date(Date.now() + 30 * 86400000).toISOString(), planned_progress_percent: 40, actual_progress_percent: 34, milestones: [], target_type: 'order', target_ids: [`QA-ORDER-${prefix}`] }
    const input = { event_id: inputId, timestamp: now, platform_version: '2.0', module: { id: 'qa_runbook', version: '1.0.0' }, asset: { asset_id: 'erp-microsip-01', asset_type: 'erp', plant_id: 'plant_01' }, event: { type: contract.consumes, category: toolId === 'compare_planned_vs_actual' ? 'productivity' : 'system', severity: 'low' }, data, correlation_id: inputId, metadata: { test: true } }
    if (toolId === 'track_project_progress') Object.assign(data, { projectId: data.project_id, targetType: data.target_type, targetIds: data.target_ids })
    const inserted = await request('/events', input)
    assert.equal(inserted.payload.status, 'accepted')
    let publications = 0
    const settings = { toolId, apiUrl, apiKey: key, initialCursor: cursor, stateDir: path.join(dir, toolId), logger: entry => console.log(JSON.stringify(entry)), fetcher: async (url, options) => {
      if (options.method === 'POST') {
        const output = JSON.parse(options.body)
        assert.equal(output.correlation_id, inputId)
        assert.equal(output.causation_id, inputId)
        assert.equal(output.metadata?.test, true)
        const published = await request('/events', output)
        publications++
        outputIds.add(output.event_id)
        return Response.json(published.payload, { status: published.status })
      }
      assert.ok(url.startsWith(`${apiUrl}/events/subscriptions/${toolId}?`))
      const result = await request(url.slice(apiUrl.length))
      const batch = result.payload
      // This runner sees only its own QA event. It never processes real production inputs.
      return Response.json({ ...batch, events: batch.events.filter(event => event.event_id === inputId) })
    } }
    let consumer = await createToolConsumer(settings)
    for (let attempt = 0; attempt < 6 && !consumer.snapshot().last_publication; attempt++) {
      await consumer.tick()
      if (!consumer.snapshot().last_publication) await setTimeout(2000)
    }
    const snapshot = consumer.snapshot()
    assert.equal(publications, 1, 'one publication for the QA event')
    assert.equal(snapshot.last_publication.http_status, 201)
    consumer = await createToolConsumer(settings)
    await consumer.tick()
    assert.equal(publications, 1, 'restart uses persisted cursor without publishing again')
    const chain = (await request(`/events/chain/${inputId}`)).payload
    assert.ok(chain.events.some(event => event.event_id === inputId))
    assert.ok(chain.events.some(event => event.event_id === snapshot.last_publication.event_id && (event.module_id || event.module?.id) === toolId))
    report.tests.push({ tool: toolId, input_event_id: inputId, output_event_id: snapshot.last_publication.event_id, output_status: snapshot.last_evaluation.result.status, post_http_status: 201, restart_duplicate: false, chain_verified: true, correlation_id: inputId })
  }
  assert.equal(outputIds.size, selected.length)
  console.log(JSON.stringify(report, null, 2))
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### Runbook: pruebas marcadas en bus central\n\nEste runner usa el consumidor de la tool de forma aislada; no activa los servicios desplegados ni prueba su volumen Railway.\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`)
} catch (error) {
  const code = /^central_http_\d+$/.test(error.message) ? error.message : 'runbook_bus_validation_failed'
  console.error(JSON.stringify({ error: code, test_prefix: prefix, completed_tools: report.tests.map(test => test.tool) }))
  process.exitCode = 1
} finally { await rm(dir, { recursive: true, force: true }) }
