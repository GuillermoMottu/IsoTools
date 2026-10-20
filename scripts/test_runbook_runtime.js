import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Real child processes and HTTP, with a local core fixture and no production credentials.
const temp = await mkdtemp(path.join(os.tmpdir(), 'isotools-runtime-'))
const coreKey = 'runtime-fixture-core-key-not-a-real-secret'
const toolKey = 'runtime-fixture-machine-key-not-a-real-secret'
const children = new Set()
let fixture
const report = { node: process.version, platform: process.platform, execution: 'isolated_HTTP_and_process_restart', production_changed: false, tools: [] }

async function listen (server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

async function waitFor (check, message, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(100)
  }
  assert.fail(message)
}

const central = http.createServer(async (req, res) => {
  try {
    assert.equal(req.headers['x-api-key'], coreKey)
    const url = new URL(req.url, 'http://fixture')
    if (req.method === 'POST') {
      assert.equal(url.pathname, '/api/v1/events')
      let raw = ''
      for await (const chunk of req) raw += chunk
      const output = JSON.parse(raw)
      assert.equal(output.metadata.test, true)
      assert.equal(output.module.id, fixture.tool)
      const duplicate = fixture.accepted.has(output.event_id)
      fixture.attempts.push(output)
      fixture.accepted.set(output.event_id, output)
      const failed = fixture.loseAcknowledgement
      fixture.loseAcknowledgement = false
      const code = failed ? 503 : duplicate ? 200 : 201
      res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify({ status: duplicate ? 'duplicate' : 'accepted', event_id: output.event_id, seq: 1000 + fixture.accepted.size }))
      return
    }
    assert.equal(url.pathname, `/api/v1/events/subscriptions/${fixture.tool}`)
    const cursor = Number(url.searchParams.get('since_seq'))
    fixture.queries.push(cursor)
    const events = fixture.rows.filter(row => row.seq > cursor)
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ consumer: fixture.tool, consumes: [fixture.type], events, next_seq: events.at(-1)?.seq || cursor }))
  } catch (error) {
    fixture.error = error
    res.writeHead(500).end('{}')
  }
})

async function startTool (tool, apiUrl, stateDir) {
  const reservation = http.createServer()
  const base = await listen(reservation)
  await new Promise(resolve => reservation.close(resolve))
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/tool-server.js', import.meta.url))], {
    env: {
      ...process.env, DOTENV_CONFIG_PATH: path.join(temp, 'absent.env'), NODE_ENV: 'production',
      PORT: new URL(base).port, TOOL_PAGE_ID: tool, TOOL_CONSUMER_ENABLED: 'true',
      TOOL_STATE_DIR: stateDir, TOOL_INITIAL_CURSOR: '0', TOOL_BUSINESS_CONFIG_FILE: '',
      ISOTOOLS_API_URL: apiUrl, ISOTOOLS_API_KEY: coreKey, TOOL_API_KEY: toolKey,
      OIDC_ISSUER: '', OIDC_CLIENT_ID: '', OIDC_CLIENT_SECRET: '',
      ISSUER_ENDPOINT: 'https://idp.fixture.invalid/oidc', APP_ID: 'runtime-fixture-client', APP_SECRETS: 'runtime-fixture-client-secret',
      OIDC_REDIRECT_URI: 'https://tool.fixture.invalid/auth/callback',
      SESSION_SECRET: 'runtime-fixture-session-secret-at-least-32-characters',
      SESSION_COOKIE_NAME: tool === 'compare_planned_vs_actual' ? 'cpa_session' : 'tpp_session',
      SESSION_INSECURE_COOKIES: 'false', WEB_DIST_DIR: path.join(temp, 'absent-dist')
    }, stdio: ['ignore', 'pipe', 'pipe']
  })
  children.add(child)
  const running = { child, base, logs: '', errors: '' }
  child.stdout.on('data', chunk => { running.logs += chunk })
  child.stderr.on('data', chunk => { running.errors += chunk })
  running.events = () => running.logs.split('\n').flatMap(line => {
    try { return [JSON.parse(line)] } catch { return [] }
  })
  await waitFor(async () => {
    assert.equal(child.exitCode, null, 'tool must remain running')
    try { return (await fetch(base + '/health', { signal: AbortSignal.timeout(1000) })).status === 200 } catch { return false }
  }, 'tool health did not start')
  running.status = () => fetch(base + '/api/tool/status', { headers: { 'x-api-key': toolKey } }).then(response => response.json())
  return running
}

async function stopTool (running) {
  if (running.child.exitCode !== null || running.child.signalCode) return
  const exited = new Promise(resolve => running.child.once('exit', resolve))
  running.child.kill('SIGTERM')
  const timer = setTimeout(() => running.child.kill('SIGKILL'), 5000)
  await exited
  clearTimeout(timer)
  children.delete(running.child)
  assert.ok(!running.logs.includes(coreKey) && !running.logs.includes(toolKey))
}

