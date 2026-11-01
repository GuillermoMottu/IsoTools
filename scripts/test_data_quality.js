import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { evaluatePlannedVsActual } from '../src/tools/compare_planned_vs_actual.js'
import { evaluateProjectProgress } from '../src/tools/track_project_progress.js'
import { consumerInput, evaluateConsumerInput, createToolConsumer } from '../src/services/toolConsumer.js'

const fixture = JSON.parse(await readFile(new URL('./fixtures/cpa_tpp_desarrollo.json', import.meta.url), 'utf8'))
const project = { ...fixture.project_context, project_id: 'QA-QUALITY', actual_progress_percent: 34 }
const compare = { organization_id: fixture.organization_id, analysis_id: 'QA-QUALITY', as_of_date: fixture.timestamp, plant_id: fixture.asset.plant_id, period: 'daily' }
for (const value of [false, true, '', ' ', [], [0], {}, { toString: null, valueOf: null }, null, Infinity, 'Infinity', '0x10']) {
  const metric = { metric_id: 'M1', name: 'Quality fixture', planned: value, actual: value, unit: 'items', direction: 'higher_is_better' }
  assert.equal(evaluatePlannedVsActual({ data: { ...compare, metrics: [metric] } }).status, 'not_calculable')
  assert.equal(evaluateProjectProgress({ data: { ...project, planned_progress_percent: value, actual_progress_percent: value } }).status, 'not_calculable')
}
for (const value of [0, 34, '34', ' 34.0 ', '3.4e1']) {
  assert.equal(evaluateProjectProgress({ data: { ...project, planned_progress_percent: value, actual_progress_percent: value } }).status, 'on_track')
}
const event = { seq: 1, event_id: 'qa-quality-input', timestamp: fixture.timestamp, asset: fixture.asset, metadata: { test: true }, event: { type: 'ERP_SALES_PERIOD_CLOSED' }, data: { ...fixture.sales_context, period: '2026-10-27', periodStart: '2026-10-27', periodEnd: '2026-10-27' } }
const tool = 'compare_planned_vs_actual'
for (const [config, changes, status] of [
  [{}, {}, 'sin_meta'],
  [{ organization_id: fixture.organization_id }, {}, 'sin_meta'],
  [{ organization_id: fixture.organization_id }, { as_of_date: 'invalid' }, 'not_calculable'],
  [{}, { as_of_date: 'invalid' }, 'not_calculable']
]) {
  const current = { ...event, data: { ...event.data, ...changes } }
  assert.equal(evaluateConsumerInput(tool, current, consumerInput(tool, current, config)).status, status)
}
const temp = await mkdtemp(path.join(os.tmpdir(), 'isotools-quality-'))
let posts = 0
try {
  const consumer = await createToolConsumer({ toolId: tool, apiUrl: 'https://fixture.invalid', apiKey: 'fixture-key', stateDir: temp, initialCursor: 0, logger: () => {}, fetcher: async (url, options) => {
    if (options.method === 'POST') { posts++; assert.fail('input with invalid date must never publish') }
    return Response.json({ consumer: tool, consumes: ['ERP_SALES_PERIOD_CLOSED'], events: [{ ...event, data: { ...event.data, as_of_date: 'invalid' } }], next_seq: 1 })
  } })
  assert.equal((await consumer.tick()).status, 'ready')
  assert.equal(posts, 0)
  assert.equal(consumer.snapshot().rejected[event.event_id].reason, 'input_not_calculable')
  assert.equal(consumer.snapshot().cursor, 1, 'quarantine is durable without blocking later inputs')
} finally { await rm(temp, { recursive: true, force: true }) }
console.log('Data quality: invalid numeric types rejected, decimal strings retained, sin_meta preserves unassigned organization but rejects invalid dates, quarantine without publication PASS')
