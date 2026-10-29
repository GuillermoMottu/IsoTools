import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { projectFields } from '../utils/projectContext.js'
import { evaluatePlannedVsActual } from '../tools/compare_planned_vs_actual.js'
import { evaluateProjectProgress } from '../tools/track_project_progress.js'
import { validateEventPayload } from './validationService.js'

export const TOOL_CONTRACTS = {
  compare_planned_vs_actual: { consumes: 'ERP_SALES_PERIOD_CLOSED', produces: 'PRODUCTION_VARIANCE_DETECTED', category: 'productivity', evaluate: evaluatePlannedVsActual },
  track_project_progress: { consumes: 'KPI_REPORT_GENERATED', produces: 'PROJECT_AT_RISK', category: 'system', evaluate: evaluateProjectProgress }
}

function sequence (value) {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('invalid_sequence')
  return n
}

export function subscriptionEvent (row, expectedType) {
  const event = {
    ...row,
    asset: row.asset || { asset_id: row.asset_id, asset_type: row.asset_type, plant_id: row.plant_id },
    event: row.event || { type: row.event_type }
  }
  if (event.event.type !== expectedType || !event.event_id || !event.asset.asset_id ||
      !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) throw new Error('invalid_subscription_event')
  sequence(row.seq)
  return event
}

