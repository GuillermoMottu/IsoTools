import assert from 'node:assert/strict'
import { explainResult, fieldError } from '../demo-frontend/src/resultExplanation.js'
import { runComparePlannedVsActualTool as compare, runTrackProjectProgressTool as track } from '../src/services/compareTrackDemoService.js'
const critical = compare({ scenario: 'critical' })
assert.ok(explainResult(critical.input, critical.result).every(line => line.includes('plan') && line.includes('real')))
const risk = track({ scenario: 'at_risk' })
const explanation = explainResult(risk.input, risk.result)
assert.ok(explanation.some(line => line.includes('puntos porcentuales')))
assert.ok(explanation.some(line => line.includes('Presupuesto consumido')))
assert.ok(explanation.some(line => line.includes('Hito crítico vencido')))
const missing = track({ scenario: 'validation' })
assert.equal(fieldError(missing.result, 'project_name'), 'Completa este campo.')
assert.ok(explainResult(missing.input, missing.result)[0].includes('No se pudo evaluar'))
const invalid = track({ input: { ...risk.input, actual_progress_percent: 101 } })
assert.ok(fieldError(invalid.result, 'actual_progress_percent').includes('0 y 100'))
assert.deepEqual(explainResult({}, null), [])
console.log('Result explanations and field errors smoke OK')
const { cellError } = await import('../demo-frontend/src/resultExplanation.js')
assert.equal(cellError('', 'name', false), '')
assert.ok(cellError('', 'name', true).includes('Completa'))
assert.equal(cellError(0, 'actual', true), '')
assert.ok(cellError('bad', 'actual', true).includes('número'))
assert.ok(cellError(-1, 'weight', true).includes('número'))
assert.equal(cellError(undefined, 'weight', true), '')
assert.ok(cellError('bad', 'due_date', true).includes('fecha'))
console.log('Table cell messages smoke OK')

const { fieldName, confidenceLabel, warningText, unitLabel, unitCode } = await import('../demo-frontend/src/resultExplanation.js')
assert.equal(confidenceLabel('high'), 'Alta')
assert.equal(confidenceLabel('medium'), 'Media')
assert.equal(confidenceLabel('low'), 'Baja')
assert.equal(confidenceLabel('unknown'), 'No disponible')
assert.equal(fieldName('metrics[1].planned'), 'Indicador 2: Valor planificado')
assert.equal(fieldName('milestones[0].due_date'), 'Hito 1: Fecha de compromiso')
assert.equal(fieldName('unknown_field'), 'Dato por revisar')
assert.equal(unitLabel('percent'), '%')
assert.equal(unitLabel('units'), 'unidades')
assert.equal(unitLabel('kg'), 'kg')
assert.equal(unitCode('%'), 'percent')
assert.equal(unitCode('kg'), 'kg')
const warnings = [
  'budget requires planned_amount > 0 and non-negative finite actual_amount',
  'as_of_date must be a valid date',
  'planned_start_date must be before planned_end_date',
  'actual_progress_percent must be between 0 and 100',
  'thresholds.deviation_percent must be a non-negative finite number',
  'thresholds.deviation_percent must be less than or equal to thresholds.critical_percent',
  'milestones[0] must be a milestone with an id, name, valid due date and status',
  'weight must be a non-negative finite number; defaulted to 1',
  'weighted deviation could not be calculated because total weight is zero',
  'invalid direction: wrong',
  'planned is zero and actual is non-zero; relative variance is not calculable in v1'
]
for (const warning of warnings) {
  const visible = warningText(warning)
  assert.notEqual(visible, warning)
  assert.equal(/must|requires|planned_amount|progress_percent|thresholds\.|milestones\[|defaulted|invalid direction/.test(visible), false)
}
assert.ok(warningText('unknown backend code').includes('Revisa los datos'))
for (const response of [compare({ scenario: 'on_track' }), compare({ scenario: 'critical' })]) {
  for (const line of explainResult(response.input, response.result)) assert.equal(/\bpercent\b|\bunits\b/.test(line), false)
}
const { requestErrorLabel } = await import('../demo-frontend/src/api.js')
for (const status of [400, 401, 403, 429, 500]) assert.equal(/authentication_required|insufficient_role|Rate limit|Request failed/.test(requestErrorLabel(status)), false)
console.log('Spanish labels, confidence, units, nested fields, warnings and request errors PASS')
