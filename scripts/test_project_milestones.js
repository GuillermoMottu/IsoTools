import assert from 'node:assert/strict'
import { completedMilestonePercent, isMilestoneOverdue } from '../src/utils/projectMilestones.js'
import { deriveProjectVisualModel } from '../demo-frontend/src/visualModels.js'
import { runTrackProjectProgressTool } from '../src/services/compareTrackDemoService.js'
import { runTrackProjectProgress, localToday } from '../demo-frontend/src/api.js'
const milestones = [
  { milestone_id: 'M1', name: 'Hito 1', status: 'pending', due_date: '2026-10-03' },
  { milestone_id: 'M2', name: 'Hito 2', status: 'pending', due_date: '2026-10-04' }
]
assert.equal(completedMilestonePercent(milestones), 0)
const half = milestones.map((item, index) => ({ ...item, status: index === 0 ? 'completed' : 'pending' }))
assert.equal(completedMilestonePercent(half), 50)
assert.equal(completedMilestonePercent(half.map(item => ({ ...item, status: 'completed' }))), 100)
assert.equal(completedMilestonePercent([...half, { status: 'cancelled' }]), 50)
assert.equal(completedMilestonePercent([{ status: 'completed' }, { status: 'cancelled' }]), 100)
assert.equal(completedMilestonePercent([]), null)
assert.equal(completedMilestonePercent([{ status: 'cancelled' }]), null)
for (const date of ['2026-10-01', '2026-10-03T12:00:00Z', '2026-10-03T23:59:59.999Z']) assert.equal(isMilestoneOverdue(milestones[0], date), false)
assert.equal(isMilestoneOverdue(milestones[0], '2026-10-04'), true)
assert.equal(isMilestoneOverdue({ ...milestones[0], status: 'cancelled' }, '2026-10-05'), false)
const input = { project_id: 'TEST', organization_id: 'ORG', project_name: 'Proyecto', as_of_date: '2026-10-01', planned_start_date: '2026-09-01', planned_end_date: '2026-12-01', planned_progress_percent: 20, actual_progress_percent: 0, milestones }
for (const date of ['2026-10-01', '2026-10-03']) {
  const evaluated = runTrackProjectProgressTool({ input: { ...input, as_of_date: date } })
  assert.equal(evaluated.result.milestone_summary.overdue, 0)
  assert.equal(deriveProjectVisualModel({ ...input, as_of_date: date }, evaluated.result).milestones.filter(item => item.isOverdue).length, 0)
}
const futureInput = { ...input, as_of_date: '2026-10-05T14:30:00Z' }
const originalFetch = globalThis.fetch
let sent
try {
  globalThis.fetch = async (_path, options) => {
    sent = JSON.parse(options.body).input
    return Response.json(runTrackProjectProgressTool({ input: sent }))
  }
  await runTrackProjectProgress({ input: futureInput })
  assert.equal(sent.as_of_date, localToday())
  assert.equal(futureInput.as_of_date, '2026-10-05T14:30:00Z')
} finally { globalThis.fetch = originalFetch }
console.log('Milestone 0/50/100 progress, cancelled exclusions, full due day and live evaluation date PASS')
