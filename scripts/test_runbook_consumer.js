import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createToolConsumer, salesInput, subscriptionEvent } from '../src/services/toolConsumer.js'

const temp = await mkdtemp(path.join(os.tmpdir(), 'isotools-runbook-'))
const toolId = 'compare_planned_vs_actual'
const row = (seq, id, actual) => ({ seq, event_id: id, correlation_id: 'qa-chain', timestamp: '2026-10-14T01:00:00Z', module_id: 'qa_runbook', asset_id: 'erp-microsip-01', plant_id: 'plant_01', event_type: 'ERP_SALES_PERIOD_CLOSED', metadata: { test: true }, data: { module: 'sales', period: '2026-10-13', periodStart: '2026-10-13', periodEnd: '2026-10-13', plantId: 'plant_01', actual, unit: 'MXN', devuelto: '100', erpType: 'microsip' } })
const rows = [row(1, 'qa-invalid', 'N/A'), row(2, 'qa-missing', undefined), row(3, 'qa-good', '152340.50'), row(4, 'qa-same-period', '152340.50'), row(5, 'qa-correction', '160000.00'), row(6, 'qa-correction', '999999')]
const attempts = [], logs = [], accepted = new Set()
let failOnce = true
const settings = { toolId, apiUrl: 'https://fixture.invalid/api/v1', apiKey: 'fixture-key-not-for-logs', stateDir: temp, initialCursor: 0, logger: entry => logs.push(entry), fetcher: async (url, options) => {
  assert.equal(options.headers['x-api-key'], 'fixture-key-not-for-logs')
  if (options.method === 'POST') {
    const output = JSON.parse(options.body)
    attempts.push(output)
    const duplicate = accepted.has(output.event_id)
    accepted.add(output.event_id)
    if (failOnce) { failOnce = false; return Response.json({}, { status: 503 }) }
    return Response.json({ status: duplicate ? 'duplicate' : 'accepted', event_id: output.event_id, seq: 1000 }, { status: duplicate ? 200 : 201 })
  }
  const since = Number(new URL(url).searchParams.get('since_seq'))
  const events = rows.filter(event => event.seq > since)
  return Response.json({ consumer: toolId, consumes: ['ERP_SALES_PERIOD_CLOSED'], events, next_seq: events.at(-1)?.seq || since })
} }
try {
  let consumer = await createToolConsumer(settings)
  assert.equal((await consumer.tick()).reason, 'central_http_503')
  assert.equal(consumer.snapshot().cursor, 2, 'bad rows advance but a failed POST does not')
  assert.equal(Object.keys(consumer.snapshot().rejected).length, 2)
  assert.equal(attempts[0].data.details.actual, 152340.5, 'numeric string converted; return amount not subtracted twice')
  assert.equal(attempts[0].data.status, 'sin_meta')
  assert.equal(attempts[0].metadata.test, true)
  const saved = JSON.parse(await readFile(path.join(temp, `${toolId}.json`), 'utf8'))
  assert.equal(saved.pending.output.event_id, attempts[0].event_id)
  consumer = await createToolConsumer(settings)
  assert.equal((await consumer.tick()).status, 'ready')
  assert.equal(attempts[1].event_id, attempts[0].event_id, 'retry after restart uses the same UUID')
  assert.equal(attempts.length, 3, 'same period ignored, changed fact updates, processed ID ignored')
  assert.equal(attempts[2].data.details.actual, 160000)
  assert.equal(attempts[2].causation_id, 'qa-correction')
  assert.equal(attempts[2].correlation_id, 'qa-chain')
  assert.equal(consumer.snapshot().cursor, 6)
  assert.equal(Object.keys(consumer.snapshot().records).length, 1)
  assert.equal(consumer.snapshot().last_publication.http_status, 201)
  await consumer.tick()
  assert.equal(attempts.length, 3)
  assert.ok(logs.some(entry => entry.action === 'discarded'))
  assert.ok(logs.some(entry => entry.action === 'duplicate_period'))
  assert.ok(logs.some(entry => entry.action === 'duplicate_input'))
  assert.ok(!JSON.stringify(logs).includes(settings.apiKey))
  const retry = await createToolConsumer({ ...settings, stateDir: path.join(temp, 'retry'), fetcher: async () => { throw new Error('upstream may include secrets, never print me') } })
  const delays = []
  for (let i = 0; i < 8; i++) delays.push((await retry.tick()).retry_after_ms)
  assert.deepEqual(delays, [10000, 20000, 40000, 80000, 160000, 300000, 300000, 300000])
  const noErp = await createToolConsumer({ ...settings, stateDir: path.join(temp, 'no-erp'), fetcher: async () => Response.json({ consumer: toolId, consumes: ['ERP_SALES_PERIOD_CLOSED'], events: [], next_seq: 0 }) })
  assert.equal((await noErp.tick()).status, 'ready', 'empty ERP subscription is not an infrastructure failure')
  for (const bad of ['', ' ', 'NaN', 'Infinity', true, [], null]) assert.throws(() => salesInput(subscriptionEvent(row(1, 'qa-bad', bad), 'ERP_SALES_PERIOD_CLOSED')), /invalid_sales_period/)
  console.log('Runbook: numeric ERP, durable quarantine, restart, period/update/idempotency, retry backoff, no-ERP readiness and test lineage PASS')
} finally { await rm(temp, { recursive: true, force: true }) }
