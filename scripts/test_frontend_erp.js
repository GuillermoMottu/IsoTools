import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readErpRecords, selectErpRecord } from '../demo-frontend/src/useErpRecord.js'
const records = { P1: { project_id: 'P1', organization_id: 'ERP', project_name: 'Real' }, P2: { project_id: 'P2' } }
const fetcher = async (path, options) => {
  assert.equal(path, '/api/records')
  assert.equal(options.cache, 'no-store')
  return { ok: true, json: async () => records }
}
assert.deepEqual(await readErpRecords('track_project_progress', fetcher), records)
assert.equal(selectErpRecord(records, 'P1'), records.P1)
assert.equal(selectErpRecord(records, 'missing'), null)
assert.equal(selectErpRecord(records, '__proto__'), null)
assert.equal(selectErpRecord(records, ''), null)
assert.equal(selectErpRecord({ P1: records.P1 }, ''), records.P1)
assert.equal(selectErpRecord({}, ''), null)
await assert.rejects(readErpRecords('track_project_progress', async () => ({ ok: false })), /ERP/)
for (const body of [null, [], { P1: { project_id: 'P2' } }]) {
  await assert.rejects(readErpRecords('track_project_progress', async () => ({ ok: true, json: async () => body })))
}
assert.deepEqual(await readErpRecords('compare_planned_vs_actual', async path => {
  assert.equal(path, '/api/analyses')
  return { ok: true, json: async () => ({ A1: { analysis_id: 'A1' } }) }
}), { A1: { analysis_id: 'A1' } })
const app = readFileSync('demo-frontend/src/App.jsx', 'utf8')
for (const title of ['Datos del proyecto', 'Datos de comparaci\u00f3n']) {
  const block = app.slice(app.indexOf(`<Panel title="${title}"`)).split('</Panel>')[0]
  assert.ok(block.includes('<ErpValue'))
  assert.equal(/<(Input|input|select|textarea)\b|onChange=/.test(block), false)
}
assert.equal(app.includes('scenarioPayload'), false)
console.log('ERP source, identity, selection and read-only panels smoke OK')

const { erpSummary } = await import('../demo-frontend/src/useErpRecord.js')
assert.deepEqual(erpSummary({}, 'track_project_progress').map(item => item.value), [0, 0, 0, 0])
const projects = { A: { milestones: [{ status: 'pending' }] }, B: { milestones: [{ status: 'completed' }, { status: 'pending' }] }, C: { milestones: [{ status: 'completed' }] }, D: {} }
assert.deepEqual(erpSummary(projects, 'track_project_progress').map(item => item.value), [4, 1, 1, 1])
const analyses = { A: { plant_id: 'P1', metrics: [{}, {}] }, B: { plant_id: 'P1', metrics: [] }, C: { plant_id: 'P2', metrics: [{}] } }
assert.deepEqual(erpSummary(analyses, 'compare_planned_vs_actual').map(item => item.value), [3, 2, 3, 1])
const progress = app.slice(app.indexOf('function ProgressPair')).split('function ProgressBar')[0]
assert.ok(progress.includes('tone="budget"'))
assert.equal(progress.includes('El gasto supera'), false)
console.log('ERP overview counts, empty state and separate budget color PASS')

const budgetPanel = app.slice(app.indexOf('<Panel title="Avance y presupuesto"')).split('</Panel>')[0]
assert.equal(/<(Input|input|select|textarea)\b|onChange=/.test(budgetPanel), false)
assert.equal(app.includes('Avances: porcentaje del proyecto completado.'), false)
