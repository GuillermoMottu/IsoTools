import assert from 'node:assert/strict'
import { inspectConsumerBacklog } from './inspect_railway_tool.js'

const tool = 'compare_planned_vs_actual'
const variables = { TOOL_API_KEY: 'fixture-tool-key-not-for-core', ISOTOOLS_API_KEY: 'fixture-core-key-not-for-tool' }
const state = { cursor: 50, records: { fixture: { private: 'business-data-not-for-report' } }, rejected: {}, pending: null }
for (const scenario of ['empty', 'pending', 'advancing', 'unauthorized', 'bad_order']) {
  const calls = []
  let snapshots = 0
  const report = await inspectConsumerBacklog(variables, tool, async (url, options) => {
    calls.push(url)
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'error')
    const parsed = new URL(url)
    if (parsed.origin === 'https://cpa.orcalabs.mx') {
      assert.equal(parsed.pathname, '/api/tool/status')
      assert.equal(options.headers['x-api-key'], variables.TOOL_API_KEY)
      snapshots++
      return Response.json({ ...state, cursor: scenario === 'advancing' && snapshots === 2 ? 51 : 50 })
    }
    assert.equal(parsed.origin, 'https://api-events.orcalabs.mx')
    assert.equal(parsed.searchParams.get('since_seq'), '50')
    assert.equal(options.headers['x-api-key'], variables.ISOTOOLS_API_KEY)
    if (scenario === 'unauthorized') return Response.json({}, { status: 401 })
    const events = scenario === 'empty' || scenario === 'advancing' ? [] : [{ seq: scenario === 'bad_order' ? 49 : 51 }]
    return Response.json({ consumer: tool, consumes: ['ERP_SALES_PERIOD_CLOSED'], events, next_seq: scenario === 'empty' || scenario === 'advancing' ? 50 : 51 })
  })
  assert.equal(report.status, ['unauthorized', 'bad_order'].includes(scenario) ? 'unverified' : 'observed')
  assert.equal(report.state_written, false)
  assert.equal(report.outage_executed, false)
  if (report.status === 'observed') {
    assert.equal(report.subscription_count, scenario === 'pending' ? 1 : 0)
    assert.equal(report.cursor_unchanged_during_inspection, scenario !== 'advancing')
    assert.equal(report.records_unchanged_during_inspection, true)
  }
  assert.ok(calls.length >= 2)
  for (const secret of [...Object.values(variables), 'business-data-not-for-report']) assert.equal(JSON.stringify(report).includes(secret), false)
}
assert.equal((await inspectConsumerBacklog({}, tool, async () => assert.fail('no request without credentials'))).status, 'requires_credentials')
await assert.rejects(inspectConsumerBacklog(variables, 'other_tool'), /invalid_tool/)
console.log('Consumer backlog: GET-only, separate credentials, durable cursor observation, pending/empty subscriptions, concurrent progress and sanitized output PASS')