try {
  const coreBase = await listen(central)
  const dead = http.createServer()
  const invalidCore = await listen(dead)
  await new Promise(resolve => dead.close(resolve))
  for (const tool of ['compare_planned_vs_actual', 'track_project_progress']) {
    const compare = tool === 'compare_planned_vs_actual'
    const type = compare ? 'ERP_SALES_PERIOD_CLOSED' : 'KPI_REPORT_GENERATED'
    const stateDir = path.join(temp, tool)
    const data = compare
      ? { module: 'sales', period: '2026-10-20', periodStart: '2026-10-20', periodEnd: '2026-10-20', plantId: 'QA-PLANT', actual: '152340.50', unit: 'MXN', erpType: 'fixture' }
      : { organization_id: 'QA', project_id: 'QA-PROJECT', project_name: 'Isolated runtime fixture', as_of_date: '2026-10-20T12:00:00Z', planned_start_date: '2026-10-01T00:00:00Z', planned_end_date: '2026-11-30T00:00:00Z', planned_progress_percent: 40, actual_progress_percent: 34, target_type: 'order', target_ids: ['QA-ORDER'], milestones: [] }
    const row = (seq, input) => ({ seq, event_id: `qa-runtime-${tool}-${seq}`, correlation_id: `qa-runtime-${tool}-${seq}`, timestamp: '2026-10-20T12:00:00Z', module_id: 'qa_runbook', asset_id: 'QA-ERP', plant_id: 'QA-PLANT', event_type: type, metadata: { test: true }, data: input })
    fixture = { tool, type, rows: [row(1, {}), row(2, data)], accepted: new Map(), attempts: [], queries: [] }
    let running = await startTool(tool, coreBase + '/api/v1', stateDir)
    await waitFor(async () => (await running.status()).cursor === 2, 'malformed input must not block the valid input')
    assert.equal((await fetch(running.base + '/ready')).status, 200)
    assert.equal((await fetch(running.base + '/auth/me')).status, 401)
    assert.equal((await fetch(running.base + `/api/tool/${tool}/run`, { method: 'POST', headers: { 'x-api-key': toolKey, 'content-type': 'application/json' }, body: '{"input":{}}' })).status, 400)
    const before = await running.status()
    assert.equal(before.rejected[fixture.rows[0].event_id].reason, compare ? 'invalid_sales_period' : 'input_not_calculable')
    assert.equal(fixture.accepted.size, 1)
    await waitFor(() => fixture.queries.length >= 2, 'next poll must occur', 15000)
    assert.equal((await fetch(running.base + '/ready')).status, 200, 'an empty subscription does not mean the ERP is down')
    assert.equal(fixture.accepted.size, 1)
    assert.ok(running.events().some(entry => entry.action === 'discarded'))
    assert.ok(running.events().some(entry => entry.action === 'published'))
    await stopTool(running)

    running = await startTool(tool, invalidCore + '/api/v1', stateDir)
    await waitFor(() => running.events().filter(entry => entry.action === 'retry').length >= 2, 'real retry timer must run twice', 15000)
    const backoff = running.events().filter(entry => entry.action === 'retry').map(entry => entry.retry_after_ms)
    assert.deepEqual(backoff.slice(0, 2), [10000, 20000])
    assert.equal((await fetch(running.base + '/health')).status, 200)
    assert.equal((await fetch(running.base + '/ready')).status, 503)
    assert.equal((await running.status()).cursor, 2)
    await stopTool(running)

    fixture.rows.push(row(3, compare ? { ...data, actual: '160000.00' } : { ...data, actual_progress_percent: 30 }))
    const queriesBefore = fixture.queries.length
    fixture.loseAcknowledgement = true
    running = await startTool(tool, coreBase + '/api/v1', stateDir)
    await waitFor(async () => running.events().some(entry => entry.action === 'retry' && entry.reason === 'central_http_503') && Boolean((await running.status()).pending), 'failed acknowledgement must persist the output')
    const pending = (await running.status()).pending.output.event_id
    assert.equal(fixture.queries[queriesBefore], 2, 'restoring the URL resumes from the durable input cursor')
    await stopTool(running)
    running = await startTool(tool, coreBase + '/api/v1', stateDir)
    await waitFor(async () => (await running.status()).cursor === 3, 'pending output must recover after a process restart')
    const recovered = await running.status()
    assert.equal(recovered.pending, null)
    assert.equal(recovered.last_publication.event_id, pending)
    assert.equal(recovered.last_publication.status, 'duplicate')
    assert.equal(recovered.last_publication.http_status, 200)
    assert.equal(fixture.accepted.size, 2, 'no output lost or duplicated across restarts')
    assert.equal(fixture.attempts.at(-1).event_id, fixture.attempts.at(-2).event_id)
    assert.ok(Object.keys(before.records).every(id => Object.hasOwn(recovered.records, id)))
    assert.equal(JSON.stringify([...fixture.accepted.values()]).includes('NaN'), false)
    assert.equal(fixture.error, undefined)
    await stopTool(running)
    report.tools.push({ tool, malformed_event_discarded: true, valid_event_processed_afterwards: true, api_invalid_input: 400, empty_subscription_ready: 200, unavailable_core_health: 200, unavailable_core_ready: 503, real_backoff_ms: backoff.slice(0, 2), cursor_before_failure: 2, cursor_after_recovery: 3, records_preserved: true, pending_uuid_preserved: true, lost_acknowledgement_recovered_as_duplicate: true, unique_outputs: 2 })
    console.log(JSON.stringify({ tool, runtime_resilience: 'PASS' }))
  }
  console.log(JSON.stringify(report, null, 2))
} finally {
  for (const child of children) child.kill('SIGKILL')
  central.closeAllConnections()
  await new Promise(resolve => central.close(resolve))
  assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()))
  assert.ok(path.basename(temp).startsWith('isotools-runtime-'))
  await rm(temp, { recursive: true, force: true })
}
