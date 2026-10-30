import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { TOOL_CONTRACTS, createToolConsumer, consumerInput } from '../src/services/toolConsumer.js'
import { validateEventPayload } from '../src/services/validationService.js'

const raw = await readFile(new URL('./fixtures/cpa_tpp_desarrollo.json', import.meta.url), 'utf8')
const fixture = JSON.parse(raw)
assert.equal(fixture.test, true)
assert.match(fixture.organization_id, /^QA-/)
assert.equal(fixture.business_config.organization_id, fixture.organization_id)
const temp = await mkdtemp(path.join(os.tmpdir(), 'isotools-development-'))
const report = {
  execution: 'development_consumer_with_in_memory_bus',
  node: process.version,
  fixture_sha256: createHash('sha256').update(raw).digest('hex'),
  synthetic: true,
  external_requests: 0,
  deployed_configuration_changed: false,
  cases: [],
  tools: []
}

try {
  const configFile = path.join(temp, 'business.json')
  await writeFile(configFile, JSON.stringify(fixture.business_config))
  for (const [toolId, contract] of Object.entries(TOOL_CONTRACTS)) {
    const cases = fixture.cases.filter(test => test.tool === toolId)
    assert.equal(cases.length, 4)
    const rows = cases.map((test, index) => ({
      seq: index + 1,
      event_id: `qa-dev-${test.id}`,
      timestamp: fixture.timestamp,
      platform_version: '1.0',
      module: { id: 'qa_runbook', version: '1.0.0' },
      asset: fixture.asset,
      event: { type: contract.consumes, category: contract.category, severity: 'low' },
      correlation_id: `qa-runbook-development-${test.id}`,
      metadata: { test: true },
      data: toolId === 'compare_planned_vs_actual'
        ? { ...fixture.sales_context, period: test.date, periodStart: test.date, periodEnd: test.date, ...test.data }
        : { ...(test.omit_project_context ? {} : fixture.project_context), ...test.data }
    }))
    for (const row of rows) assert.equal(validateEventPayload(structuredClone(row)).valid, true)
    const outputs = []
    const logs = []
    const queries = []
    const settings = {
      toolId,
      apiUrl: 'https://fixture.invalid/api/v1',
      apiKey: 'development-fixture-key',
      stateDir: path.join(temp, toolId),
      businessConfigFile: configFile,
      initialCursor: 0,
      logger: entry => logs.push(entry),
      // Every consumer request is intercepted; the script never calls global fetch.
      fetcher: async (url, options) => {
        const parsed = new URL(url)
        assert.equal(parsed.origin, 'https://fixture.invalid')
        assert.equal(options.redirect, 'error')
        if (options.method === 'POST') {
          assert.equal(parsed.pathname, '/api/v1/events')
          const output = JSON.parse(options.body)
          assert.equal(validateEventPayload(structuredClone(output)).valid, true)
          assert.equal(output.metadata.test, true)
          assert.equal(output.module.id, toolId)
          assert.equal(output.event.type, contract.produces)
          assert.equal(output.data.organization_id, fixture.organization_id)
          outputs.push(output)
          return Response.json({ status: 'accepted', event_id: output.event_id, seq: 1000 + outputs.length }, { status: 201 })
        }
        assert.equal(options.method, 'GET')
        assert.equal(parsed.pathname, `/api/v1/events/subscriptions/${toolId}`)
        const since = Number(parsed.searchParams.get('since_seq'))
        queries.push(since)
        const events = rows.filter(row => row.seq > since)
        return Response.json({ consumer: toolId, consumes: [contract.consumes], events, next_seq: events.at(-1)?.seq ?? since })
      }
    }
    let consumer = await createToolConsumer(settings)
    // One input per poll makes intermediate evaluations observable, including non-emitting cases.
    const allRows = rows.splice(0)
    for (const [index, test] of cases.entries()) {
      const row = allRows[index]
      rows.push(row)
      assert.equal((await consumer.tick()).status, 'ready', test.id)
      const state = consumer.snapshot()
      const ownOutputs = outputs.filter(output => output.causation_id === row.event_id)
      assert.equal(ownOutputs.length, test.expected.published ? 1 : 0, test.id)
      assert.equal(state.cursor, row.seq, test.id)
      assert.equal(state.pending, null)
      if (test.expected.rejection) assert.equal(state.rejected[row.event_id].reason, test.expected.rejection, test.id)
      else assert.equal(Object.hasOwn(state.rejected, row.event_id), false)
      if (test.expected.status) {
        assert.equal(state.last_evaluation.event_id, row.event_id)
        assert.equal(state.last_evaluation.result.status, test.expected.status, test.id)
      }
      if (test.expected.missing_fields) assert.deepEqual(state.last_evaluation.result.data_quality.missing_fields, test.expected.missing_fields)
      for (const output of ownOutputs) {
        assert.equal(output.correlation_id, row.correlation_id)
        assert.deepEqual(output.asset, fixture.asset)
        if (toolId === 'compare_planned_vs_actual') {
          const metric = output.data.details.metrics[0]
          assert.equal(metric.actual, test.expected.actual, 'actual is preserved without subtracting devuelto')
          assert.equal(metric.planned, test.expected.planned, 'target comes from the service config')
          assert.equal(Object.hasOwn(row.data, 'planned'), false)
          if (test.expected.adverse_percent !== undefined) assert.equal(metric.adverse_percent, test.expected.adverse_percent)
        } else {
          assert.equal(output.data.completionPercent, test.expected.completion_percent)
          assert.equal(output.data.project_id, row.data.project_id)
          assert.equal(output.data.targetType, 'order')
          assert.deepEqual(output.data.targetIds, fixture.project_context.target_ids)
        }
      }
      report.cases.push({ id: test.id, tool: toolId, status: test.expected.status ?? 'rejected', publications_in_fixture: ownOutputs.length, result: 'PASS' })
    }
    const before = consumer.snapshot()
    consumer = await createToolConsumer(settings)
    assert.equal((await consumer.tick()).status, 'ready')
    assert.equal(queries.at(-1), 4, 'restart resumes at the saved cursor')
    assert.deepEqual(consumer.snapshot().records, before.records)
    assert.deepEqual(consumer.snapshot().evaluations, before.evaluations)
    assert.equal(outputs.length, cases.filter(test => test.expected.published).length)
    assert.ok(!JSON.stringify(logs).includes(settings.apiKey))
    if (toolId === 'compare_planned_vs_actual') {
      const targetCase = allRows[cases.findIndex(test => test.id === 'CPA-META-150')]
      const metric = consumerInput(toolId, targetCase, fixture.business_config).metrics[0]
      assert.equal(metric.planned, metric.actual * 1.5)
    }
    report.tools.push({ tool: toolId, cursor: 4, rejected: Object.keys(before.rejected).length, restart_preserves_records: true, restart_adds_outputs: false })
  }
  assert.equal(report.cases.length, fixture.cases.length)
  console.log(JSON.stringify({ ...report, result: 'PASS' }, null, 2))
} finally {
  assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()))
  assert.ok(path.basename(temp).startsWith('isotools-development-'))
  await rm(temp, { recursive: true, force: true })
}
