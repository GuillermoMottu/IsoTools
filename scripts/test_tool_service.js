import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createToolConsumer, salesInput, subscriptionEvent } from '../src/services/toolConsumer.js'
import { resolveAuthConfig } from '../src/tool-auth/oidc-config.js'
import { signSession, buildCookie } from '../src/tool-auth/session-cookie.js'
import { mapRoles, DEFAULT_ROLE_MAPPINGS } from '../src/tool-auth/role-mapping.js'
import { runComparePlannedVsActualTool, runTrackProjectProgressTool } from '../src/services/compareTrackDemoService.js'

const temp = await mkdtemp(path.join(os.tmpdir(), 'isotools-checklist-'))
const servers = []
async function listen (server) {
  servers.push(server)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}`
}
try {
  const { createToolApp } = await import('../src/tool-server.js')
  const dist = path.join(temp, 'dist')
  await mkdir(dist)
  await writeFile(path.join(dist, 'index.html'), '<html>existing tool</html>')
  const toolId = process.argv.includes('--track') ? 'track_project_progress' : 'compare_planned_vs_actual'
  const appEnv = { TOOL_PAGE_ID: toolId, TOOL_STATE_DIR: path.join(temp, 'app'), WEB_DIST_DIR: dist }
  const { app, stop } = await createToolApp(appEnv)
  const base = await listen(http.createServer(app))
  assert.equal((await fetch(`${base}/health`)).status, 200)
  assert.equal((await fetch(`${base}/ready`)).status, 503)
  assert.equal((await fetch(`${base}/api/absent`)).status, 404)
  const unauthorized = await fetch(`${base}/api/tool/status`, { redirect: 'manual' })
  if (process.env.OIDC_ISSUER) {
    assert.equal(unauthorized.status, 401)
    assert.equal((await unauthorized.json()).error, 'authentication_required')
  } else {
    assert.equal(unauthorized.status, 200)
    assert.equal((await fetch(`${base}/api/tool/${toolId}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"input":{}}' })).status, 400)
  }
  assert.equal((await fetch(`${base}/api/tool/${toolId}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, process.env.OIDC_ISSUER ? 401 : 400)
  if (process.argv.includes('--sso')) {
    const recordsRoute = toolId === 'compare_planned_vs_actual' ? '/api/analyses' : '/api/records'
    const runRoute = `/api/tool/${toolId}/run`
    assert.equal((await fetch(`${base}${recordsRoute}`)).status, 401)
    assert.equal((await fetch(`${base}${runRoute}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"input":{}}' })).status, 401)
    for (const route of ['/deep/link?x=1', '/index.html']) {
      const r = await fetch(`${base}${route}`, { redirect: 'manual' })
      assert.equal(r.status, 302)
      assert.equal(r.headers.get('location'), `/auth/login?return_to=${encodeURIComponent(route)}`)
    }
    // Local signed sessions exercise authorization only; they do not prove Logto role delivery.
    const cookie = roles => `${process.env.SESSION_COOKIE_NAME}=${signSession({ sub: 'test-user', name: 'Operator', roles, exp: Math.floor(Date.now() / 1000) + 60 }, process.env.SESSION_SECRET)}`
    assert.equal((await fetch(`${base}${recordsRoute}`, { headers: { cookie: cookie([]) } })).status, 403)
    assert.equal((await fetch(`${base}${recordsRoute}`, { headers: { cookie: cookie(['OperationsManager']) } })).status, 200)
    assert.equal((await fetch(`${base}${recordsRoute}`, { headers: { cookie: cookie(['OperationsManager']) + 'tampered' } })).status, 401)
    assert.equal((await fetch(`${base}${recordsRoute}`, { headers: { cookie: cookie(['Auditor']) } })).status, 200)
    for (const roles of [[], ['Auditor']]) {
      assert.equal((await fetch(`${base}${runRoute}`, { method: 'POST', headers: { cookie: cookie(roles), 'content-type': 'application/json' }, body: '{"input":{},"authorizedByRole":"OperationsManager"}' })).status, 403)
    }
    const sample = toolId === 'compare_planned_vs_actual' ? runComparePlannedVsActualTool({ scenario: 'critical' }) : runTrackProjectProgressTool({ scenario: 'at_risk' })
    const evaluation = await fetch(`${base}${runRoute}`, { method: 'POST', headers: { cookie: cookie(['OperationsManager']), 'content-type': 'application/json' }, body: JSON.stringify({ input: sample.input, actor: { subject: 'forged', role: 'Auditor' } }) })
    assert.equal(evaluation.status, 200)
    const result = await evaluation.json()
    assert.deepEqual(result.result.audit.evaluated_by, { subject: 'test-user', role: 'OperationsManager' })
    assert.equal(result.result.status, sample.result.status)
    console.log(`SSO local ${toolId}: anonymous 401, no-role 403, auditor read 200/write 403, operator evaluation 200, actor binding, tampered cookie and deep links PASS`)
    stop()
  } else {
    assert.equal((await (await fetch(`${base}/auth/me`)).json()).mode, 'open')
    assert.deepEqual(await (await fetch(`${base}/api/analyses`)).json(), {})
    stop()
    assert.equal(resolveAuthConfig({}), null)
    assert.throws(() => resolveAuthConfig({ OIDC_ISSUER: 'https://idp.example' }), /SESSION_SECRET/)
    assert.deepEqual(mapRoles(['operations.manager', 'unknown.admin'], DEFAULT_ROLE_MAPPINGS), ['OperationsManager'])
    assert.ok(!buildCookie({ name: 'cpa_session', value: 'value', secure: true, maxAgeSeconds: 60 }).includes('Domain='))
    const row = seq => ({ seq: String(seq), event_id: `input-${seq}`, correlation_id: 'sales-chain', timestamp: '2026-09-28T23:00:00Z', asset_id: 'sales-plant_01', plant_id: 'plant_01', event_type: 'ERP_SALES_PERIOD_CLOSED', data: { module: 'sales', periodStart: '2026-09-28', periodEnd: '2026-09-28', period: '2026-09-28_2026-09-28', plantId: 'plant_01', actual: 124743.35, unit: 'MXN', erpType: 'microsip' } })
    const sale = subscriptionEvent(row(11), 'ERP_SALES_PERIOD_CLOSED')
    assert.throws(() => salesInput({ ...sale, data: { ...sale.data, periodEnd: '2026-02-31', period: '2026-09-28_2026-02-31' } }), /invalid_sales_period/)
    assert.throws(() => salesInput({ ...sale, asset: { ...sale.asset, plant_id: 'other-plant' } }), /invalid_sales_period/)
    let rows = [{ ...row(11), data: { ...row(11).data, actual: 124740 } }, row(12)]
    let failPost = true
    const outputs = []
    const queries = []
    const central = await listen(http.createServer(async (req, res) => {
      assert.equal(req.headers['x-api-key'], 'fixture-key')
      const url = new URL(req.url, 'http://fixture')
      let payload
      let code = 200
      if (req.method === 'POST') {
        let raw = ''
        for await (const chunk of req) raw += chunk
        const output = JSON.parse(raw)
        outputs.push(output)
        code = failPost ? 503 : 201
        payload = { status: outputs.length === 2 ? 'duplicate' : 'accepted', event_id: output.event_id, seq: 999 }
      } else if (url.pathname.endsWith('/latest')) payload = { max_seq: '12', events: [row(12)] }
      else {
        const cursor = Number(url.searchParams.get('since_seq'))
        queries.push(cursor)
        const events = rows.filter(r => Number(r.seq) > cursor)
        payload = { consumer: 'compare_planned_vs_actual', consumes: ['ERP_SALES_PERIOD_CLOSED'], events, next_seq: events.at(-1)?.seq || cursor }
      }
      res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(payload))
    }))
    const business = path.join(temp, 'business.json')
    await writeFile(business, JSON.stringify({ organization_id: 'TEST', sales_plans: [{ plant_id: 'plant_01', period: '2026-09-28_2026-09-28', planned: 150000, unit: 'MXN' }] }))
    const settings = { toolId: 'compare_planned_vs_actual', apiUrl: central, apiKey: 'fixture-key', stateDir: path.join(temp, 'consumer'), businessConfigFile: business, initialCursor: 10 }
    let consumer = await createToolConsumer(settings)
    assert.equal((await consumer.tick()).reason, 'central_http_503')
    assert.equal(consumer.snapshot().cursor, 10)
    assert.equal(outputs.length, 1, 'failed earlier publication prevents later input processing')
    const durable = JSON.parse(await readFile(path.join(settings.stateDir, `${settings.toolId}.json`), 'utf8'))
    assert.equal(durable.pending.output.event_id, outputs[0].event_id)
    consumer = await createToolConsumer(settings)
    failPost = false
    assert.equal((await consumer.tick()).status, 'ready')
    assert.equal(outputs[1].event_id, outputs[0].event_id, 'restart retries the same event ID')
    assert.deepEqual(queries, [10, 11])
    assert.equal(consumer.snapshot().cursor, 12, 'POST sequence must not replace input cursor')
    assert.equal(outputs[2].causation_id, 'input-12')
    assert.equal(outputs[2].correlation_id, 'sales-chain')
    assert.equal(outputs[2].module.id, settings.toolId)
    assert.equal(outputs[2].event.type, 'PRODUCTION_VARIANCE_DETECTED')
    assert.equal(outputs[2].data.domain, 'sales')
    assert.equal(outputs[2].data.details.metrics[0].actual, 124743.35)
    assert.equal(outputs[2].data.source_period, '2026-09-28_2026-09-28')
    const noPlan = await createToolConsumer({ ...settings, stateDir: path.join(temp, 'missing-plan'), businessConfigFile: undefined })
    const count = outputs.length
    assert.equal((await noPlan.tick()).status, 'ready')
    assert.equal(noPlan.snapshot().cursor, 12, 'missing target does not stall ERP consumption')
    assert.equal(outputs.length, count + 2)
    const withoutTarget = outputs.at(-1)
    assert.equal(withoutTarget.data.status, 'sin_meta')
    assert.equal(withoutTarget.data.deviationPercent, null)
    assert.equal(withoutTarget.data.deviation_percent, null)
    assert.equal(withoutTarget.data.weighted_deviation_percent, null)
    assert.equal(withoutTarget.data.details.actual, 124743.35)
    assert.equal(withoutTarget.data.details.planned, null)
    assert.equal(withoutTarget.data.organization_id, null, 'organization is not invented to publish a real fact')
    assert.equal(withoutTarget.data.source_period, '2026-09-28_2026-09-28')
    assert.equal(withoutTarget.causation_id, 'input-12')
    assert.equal(withoutTarget.correlation_id, 'sales-chain')
    const cachedApp = await createToolApp({ ...appEnv, TOOL_STATE_DIR: path.join(temp, 'missing-plan') })
    const cachedBase = await listen(http.createServer(cachedApp.app))
    const records = await (await fetch(`${cachedBase}/api/analyses`)).json()
    const storedInput = Object.values(records)[0]
    const runCached = input => fetch(`${cachedBase}/api/tool/compare_planned_vs_actual/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input }) })
    const cachedResult = await runCached(storedInput)
    assert.equal(cachedResult.status, 200)
    assert.equal((await cachedResult.json()).result.status, 'sin_meta')
    assert.equal((await runCached({ ...storedInput, metrics: [{ ...storedInput.metrics[0], actual: 999999 }] })).status, 400, 'edited data cannot borrow the stored ERP result')
    cachedApp.stop()
    const afterMissingTarget = outputs.length
    await writeFile(business, JSON.stringify({ organization_id: 'TEST', sales_plans: [{ plant_id: 'plant_01', period: '2026-09-28_2026-09-28', planned: 'invalid', unit: 'MXN' }] }))
    const invalidPlan = await createToolConsumer({ ...settings, stateDir: path.join(temp, 'invalid-plan') })
    assert.equal((await invalidPlan.tick()).reason, 'invalid_sales_plan')
    assert.equal(invalidPlan.snapshot().cursor, 10)
    assert.equal(outputs.length, afterMissingTarget, 'a malformed configured target must not be published as missing')
    const fresh = await createToolConsumer({ ...settings, stateDir: path.join(temp, 'fresh'), initialCursor: undefined })
    assert.equal((await fresh.tick()).status, 'ready')
    assert.equal(outputs.length, afterMissingTarget, 'first boot starts at the tip without replaying history')
    rows = [row(14), row(13)]
    assert.equal((await consumer.tick()).reason, 'invalid_subscription_order')
    assert.equal(consumer.snapshot().cursor, 12)
    const projectSettings = { ...settings, toolId: 'track_project_progress', stateDir: path.join(temp, 'project'), initialCursor: 0, fetcher: async () => new Response(JSON.stringify({ consumer: 'track_project_progress', consumes: ['KPI_REPORT_GENERATED'], events: [{ ...row(1), event_type: 'KPI_REPORT_GENERATED', data: { kpis: [] } }], next_seq: 1 })) }
    const project = await createToolConsumer(projectSettings)
    assert.equal((await project.tick()).status, 'ready')
    assert.equal(project.snapshot().cursor, 1)
    assert.equal(project.snapshot().rejected['input-1'].reason, 'input_not_calculable')
    const projectOutputs = []
    const projectData = { organization_id: 'TEST', project_id: 'P-TEST', project_name: 'HTTP fixture', as_of_date: '2026-07-23T12:00:00Z', planned_start_date: '2026-07-01T00:00:00Z', planned_end_date: '2026-09-30T00:00:00Z', planned_progress_percent: 40, actual_progress_percent: 40, milestones: [] }
    const projectCycle = await createToolConsumer({
      ...projectSettings,
      stateDir: path.join(temp, 'project-cycle'),
      fetcher: async (url, options) => {
        if (options.method === 'POST') {
          const event = JSON.parse(options.body)
          projectOutputs.push(event)
          return new Response(JSON.stringify({ status: 'accepted', event_id: event.event_id, seq: 400 }))
        }
        return new Response(JSON.stringify({
          consumer: 'track_project_progress',
          consumes: ['KPI_REPORT_GENERATED'],
          events: [
            { ...row(1), event_type: 'KPI_REPORT_GENERATED', data: projectData },
            { ...row(2), event_type: 'KPI_REPORT_GENERATED', data: { ...projectData, actual_progress_percent: 34 } }
          ],
          next_seq: 2
        }))
      }
    })
    assert.equal((await projectCycle.tick()).status, 'ready')
    assert.equal(projectCycle.snapshot().cursor, 2)
    assert.equal(projectOutputs.length, 1, 'on-track project does not emit a risk alert')
    assert.equal(projectOutputs[0].event.type, 'PROJECT_AT_RISK')
    assert.equal(projectOutputs[0].causation_id, 'input-2')
    assert.equal(projectOutputs[0].data.project_id, 'P-TEST')
    for (const track of [false, true]) {
      const sso = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--sso', ...(track ? ['--track'] : [])], { env: { ...process.env, OIDC_ISSUER: 'https://idp.example', OIDC_CLIENT_ID: 'fixture', OIDC_CLIENT_SECRET: 'fixture', OIDC_REDIRECT_URI: 'http://localhost/auth/callback', SESSION_SECRET: 'test-secret-only-32-characters-long', SESSION_COOKIE_NAME: track ? 'tpp_session' : 'cpa_session', TOOL_API_KEY: '', SESSION_INSECURE_COOKIES: 'true' }, encoding: 'utf8' })
      assert.equal(sso.status, 0, sso.stdout + sso.stderr)
      console.log(sso.stdout.trim())
    }
    console.log('Tool consumer: HTTP cycle, sales adapter, durable retry, cursor safety, missing inputs and bootstrap passed')
  }
} finally {
  await Promise.all(servers.map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })))
  await rm(temp, { recursive: true, force: true })
}
