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
  const appEnv = { TOOL_PAGE_ID: 'compare_planned_vs_actual', TOOL_STATE_DIR: path.join(temp, 'app'), WEB_DIST_DIR: dist }
  const { app, stop } = await createToolApp(appEnv)
  const base = await listen(http.createServer(app))
  assert.equal((await fetch(`${base}/health`)).status, 200)
  assert.equal((await fetch(`${base}/ready`)).status, 503)
  assert.equal((await fetch(`${base}/api/absent`)).status, 404)
  assert.equal((await fetch(`${base}/api/tool/compare_planned_vs_actual/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, process.env.OIDC_ISSUER ? 401 : 400)
  if (process.argv.includes('--sso')) {
    assert.equal((await fetch(`${base}/analyses`)).status, 401)
    for (const route of ['/deep/link?x=1', '/index.html']) {
      const r = await fetch(`${base}${route}`, { redirect: 'manual' })
      assert.equal(r.status, 302)
      assert.equal(r.headers.get('location'), `/auth/login?return_to=${encodeURIComponent(route)}`)
    }
    const cookie = roles => `cpa_session=${signSession({ sub: 'test-user', name: 'Operator', roles, exp: Math.floor(Date.now() / 1000) + 60 }, process.env.SESSION_SECRET)}`
    assert.equal((await fetch(`${base}/analyses`, { headers: { cookie: cookie([]) } })).status, 403)
    assert.equal((await fetch(`${base}/analyses`, { headers: { cookie: cookie(['OperationsManager']) } })).status, 200)
    assert.equal((await fetch(`${base}/analyses`, { headers: { cookie: cookie(['OperationsManager']) + 'tampered' } })).status, 401)
    assert.equal((await fetch(`${base}/analyses`, { headers: { cookie: cookie(['Auditor']) } })).status, 200)
    assert.equal((await fetch(`${base}/api/tool/compare_planned_vs_actual/run`, { method: 'POST', headers: { cookie: cookie(['Auditor']), 'content-type': 'application/json' }, body: '{"input":{},"authorizedByRole":"OperationsManager"}' })).status, 403)
    console.log('SSO: health, JSON 401, deep links, roles, forged payload and signed sessions passed')
    stop()
  } else {
    assert.equal((await (await fetch(`${base}/auth/me`)).json()).mode, 'open')
    assert.deepEqual(await (await fetch(`${base}/analyses`)).json(), {})
    stop()
    assert.equal(resolveAuthConfig({}), null)
    assert.throws(() => resolveAuthConfig({ OIDC_ISSUER: 'https://idp.example' }), /SESSION_SECRET/)
    assert.deepEqual(mapRoles(['operations.manager', 'unknown.admin'], DEFAULT_ROLE_MAPPINGS), ['OperationsManager'])
    assert.ok(!buildCookie({ name: 'cpa_session', value: 'value', secure: true, maxAgeSeconds: 60 }).includes('Domain='))
    const row = seq => ({ seq: String(seq), event_id: `input-${seq}`, correlation_id: 'sales-chain', timestamp: '2026-09-28T23:00:00Z', asset_id: 'sales-plant_01', plant_id: 'plant_01', event_type: 'ERP_SALES_PERIOD_CLOSED', data: { module: 'sales', periodStart: '2026-09-28', periodEnd: '2026-09-28', period: '2026-09-28_2026-09-28', plantId: 'plant_01', actual: 124743.35, unit: 'MXN', erpType: 'microsip' } })
    const sale = subscriptionEvent(row(11), 'ERP_SALES_PERIOD_CLOSED')
    assert.throws(() => salesInput({ ...sale, data: { ...sale.data, periodEnd: '2026-02-31', period: '2026-09-28_2026-02-31' } }), /invalid_sales_period/)
    assert.throws(() => salesInput({ ...sale, asset: { ...sale.asset, plant_id: 'other-plant' } }), /invalid_sales_period/)
    let rows = [row(11), row(12)]
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
    assert.equal((await noPlan.tick()).reason, 'input_not_calculable')
    assert.equal(noPlan.snapshot().cursor, 10)
    assert.equal(outputs.length, count)
    const fresh = await createToolConsumer({ ...settings, stateDir: path.join(temp, 'fresh'), initialCursor: undefined })
    assert.equal((await fresh.tick()).status, 'ready')
    assert.equal(outputs.length, count, 'first boot starts at the tip without replaying history')
    rows = [row(14), row(13)]
    assert.equal((await consumer.tick()).reason, 'invalid_subscription_order')
    assert.equal(consumer.snapshot().cursor, 12)
    const projectSettings = { ...settings, toolId: 'track_project_progress', stateDir: path.join(temp, 'project'), initialCursor: 0, fetcher: async () => new Response(JSON.stringify({ consumer: 'track_project_progress', consumes: ['KPI_REPORT_GENERATED'], events: [{ ...row(1), event_type: 'KPI_REPORT_GENERATED', data: { kpis: [] } }], next_seq: 1 })) }
    const project = await createToolConsumer(projectSettings)
    assert.equal((await project.tick()).reason, 'input_not_calculable')
    assert.equal(project.snapshot().cursor, 0)
    const projectOutputs = []
    const projectData = { organization_id: 'TEST', project_id: 'P-TEST', project_name: 'HTTP fixture', as_of_date: '2026-07-23T12:00:00Z', planned_start_date: '2026-07-01T00:00:00Z', planned_end_date: '2026-09-30T00:00:00Z', planned_progress_percent: 40, actual_progress_percent: 40, milestones: [] }
    const projectCycle = await createToolConsumer({ ...projectSettings, stateDir: path.join(temp, 'project-cycle'), fetcher: async (url, options) => {
      if (options.method === 'POST') {
        const event = JSON.parse(options.body)
        projectOutputs.push(event)
        return new Response(JSON.stringify({ status: 'accepted', event_id: event.event_id, seq: 400 }))
      }
      return new Response(JSON.stringify({ consumer: 'track_project_progress', consumes: ['KPI_REPORT_GENERATED'], events: [
        { ...row(1), event_type: 'KPI_REPORT_GENERATED', data: projectData },
        { ...row(2), event_type: 'KPI_REPORT_GENERATED', data: { ...projectData, actual_progress_percent: 34 } }
      ], next_seq: 2 }))
    } })
    assert.equal((await projectCycle.tick()).status, 'ready')
    assert.equal(projectCycle.snapshot().cursor, 2)
    assert.equal(projectOutputs.length, 1, 'on-track project does not emit a risk alert')
    assert.equal(projectOutputs[0].event.type, 'PROJECT_AT_RISK')
    assert.equal(projectOutputs[0].causation_id, 'input-2')
    assert.equal(projectOutputs[0].data.project_id, 'P-TEST')
    const sso = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--sso'], { env: { ...process.env, OIDC_ISSUER: 'https://idp.example', OIDC_CLIENT_ID: 'fixture', OIDC_CLIENT_SECRET: 'fixture', OIDC_REDIRECT_URI: 'http://localhost/auth/callback', SESSION_SECRET: 'test-secret-only-32-characters-long', SESSION_COOKIE_NAME: 'cpa_session', TOOL_API_KEY: '', SESSION_INSECURE_COOKIES: 'true' }, encoding: 'utf8' })
    assert.equal(sso.status, 0, sso.stdout + sso.stderr)
    console.log(sso.stdout.trim())
    console.log('Tool consumer: HTTP cycle, sales adapter, durable retry, cursor safety, missing inputs and bootstrap passed')
  }
} finally {
  await Promise.all(servers.map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })))
  await rm(temp, { recursive: true, force: true })
}
