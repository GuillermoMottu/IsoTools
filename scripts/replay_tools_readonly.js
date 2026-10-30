import { createHash } from 'node:crypto'
import { appendFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TOOL_CONTRACTS, subscriptionEvent, consumerInput, evaluateConsumerInput } from '../src/services/toolConsumer.js'

const CENTRAL_API = 'https://api-events.orcalabs.mx/api/v1'
const sourceId = row => row.module_id || row.module?.id || row.tool
const testInput = row => row.metadata?.test === true || row.data?.test === true || row.data?._placeholder === true || sourceId(row) === 'qa_runbook' || row.correlation_id?.startsWith('qa-runbook-') === true
const outputType = row => row.event_type || row.event?.type || row.event
const fieldsFor = result => ({ status: result.status, missing_fields: result.data_quality?.missing_fields || [], warnings: result.data_quality?.warnings || [] })

export async function replayToolsReadonly ({ apiKey, organizationId, businessConfig = {}, selectedTool = 'all', fetcher = fetch }) {
  if (!apiKey?.trim()) throw new Error('missing_central_key')
  if (selectedTool !== 'all' && !Object.hasOwn(TOOL_CONTRACTS, selectedTool)) throw new Error('invalid_tool')
  const report = { mode: 'readonly_replay', central_methods: ['GET'], production_state_accessed: false, checked_at: new Date().toISOString(), tools: [] }
  async function get (route) {
    const response = await fetcher(CENTRAL_API + route, { method: 'GET', headers: { 'x-api-key': apiKey }, redirect: 'error', signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error(`central_http_${response.status}`)
    return response.json()
  }
  for (const [toolId, contract] of Object.entries(TOOL_CONTRACTS)) {
    if (selectedTool !== 'all' && selectedTool !== toolId) continue
    let cursor = 0
    let total = 0
    let tests = 0
    let complete = false
    const candidates = []
    for (let page = 0; page < 100; page++) {
      const batch = await get(`/events/subscriptions/${toolId}?since_seq=${cursor}&limit=1000`)
      if (batch.consumer !== toolId || !batch.consumes?.includes(contract.consumes) || !Array.isArray(batch.events)) throw new Error('invalid_subscription_response')
      let previous = cursor
      for (const row of batch.events) {
        const seq = Number(row.seq)
        if (!Number.isSafeInteger(seq) || seq <= previous) throw new Error('invalid_subscription_order')
        previous = seq
        total++
        if (testInput(row)) tests++
        else candidates.push(row)
      }
      const next = Number(batch.next_seq)
      if (!Number.isSafeInteger(next) || next < previous) throw new Error('invalid_subscription_cursor')
      if (batch.events.length < 1000) { complete = true; break }
      if (next <= cursor) throw new Error('invalid_subscription_cursor')
      cursor = next
    }
    const item = { tool: toolId, consumes: contract.consumes, inventory_count: total, marked_test_count: tests, inventory_complete: complete }
    report.tools.push(item)
    if (!complete) throw new Error('inventory_page_limit_reached')
    let latest = null
    let chain = null
    item.excluded_qa_lineage_count = 0
    const chains = new Map()
    while (candidates.length) {
      const candidate = candidates.pop()
      const id = candidate.correlation_id || candidate.event_id
      if (typeof id !== 'string' || !id || /^[.]+$/.test(id) || /[\r\n\0]/.test(id)) throw new Error('invalid_correlation_id')
      if (!chains.has(id)) chains.set(id, await get(`/events/chain/${encodeURIComponent(id)}`))
      const candidateChain = chains.get(id)
      if (!Array.isArray(candidateChain.events)) throw new Error('invalid_chain_response')
      if (candidateChain.events.some(testInput)) { item.excluded_qa_lineage_count++; continue }
      latest = candidate
      chain = candidateChain
      break
    }
    if (!latest) { item.status = 'no_non_test_input'; continue }
    const event = subscriptionEvent(latest, contract.consumes)
    const correlationId = event.correlation_id || event.event_id
    const historical = chain.events.filter(row => sourceId(row) === toolId && outputType(row) === contract.produces && row.causation_id === event.event_id)
    const config = { ...businessConfig, ...(organizationId ? { organization_id: organizationId } : {}) }
    const input = consumerInput(toolId, event, config)
    const result = evaluateConsumerInput(toolId, event, input)
    const erpOrigin = sourceId(event) === 'erp_connector' || chain.events.some(row => sourceId(row) === 'erp_connector' && outputType(row) === 'ERP_SALES_PERIOD_CLOSED')
    Object.assign(item, {
      status: 'evaluated',
      input_seq: Number(latest.seq),
      input_event_id: event.event_id,
      correlation_id: correlationId,
      source_module: sourceId(event),
      erp_origin_in_chain: erpOrigin,
      input_sha256: createHash('sha256').update(JSON.stringify(latest)).digest('hex'),
      baseline: fieldsFor(result),
      configured_context_is_test: input.test === true,
      historical_output_count: historical.length,
      historical_outputs: historical.map(row => ({ event_id: row.event_id, status: row.data?.status, status_matches: row.data?.status === result.status })),
      calculation_version: result.audit?.calculation_version || null,
      rule_version: result.audit?.rule_version || null,
      historical_configuration_known: false
    })
    if (toolId === 'compare_planned_vs_actual' && !Array.isArray(event.data.metrics)) {
      const actual = input.metrics[0].actual
      const targetConfig = { ...config, sales_plans: [{ plant_id: event.data.plantId, period: event.data.period, unit: event.data.unit, planned: actual * 1.5 }] }
      const targetInput = consumerInput(toolId, event, targetConfig)
      const targetResult = evaluateConsumerInput(toolId, event, targetInput)
      item.actual_preserved = actual === targetInput.metrics[0].actual
      item.sales_target_trial = { multiplier: 1.5, configured_only_in_memory: true, ...fieldsFor(targetResult) }
    }
    item.acceptance = input.test !== true && erpOrigin && result.status !== 'not_calculable' && historical.length === 1 && historical[0].data?.status === result.status ? 'status_matches_requires_configuration_review' : 'requires_review'
  }
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const businessConfig = process.env.TOOL_REPLAY_CONFIG_FILE ? JSON.parse(await readFile(process.env.TOOL_REPLAY_CONFIG_FILE, 'utf8')) : {}
    const report = await replayToolsReadonly({ apiKey: process.env.ISOTOOLS_API_KEY, organizationId: process.env.REPLAY_ORGANIZATION_ID?.trim(), businessConfig, selectedTool: process.env.TOOL_SELECTED || 'all' })
    // Never print raw events, business amounts, configuration or credentials.
    console.log(JSON.stringify(report, null, 2))
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### Replay de solo lectura\n\nNo publica eventos ni accede a cursores persistentes. Un job exitoso no significa aprobación de las tools.\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`)
  } catch (error) {
    const safe = /^(missing_central_key|central_http_\d+|invalid_[a-z_]+|ambiguous_sales_plan|inventory_page_limit_reached)$/.test(error.message) ? error.message : 'readonly_replay_failed'
    console.error(JSON.stringify({ error: safe }))
    process.exitCode = 1
  }
}
