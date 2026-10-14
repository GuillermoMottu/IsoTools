import assert from 'node:assert/strict'
import { handler as generate } from '../src/tools/generate_kpis.js'
import { handler as track } from '../src/tools/track_project_progress.js'
import { handler as compare } from '../src/tools/compare_planned_vs_actual.js'
import { runTrackProjectProgressTool, runComparePlannedVsActualTool } from '../src/services/compareTrackDemoService.js'
import { validateEventPayload } from '../src/services/validationService.js'
import { randomUUID } from 'node:crypto'
for (const scenario of ['on_track', 'at_risk', 'delayed', 'validation']) {
  const input = runTrackProjectProgressTool({ scenario }).input
  const report = generate({ asset: { asset_id: 'PRJ-DEMO', plant_id: 'plant_01' }, data: input })
  assert.equal(report.event.type, 'KPI_REPORT_GENERATED')
  assert.equal(report.data.project_id, input.project_id)
  const envelope = { ...report, event_id: randomUUID(), timestamp: new Date().toISOString(), platform_version: '2.0', module: { id: 'generate_kpis', version: '1.0.0' }, correlation_id: randomUUID() }
  assert.equal(validateEventPayload(envelope).valid, true)
  const output = track(envelope)
  if (['on_track', 'validation'].includes(scenario)) assert.equal(output, null)
  else {
    assert.equal(output.event.type, 'PROJECT_AT_RISK')
    assert.equal(output.data.status, scenario)
    assert.equal(output.data.project_id, input.project_id)
  }
}
const project = runTrackProjectProgressTool({ scenario: 'at_risk' }).input
const production = runComparePlannedVsActualTool({ scenario: 'deviation' }).input
const variance = compare({ asset: { asset_id: 'LINE-DEMO', plant_id: 'plant_01' }, data: { ...production, ...project } })
const report = generate(variance)
assert.equal(report.data.project_id, project.project_id)
assert.equal(report.data.planned_start_date, project.planned_start_date)
assert.equal(report.data.actual_progress_percent, project.actual_progress_percent)
assert.equal(track(report).data.project_id, project.project_id)
console.log('KPI/project contract smoke OK; supplied real project context survives Compare -> KPIs -> Track')
