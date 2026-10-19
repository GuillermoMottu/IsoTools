import assert from 'node:assert/strict'
import { TOOL_CONTRACTS, salesInput } from '../src/services/toolConsumer.js'
import { validateEventPayload } from '../src/services/validationService.js'

const originalFetch = globalThis.fetch
const originalEnv = { ...process.env }
const originalLog = console.log
const originalError = console.error
const coreKey = 'fixture-central-key-not-for-tools'
const toolKey = 'fixture-tool-key-not-for-core'
try {
  for (const scenario of ['missing', 'wrong', 'valid']) {
    let posts = 0
    const snapshots = new Map()
    const chains = new Map()
    const logs = []
    Object.assign(process.env, { ISOTOOLS_API_KEY: coreKey, VERIFY_DEPLOYED_CONSUMER: 'true', TOOL_SELECTED: 'all', COMPARE_TOOL_API_KEY: scenario === 'valid' ? toolKey : scenario === 'wrong' ? 'wrong-key' : '', TRACK_TOOL_API_KEY: toolKey })
    console.log = console.error = (...args) => logs.push(args.join(' '))
    globalThis.fetch = async (url, options = {}) => {
      const parsed = new URL(url)
      if (['cpa.orcalabs.mx', 'tpp.orcalabs.mx'].includes(parsed.hostname)) {
        const tool = parsed.hostname.startsWith('cpa.') ? 'compare_planned_vs_actual' : 'track_project_progress'
        assert.notEqual(options.headers?.['x-api-key'], coreKey)
        if (parsed.pathname === '/health') return Response.json({ auth: 'sso' })
        if (parsed.pathname === '/ready') return Response.json({ status: 'ready' })
        assert.equal(parsed.pathname, '/api/tool/status')
        if (options.headers?.['x-api-key'] !== toolKey) return Response.json({ error: 'authentication_required' }, { status: 401 })
        return Response.json(snapshots.get(tool) || { records: {} })
      }
      assert.equal(parsed.origin, 'https://api-events.orcalabs.mx')
      assert.equal(options.headers?.['x-api-key'], coreKey)
      if (parsed.pathname.includes('/catalog/tools/')) {
        const tool = parsed.pathname.split('/').at(-1)
        return Response.json({ consumes: [TOOL_CONTRACTS[tool].consumes], produces: [TOOL_CONTRACTS[tool].produces] })
      }
      if (parsed.pathname.endsWith('/events/latest')) return Response.json({ max_seq: 0 })
      if (options.method === 'POST') {
        posts++
        const input = JSON.parse(options.body)
        assert.equal(input.metadata.test, true)
        assert.equal(validateEventPayload(structuredClone(input)).valid, true)
        assert.match(input.asset.plant_id, /^QA-PLANT-qa-runbook-/)
        const tool = Object.keys(TOOL_CONTRACTS).find(id => TOOL_CONTRACTS[id].consumes === input.event.type)
        if (tool === 'compare_planned_vs_actual') assert.ok(salesInput(input).analysis_id.includes(input.asset.plant_id), 'each QA run has an independent sales period key')
        const output = { event_id: `output-${input.event_id}`, module_id: tool, correlation_id: input.event_id, causation_id: input.event_id, data: { status: tool === 'track_project_progress' ? 'at_risk' : 'sin_meta' } }
        snapshots.set(tool, { records: { QA: { source: { source_record_ids: [input.event_id] } } }, last_publication: { event_id: output.event_id, correlation_id: input.event_id, http_status: 201 }, last_evaluation: { result: { status: 'unrelated_later_evaluation' } } })
        chains.set(input.event_id, [input, output])
        return Response.json({ status: 'accepted' }, { status: 201 })
      }
      assert.ok(parsed.pathname.includes('/events/chain/'))
      return Response.json({ events: chains.get(parsed.pathname.split('/').at(-1)) })
    }
    process.exitCode = 0
    await import(`./verify_runbook_bus.js?auth-test=${scenario}`)
    assert.equal(process.exitCode, scenario === 'valid' ? 0 : 1)
    assert.equal(posts, scenario === 'valid' ? 2 : 0, 'no input may be published without access to the deployed consumer')
    assert.ok(!logs.join('\n').includes(coreKey) && !logs.join('\n').includes(toolKey))
    if (scenario === 'valid') {
      const report = JSON.parse(logs.find(log => log.startsWith('{\n')))
      assert.deepEqual(report.tests.map(test => test.output_status), ['sin_meta', 'at_risk'], 'status comes from each exact publication, not a later evaluation')
    }
    if (scenario !== 'valid') assert.ok(logs.some(log => log.includes('deployed_consumer_credentials_required')))
  }
} finally {
  globalThis.fetch = originalFetch
  console.log = originalLog
  console.error = originalError
  for (const name of Object.keys(process.env)) if (!Object.hasOwn(originalEnv, name)) delete process.env[name]
  Object.assign(process.env, originalEnv)
  process.exitCode = 0
}
console.log('Deployed QA: separate tool/core credentials, authenticated status and no publications before authorization PASS (fixtures only)')
