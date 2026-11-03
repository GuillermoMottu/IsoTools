import assert from 'node:assert/strict'
import { datetimeLocal, fromDatetimeLocal, healthResponseIsOnline, comparisonPlot } from '../demo-frontend/src/displayValues.js'
import { deriveOperationalVisualModel, deriveProjectVisualModel } from '../demo-frontend/src/visualModels.js'
process.env.TZ = 'America/Mexico_City'
assert.equal(datetimeLocal('2026-07-23T12:00:00Z'), '2026-07-23T06:00')
for (const iso of ['2026-07-23T12:00:00Z', '2026-10-01T01:00:00Z']) assert.equal(fromDatetimeLocal(datetimeLocal(iso)), new Date(iso).toISOString())
assert.equal(datetimeLocal('bad'), '')
assert.equal(fromDatetimeLocal('bad'), '')
assert.equal(fromDatetimeLocal(''), '')
for (const value of ['', ' ', null, undefined, false, []]) {
  const model = deriveOperationalVisualModel({ metrics: [{ planned: value, actual: value, direction: 'target' }] })
  assert.equal(model.metrics[0].planned, null)
  assert.equal(model.metrics[0].actual, null)
  assert.equal(deriveProjectVisualModel({ actual_progress_percent: value }).actualProgress, null)
}
assert.equal(deriveProjectVisualModel({ actual_progress_percent: 0 }).actualProgress, 0)
assert.equal(deriveOperationalVisualModel({}, { weighted_deviation_percent: null }).weightedDeviationPercent, null)
assert.equal(await healthResponseIsOnline(new Response('<html/>', { headers: { 'content-type': 'text/html' } })), false)
assert.equal(await healthResponseIsOnline(Response.json({ status: 'ok', service: 'isotools-tool' })), true)
assert.equal(await healthResponseIsOnline(Response.json({ status: 'ok', service: 'unrelated' })), false)
assert.equal(await healthResponseIsOnline(Response.json({ status: 'ok', service: 'isotools' }, { status: 503 })), false)
assert.equal(await healthResponseIsOnline(new Response('{', { headers: { 'content-type': 'application/json' } })), false)
console.log('Frontend dates, missing values and health smoke OK')
assert.deepEqual(comparisonPlot(100, 80), { zero: 0, planned: { start: 0, width: 100 }, actual: { start: 0, width: 80 } })
assert.deepEqual(comparisonPlot(-100, -50), { zero: 100, planned: { start: 0, width: 100 }, actual: { start: 50, width: 50 } })
assert.deepEqual(comparisonPlot(-50, 50), { zero: 50, planned: { start: 0, width: 50 }, actual: { start: 50, width: 50 } })
assert.deepEqual(comparisonPlot(0, 0), { zero: 0, planned: { start: 0, width: 0 }, actual: { start: 0, width: 0 } })
for (const missing of [null, undefined, '', false, NaN, Infinity]) assert.equal(comparisonPlot(missing, 100), null)
assert.equal(comparisonPlot(-Number.MAX_VALUE, Number.MAX_VALUE), null)
console.log('Comparison graphics: shared scale, signed amounts, zero and absent values PASS')
