import assert from 'node:assert/strict'
import { comparisonDecision, metricExplanation, projectDecision, progressDifference, decisionAmount, decisionDate } from '../demo-frontend/src/decisionSummary.js'
import { runComparePlannedVsActualTool as compare, runTrackProjectProgressTool as track } from '../src/services/compareTrackDemoService.js'

const normal = compare({ scenario: 'on_track' }).result
assert.equal(normal.deviation_percent, 0)
assert.equal(comparisonDecision(normal).largest, 2.5, 'The observed difference must not disappear merely because it is within tolerance')
assert.equal(comparisonDecision(normal).attention.length, 0)
const deviation = comparisonDecision(compare({ scenario: 'deviation' }).result)
assert.equal(deviation.attention.length, 3)
assert.equal(deviation.metrics[0].metric_id, 'DEFECT_RATE')
assert.equal(deviation.metrics.at(-1).status, 'on_track')
assert.equal(comparisonDecision().largest, null)
assert.deepEqual(comparisonDecision().attention, [])
assert.match(comparisonDecision({ status: 'sin_meta' }).headline, /Falta una meta/)
assert.match(comparisonDecision({ status: 'not_calculable' }).headline, /Falta información/)
for (const direction of ['higher_is_better', 'lower_is_better', 'target_is_best']) {
  assert.match(metricExplanation({ status: 'sin_meta', direction }), /No hay una meta aprobada/)
  for (const status of ['not_calculable', 'pending', undefined]) assert.match(metricExplanation({ status, direction }), /confirma los datos/)
  assert.match(metricExplanation({ status: 'on_track', direction }), /Dentro de la tolerancia/)
}
assert.match(metricExplanation({ status: 'critical', direction: 'higher_is_better' }), /por debajo/)
assert.match(metricExplanation({ status: 'deviation', direction: 'lower_is_better' }), /supera el máximo/)
assert.match(metricExplanation({ status: 'deviation', direction: 'target_is_best' }), /se aleja del objetivo/)
assert.equal(progressDifference(30, 50), '20 puntos por delante del plan')
assert.equal(progressDifference(50, 30), '20 puntos por debajo del plan')
assert.equal(progressDifference(30, 30), 'Al nivel del plan')
assert.equal(progressDifference(null, 30), 'Sin avance comparable')
for (const absent of [null, undefined, '', false, NaN]) assert.equal(decisionAmount(absent, 'MXN'), 'No disponible')
assert.match(decisionAmount(28000, 'MXN'), /28,000/)
assert.match(decisionAmount(0, 'MXN'), /0/)
assert.match(decisionAmount(10), /moneda no indicada/)
assert.equal(decisionDate('2026-11-10T00:00:00.000Z'), '10/11/2026', 'A milestone calendar day must not move to the previous date in Mexico')
assert.equal(decisionDate('2026-11-10'), '10/11/2026')
assert.equal(decisionDate('invalid'), 'No disponible')

const input = {
  ...track({ scenario: 'on_track' }).input,
  as_of_date: '2026-07-23',
  milestones: [
    { milestone_id: 'COMPLETED', name: 'Finalizado', status: 'completed', critical: true, due_date: '2026-07-01' },
    { milestone_id: 'CANCELLED', name: 'Cancelado', status: 'cancelled', critical: true, due_date: '2026-07-01' },
    { milestone_id: 'LATE', name: 'Vencido', status: 'pending', critical: true, due_date: '2026-07-22' },
    { milestone_id: 'BLOCKED', name: 'Bloqueado', status: 'blocked', due_date: '2026-07-25' },
    { milestone_id: 'NEXT', name: 'Próximo', status: 'pending', due_date: '2026-07-24' }
  ]
}
const result = track({ input }).result
const project = projectDecision(input, result)
assert.equal(project.open.length, 3)
assert.equal(project.overdue.length, 1)
assert.equal(project.blocked.length, 1)
assert.equal(project.critical.length, 1)
assert.equal(project.upcoming.id, 'NEXT')
assert.equal(project.headline, 'Hay compromisos críticos vencidos')
const missing = projectDecision({ as_of_date: '2026-07-23' }, { status: 'not_calculable' })
assert.equal(missing.visual.actualProgress, null)
assert.match(missing.headline, /Falta información/)
assert.equal(missing.upcoming, null)
console.log('Decision summaries: priorities, real differences, missing information, money and milestone deadlines PASS')
