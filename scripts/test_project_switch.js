import assert from 'node:assert/strict'
import { runTrackProjectProgressTool, runComparePlannedVsActualTool } from '../src/services/compareTrackDemoService.js'
import { deriveProjectVisualModel, progressBarWidth } from '../demo-frontend/src/visualModels.js'
import { evaluationForRecord } from '../demo-frontend/src/api.js'
import { evaluationReducer } from '../demo-frontend/src/useToolEvaluation.js'
const first = { organization_id: 'ERP', project_id: 'A', project_name: 'A', as_of_date: '2026-10-01', planned_start_date: '2026-09-01', planned_end_date: '2026-12-01', planned_progress_percent: 80, actual_progress_percent: 60, budget: { planned_amount: 1000, actual_amount: 1200 }, milestones: [] }
const second = { ...first, project_id: 'B', project_name: 'B', planned_progress_percent: 30, actual_progress_percent: 30 }
delete second.budget
delete second.milestones
const a = runTrackProjectProgressTool({ input: first })
const b = runTrackProjectProgressTool({ input: second })
assert.deepEqual(a.input, first)
assert.deepEqual(b.input, second)
assert.equal(b.result.project_id, 'B')
assert.equal(b.result.budgetUsedPercent, null)
assert.equal(b.result.milestonesTotal, 0)
const aView = deriveProjectVisualModel(a.input, a.result)
assert.equal(aView.budgetUsedPercent, 120)
assert.equal(aView.budgetOverrunPercent, 20)
assert.equal(aView.budgetBarTone, 'danger')
assert.equal(progressBarWidth(aView.budgetUsedPercent, true), 100)
const view = deriveProjectVisualModel(b.input, b.result)
assert.equal(view.plannedProgress, 30)
assert.equal(view.actualProgress, 30)
assert.equal(view.budgetUsedPercent, null)
assert.equal(progressBarWidth(view.budgetUsedPercent, true), null)
assert.equal(evaluationForRecord(b, second, 'project_id'), b)
assert.throws(() => evaluationForRecord(a, second, 'project_id'), /otro registro/)
const stateB = evaluationReducer({ input: first, response: a, loading: true, requestId: 1 }, { type: 'edit', input: second })
assert.equal(stateB.response, null)
assert.equal(evaluationReducer(stateB, { type: 'success', id: 1, response: a }), stateB)
const incomplete = runTrackProjectProgressTool({ input: { project_id: 'C' } })
assert.equal(incomplete.result.status, 'not_calculable')
assert.deepEqual(incomplete.input, { project_id: 'C' })
assert.deepEqual(runComparePlannedVsActualTool({ input: { analysis_id: 'D' } }).input, { analysis_id: 'D' })
for (const value of [null, '', -1, 101, Infinity, false]) assert.equal(progressBarWidth(value), null)
assert.equal(progressBarWidth(0), 0)
assert.equal(progressBarWidth('30'), 30)
assert.equal(deriveProjectVisualModel({ budget: null }).budgetUsedPercent, null)
const relaxed = deriveProjectVisualModel({ ...first, actual_progress_percent: 70, thresholds: { at_risk_delay_percent: 10, delayed_percent: 20 } })
assert.equal(relaxed.scheduleBarTone, 'success')
console.log('Project switch isolation, no sample defaults, stale results and progress bars PASS')