function isIsoDate (value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

export function salesInput (event, config = {}) {
  const data = event.data
  if (Array.isArray(data.metrics)) return data
  const actual = typeof data.actual === 'string' && /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(data.actual.trim()) ? Number(data.actual) : data.actual
  const period = `${data.periodStart}_${data.periodEnd}`
  if (data.module !== 'sales' || !Number.isFinite(actual) || !data.plantId ||
      !isIsoDate(data.periodStart) || !isIsoDate(data.periodEnd) || Date.parse(data.periodEnd) < Date.parse(data.periodStart) ||
      (event.asset.plant_id && event.asset.plant_id !== data.plantId) ||
      !(data.period === period || (data.periodStart === data.periodEnd && data.period === data.periodStart)) || !data.unit) throw new Error('invalid_sales_period')
  const plans = (config.sales_plans || []).filter(plan => plan.plant_id === data.plantId && [data.period, period].includes(plan.period))
  if (plans.length > 1) throw new Error('ambiguous_sales_plan')
  const plan = plans[0]
  if (plan && (!Number.isFinite(plan.planned) || plan.unit !== data.unit)) throw new Error('invalid_sales_plan')
  return {
    organization_id: data.organization_id || config.organization_id,
    analysis_id: `${event.metadata?.test ? 'qa-' : ''}sales:${data.plantId}:${period}`,
    as_of_date: data.as_of_date || data.asOfDate || `${data.periodEnd}T23:59:59.000Z`,
    plant_id: data.plantId,
    domain: 'sales',
    period: data.period,
    period_start: data.periodStart,
    period_end: data.periodEnd,
    metrics: [{ metric_id: 'sales_revenue', name: 'Ventas del periodo', planned: plan?.planned ?? null, actual, unit: data.unit, direction: 'higher_is_better' }],
    ...projectFields(data),
    source: { source_system: data.erpType || 'ERP', source_record_ids: [event.event_id], source_extracted_at: event.timestamp },
    ...(event.metadata?.test ? { test: true } : {})
  }
}

export function consumerInput (toolId, event, config = {}) {
  if (!TOOL_CONTRACTS[toolId]) throw new Error('unknown_tool')
  return toolId === 'compare_planned_vs_actual' ? salesInput(event, config) : { ...event.data, ...projectFields(event.data), source: event.data.source || { source_system: event.module?.id || event.module_id || 'Bus de KPIs', source_extracted_at: event.timestamp, source_record_ids: [event.event_id] }, ...(event.metadata?.test ? { test: true } : {}) }
}

// Shared by the live consumer and the isolated replay; evaluation has no I/O.
export function evaluateConsumerInput (toolId, event, input) {
  const result = TOOL_CONTRACTS[toolId].evaluate({ ...event, data: input })
  // ERP_CENTRAL: preserve the actual even when no approved sales target exists.
  if (toolId !== 'compare_planned_vs_actual' || Array.isArray(event.data.metrics) || input.metrics[0].planned !== null) return result
  return {
    ...result, module: 'sales', status: 'sin_meta',
    summary: 'Ventas reales recibidas; no hay meta aprobada para comparar.',
    deviation_percent: null, deviationPercent: null, weighted_deviation_percent: null,
    details: {
      planned: null, actual: input.metrics[0].actual, unit: event.data.unit,
      metrics: [{ ...input.metrics[0], status: 'sin_meta', variance: null, variance_percent: null, adverse_percent: null }]
    },
    recommended_actions: ['define_sales_target']
  }
}

export async function createToolConsumer ({ toolId, apiUrl, apiKey, stateDir, businessConfigFile, initialCursor, fetcher = fetch, logger = entry => console.log(JSON.stringify({ tool: toolId, ...entry })) }) {
  const contract = TOOL_CONTRACTS[toolId]
  if (!contract) throw new Error('unknown_tool')
  await mkdir(stateDir, { recursive: true })
  const stateFile = path.join(stateDir, `${toolId}.json`)
  let state
  try { state = JSON.parse(await readFile(stateFile, 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
    state = { cursor: initialCursor === undefined || initialCursor === '' ? null : sequence(initialCursor), pending: null, records: {} }
  }
  if (state.cursor !== null) sequence(state.cursor)
  if (!state.records || typeof state.records !== 'object' || Array.isArray(state.records)) throw new Error('invalid_tool_state')
  for (const field of ['processed', 'rejected', 'sales_periods', 'evaluations']) {
    state[field] ??= {}
    if (typeof state[field] !== 'object' || state[field] === null || Array.isArray(state[field])) throw new Error('invalid_tool_state')
  }
  if (state.pending) {
    sequence(state.pending.inputSeq)
    if (!validateEventPayload(structuredClone(state.pending.output)).valid) throw new Error('invalid_pending_event')
  }
  let status = { status: 'not_ready', reason: 'not_started' }
  let running = false
  let failures = 0
  // shortcut: single writer on a Railway volume; use a transactional store before adding replicas.
  let committed = structuredClone(state)
  async function save () {
    await writeFile(`${stateFile}.tmp`, JSON.stringify(state), { mode: 0o600 })
    await rename(`${stateFile}.tmp`, stateFile)
    committed = structuredClone(state)
  }
  async function request (route, output) {
    if (!apiKey) throw new Error('missing_isotools_api_key')
    const response = await fetcher(`${apiUrl.replace(/\/$/, '')}${route}`, {
      method: output ? 'POST' : 'GET',
      headers: { 'x-api-key': apiKey, ...(output ? { 'content-type': 'application/json' } : {}) },
      ...(output ? { body: JSON.stringify(output) } : {}),
      signal: AbortSignal.timeout(15000), redirect: 'error'
    })
    if (!response.ok) throw new Error(`central_http_${response.status}`)
    const payload = await response.json()
    return output ? { ...payload, http_status: response.status } : payload
  }
  async function publishPending () {
    const pending = state.pending
    if (!pending) return
    const ack = await request('/events', pending.output)
    if (!['accepted', 'duplicate'].includes(ack.status) || ack.event_id !== pending.output.event_id) throw new Error('invalid_publish_ack')
    state.cursor = pending.inputSeq
    state.last_publication = { event_id: ack.event_id, correlation_id: pending.output.correlation_id, input_seq: pending.inputSeq, status: ack.status, http_status: ack.http_status }
    state.processed = { ...state.processed, [pending.output.causation_id]: pending.inputSeq }
    if (pending.salesKey) state.sales_periods = { ...state.sales_periods, [pending.salesKey]: pending.signature }
    state.pending = null
    await save()
    logger({ action: 'published', ...state.last_publication })
  }
  async function tick () {
    if (running) return
    running = true
    try {
      await publishPending()
      if (state.cursor === null) {
        const latest = await request(`/events/latest?type=${contract.consumes}`)
        state.cursor = latest.max_seq === null ? 0 : sequence(latest.max_seq)
        await save()
      }
      const batch = await request(`/events/subscriptions/${toolId}?since_seq=${state.cursor}&limit=50`)
      if (batch.consumer !== toolId || !Array.isArray(batch.consumes) || !batch.consumes.includes(contract.consumes) || !Array.isArray(batch.events)) throw new Error('invalid_subscription_response')
      const nextSeq = sequence(batch.next_seq)
      logger({ action: 'poll', cursor: state.cursor, count: batch.events.length, next_seq: nextSeq })
      let previous = state.cursor
      for (const row of batch.events) {
        const seq = sequence(row.seq)
        if (seq <= previous || seq > nextSeq) throw new Error('invalid_subscription_order')
        previous = seq
      }
      if (nextSeq < previous) throw new Error('invalid_subscription_cursor')
      for (const row of batch.events) {
        if (Object.hasOwn(state.processed, row.event_id)) {
          state.cursor = sequence(row.seq)
          await save()
          logger({ action: 'duplicate_input', event_id: row.event_id, seq: state.cursor })
          continue
        }
        const config = businessConfigFile ? JSON.parse(await readFile(businessConfigFile, 'utf8')) : {}
        let event, input
        try {
          event = subscriptionEvent(row, contract.consumes)
          input = consumerInput(toolId, event, config)
        } catch (error) {
          if (!['invalid_subscription_event', 'invalid_sales_period'].includes(error.message)) throw error
          await reject(row, error.message)
          continue
        }
        const salesKey = toolId === 'compare_planned_vs_actual' && !Array.isArray(event.data.metrics) ? input.analysis_id : null
        const { source, ...facts } = input
        const signature = salesKey ? JSON.stringify(facts) : null
        if (salesKey && state.sales_periods[salesKey] === signature) {
          state.records = { ...state.records, [salesKey]: input }
          state.processed = { ...state.processed, [event.event_id]: sequence(row.seq) }
          state.cursor = sequence(row.seq)
          await save()
          logger({ action: 'duplicate_period', event_id: event.event_id, seq: state.cursor })
          continue
        }
        const result = evaluateConsumerInput(toolId, event, input)
        const id = input.analysis_id || input.analysisId || input.project_id || input.projectId
        if (id) state.records = { ...state.records, [id]: { ...input, [toolId === 'compare_planned_vs_actual' ? 'analysis_id' : 'project_id']: id } }
        state.last_evaluation = { event_id: event.event_id, result }
        if (id) state.evaluations = { ...state.evaluations, [id]: result }
        await save()
        if (result.status === 'not_calculable') {
          await reject(row, 'input_not_calculable')
          continue
        }
        if (toolId === 'track_project_progress' && result.status === 'on_track') {
          state.cursor = sequence(row.seq)
          state.processed = { ...state.processed, [event.event_id]: state.cursor }
          await save()
          logger({ action: 'processed', event_id: event.event_id, seq: state.cursor, status: result.status })
          continue
        }
        const output = {
          event_id: randomUUID(), timestamp: new Date().toISOString(), platform_version: '1.0',
          module: { id: toolId, version: '1.0.0' }, asset: event.asset,
          event: { type: contract.produces, category: contract.category, severity: result.severity },
          data: { ...result, ...(toolId === 'compare_planned_vs_actual' ? { source_period: event.data.period } : {}) },
          correlation_id: event.correlation_id || event.event_id, causation_id: event.event_id,
          ...(event.metadata?.test ? { metadata: { test: true } } : {})
        }
        if (!validateEventPayload(output).valid) throw new Error('invalid_output_event')
        state.pending = { inputSeq: sequence(row.seq), output, salesKey, signature }
        await save()
        await publishPending()
      }
      state.cursor = nextSeq
      await save()
      failures = 0
      status = { status: 'ready', checked_at: new Date().toISOString() }
    } catch (error) {
      state = structuredClone(committed)
      // Never expose upstream bodies or credentials through readiness or logs.
      const reason = /^(central_http_\d+|invalid_[a-z_]+|ambiguous_sales_plan|missing_isotools_api_key|input_not_calculable)$/.test(error.message) ? error.message : 'consumer_failed'
      const retryAfter = Math.min(300000, 10000 * (2 ** Math.min(failures++, 5)))
      status = { status: 'not_ready', reason, retry_after_ms: retryAfter, checked_at: new Date().toISOString() }
      logger({ action: 'retry', reason, retry_after_ms: retryAfter })
    } finally { running = false }
    return status
  }
  async function reject (row, reason) {
    const seq = sequence(row.seq)
    const id = row.event_id || `seq:${seq}`
    state.rejected = { ...state.rejected, [id]: { event: row, reason, rejected_at: new Date().toISOString() } }
    state.processed = { ...state.processed, [id]: seq }
    state.cursor = seq
    await save()
    logger({ action: 'discarded', event_id: id, seq, reason })
  }
  // Fail before serving health if the durable state directory cannot be written.
  await save()
  return { tick, readiness: () => status, snapshot: () => structuredClone(state) }
}
