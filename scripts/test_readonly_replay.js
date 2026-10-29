import assert from 'node:assert/strict'
import { replayToolsReadonly } from './replay_tools_readonly.js'

const key = 'fixture-read-key-never-in-report'
const ids = { sales: '11111111-1111-4111-8111-111111111111', kpi: '22222222-2222-4222-8222-222222222222', chain: 'recorded-chain:33333333-3333-4333-8333-333333333333' }
const sales = { seq: 1, event_id: ids.sales, correlation_id: ids.chain, timestamp: '2026-10-22T01:00:00Z', module_id: 'erp_connector', event_type: 'ERP_SALES_PERIOD_CLOSED', asset_id: 'fixture-erp', plant_id: 'plant_01', data: { module: 'sales', period: '2026-10-21', periodStart: '2026-10-21', periodEnd: '2026-10-21', plantId: 'plant_01', actual: '152340.50', devuelto: '100', unit: 'MXN' } }
const kpi = { ...sales, seq: 3, event_id: ids.kpi, module_id: 'generate_kpis', event_type: 'KPI_REPORT_GENERATED', data: { plantId: 'plant_01', period: 'monthly', kpis: { oee: 0.78 } } }
const fullKpi = { ...kpi, data: { ...kpi.data, organization_id: 'fixture-org', project_id: 'fixture-project', project_name: 'Fixture project', as_of_date: '2026-10-21', planned_start_date: '2026-10-01', planned_end_date: '2026-12-31', planned_progress_percent: 40, actual_progress_percent: 34 } }
let requests = 0
function fetcher ({ fullContext = false, empty = false, duplicate = false, paginated = false } = {}) {
  return async (url, options) => {
    requests++
    assert.equal(options.method, 'GET', 'the central API must never receive a write')
    assert.equal(options.redirect, 'error', 'credentials cannot follow a redirect')
    assert.equal(options.headers['x-api-key'], key)
    const parsed = new URL(url)
    assert.equal(parsed.origin, 'https://api-events.orcalabs.mx')
    if (parsed.pathname.includes('/subscriptions/')) {
      const isSales = parsed.pathname.endsWith('/compare_planned_vs_actual')
      const consumer = isSales ? 'compare_planned_vs_actual' : 'track_project_progress'
      const consumes = [isSales ? sales.event_type : kpi.event_type]
      const cursor = Number(parsed.searchParams.get('since_seq'))
      if (empty) return Response.json({ consumer, consumes, events: [], next_seq: cursor })
      if (paginated && isSales && cursor === 0) {
        return Response.json({ consumer, consumes, events: Array.from({ length: 1000 }, (_, i) => ({ ...sales, seq: i + 1, metadata: { test: true } })), next_seq: 1000 })
      }
      const input = isSales ? { ...sales, seq: paginated ? 1001 : 1 } : (fullContext ? fullKpi : kpi)
      const qa = { ...input, seq: Number(input.seq) + 1, event_id: 'qa-must-not-be-selected', metadata: { test: true } }
      return Response.json({ consumer, consumes, events: [input, qa], next_seq: qa.seq })
    }
    assert.equal(parsed.pathname, `/api/v1/events/chain/${encodeURIComponent(ids.chain)}`)
    const exact = { event_id: 'stored-sales-output', tool: 'compare_planned_vs_actual', event: 'PRODUCTION_VARIANCE_DETECTED', causation_id: ids.sales, data: { status: 'sin_meta' } }
    return Response.json({ events: [
      { tool: 'erp_connector', event: sales.event_type, event_id: ids.sales }, exact,
      ...(duplicate ? [{ ...exact, event_id: 'duplicate-output' }] : []),
      { ...exact, event_id: 'unrelated-same-chain', causation_id: 'other-input' },
      { event_id: 'stored-project-output', tool: 'track_project_progress', event: 'PROJECT_AT_RISK', causation_id: ids.kpi, data: { status: 'at_risk' } }
    ] })
  }
}

const before = structuredClone(sales)
const report = await replayToolsReadonly({ apiKey: key, fetcher: fetcher() })
assert.deepEqual(sales, before, 'source events stay unchanged')
assert.equal(report.tools[0].baseline.status, 'sin_meta')
assert.equal(report.tools[0].actual_preserved, true, 'the ERP total is preserved without subtracting returns again')
assert.equal(report.tools[0].historical_output_count, 1, 'same-chain outputs from another input do not count')
assert.equal(report.tools[0].input_event_id, ids.sales, 'a newer QA input cannot replace business input')
assert.equal(report.tools[0].sales_target_trial.status, 'not_calculable')
assert.deepEqual(report.tools[0].sales_target_trial.missing_fields, ['organization_id'])
assert.equal(report.tools[1].baseline.status, 'not_calculable')
assert.ok(report.tools[1].baseline.missing_fields.includes('project_id'))
assert.equal(report.tools[0].historical_configuration_known, false)
const serialized = JSON.stringify(report)
assert.ok(!serialized.includes(key) && !serialized.includes('152340.50'), 'logs contain neither credentials nor business totals')

const configured = await replayToolsReadonly({ apiKey: key, organizationId: 'fixture-org', fetcher: fetcher({ fullContext: true }) })
assert.equal(configured.tools[0].sales_target_trial.status, 'critical')
assert.equal(configured.tools[1].baseline.status, 'at_risk')
assert.ok(configured.tools.every(tool => tool.acceptance !== 'approved'))
const duplicate = await replayToolsReadonly({ apiKey: key, fetcher: fetcher({ duplicate: true }) })
assert.equal(duplicate.tools[0].historical_output_count, 2)
assert.equal(duplicate.tools[0].acceptance, 'requires_review')
const paginated = await replayToolsReadonly({ apiKey: key, fetcher: fetcher({ paginated: true }) })
assert.equal(paginated.tools[0].inventory_count, 1002)
assert.equal(paginated.tools[0].input_seq, 1001)
const empty = await replayToolsReadonly({ apiKey: key, fetcher: fetcher({ empty: true }) })
assert.ok(empty.tools.every(tool => tool.status === 'no_non_test_input'))
const selected = await replayToolsReadonly({ apiKey: key, selectedTool: 'track_project_progress', fetcher: fetcher() })
assert.deepEqual(selected.tools.map(tool => tool.tool), ['track_project_progress'])
await assert.rejects(replayToolsReadonly({ apiKey: key, selectedTool: 'other-tool' }), /invalid_tool/)
await assert.rejects(replayToolsReadonly({ apiKey: key, fetcher: async () => Response.json({}, { status: 401 }) }), /central_http_401/)
await assert.rejects(replayToolsReadonly({ apiKey: '', fetcher: async () => assert.fail('no request without key') }), /missing_central_key/)
assert.ok(requests > 0)
console.log('Read-only replay: GET only, no redirects/state, pagination, QA exclusion, exact causation, missing context, duplicate outputs and sanitized report PASS (fixtures only)')
