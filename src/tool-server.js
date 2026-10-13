import 'dotenv/config'
import express from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TOOL_CONTRACTS, createToolConsumer } from './services/toolConsumer.js'
import { attachCaller, authEnabled, authMode, gateway, requireCaller, requireRole, requireBrowserSession, describeSession } from './tool-auth/index.js'
import { runComparePlannedVsActualTool, runTrackProjectProgressTool } from './services/compareTrackDemoService.js'
import { rateLimit } from './middleware/rateLimit.js'

export async function createToolApp (env = process.env) {
  const toolId = env.TOOL_PAGE_ID
  if (!TOOL_CONTRACTS[toolId]) throw new Error('TOOL_PAGE_ID must select compare_planned_vs_actual or track_project_progress')
  const enabled = env.TOOL_CONSUMER_ENABLED === 'true'
  const consumer = await createToolConsumer({
    toolId, apiUrl: env.ISOTOOLS_API_URL || 'https://api-events.orcalabs.mx/api/v1',
    apiKey: env.ISOTOOLS_API_KEY, stateDir: env.TOOL_STATE_DIR || '.tool-state',
    businessConfigFile: env.TOOL_BUSINESS_CONFIG_FILE,
    initialCursor: env.TOOL_INITIAL_CURSOR
  })
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '1mb' }))
  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'isotools-tool', tool: toolId, auth: authMode, build_sha: env.TOOL_BUILD_SHA || null }))
  app.get('/ready', (req, res) => {
    const status = enabled ? consumer.readiness() : { status: 'not_ready', reason: 'consumer_disabled' }
    res.status(status.status === 'ready' ? 200 : 503).json(status)
  })
  app.use(attachCaller)
  app.get('/auth/me', (req, res) => res.set('cache-control', 'no-store').status(req.caller || !authEnabled ? 200 : 401).json(describeSession(req)))
  if (authEnabled) {
    for (const route of ['login', 'callback', 'logout']) app.get(`/auth/${route}`, (req, res) => gateway.handleRoute(req, res, route))
  }
  app.get(toolId === 'compare_planned_vs_actual' ? '/analyses' : '/records', requireCaller, requireRole('OperationsManager', 'Auditor'), (req, res) => res.set('cache-control', 'no-store').json(consumer.snapshot().records))
  app.get('/api/tool/status', requireCaller, requireRole('OperationsManager', 'Auditor'), (req, res) => res.set('cache-control', 'no-store').json(consumer.snapshot()))
  app.post(`/api/tool/${toolId}/run`, requireCaller, requireRole('OperationsManager'), rateLimit(), (req, res) => {
    // This endpoint evaluates only; automatic publication belongs to the consumer.
    if (!req.body || !Object.hasOwn(req.body, 'input') || !req.body.input || typeof req.body.input !== 'object' || Array.isArray(req.body.input)) return res.status(400).json({ error: 'explicit_input_required' })
    const run = toolId === 'compare_planned_vs_actual' ? runComparePlannedVsActualTool : runTrackProjectProgressTool
    res.json(run({ input: req.body.input }))
  })
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }))
  const dist = path.resolve(env.WEB_DIST_DIR || 'demo-frontend/dist')
  if (existsSync(path.join(dist, 'index.html'))) {
    // Shell HTML must pass the browser gate, including direct /index.html requests.
    app.use((req, res, next) => req.path.endsWith('.html') ? requireBrowserSession(req, res, next) : next())
    app.use(express.static(dist, { index: false }))
    app.get(/.*/, requireBrowserSession, (req, res) => res.set('cache-control', 'no-store').sendFile(path.join(dist, 'index.html')))
  }
  app.use((error, req, res, next) => res.status(error.status === 400 ? 400 : 500).json({ error: error.status === 400 ? 'invalid_json' : 'tool_request_failed' }))
  let stopped = false
  let timer
  async function poll () {
    await consumer.tick()
    if (!stopped) timer = setTimeout(poll, 10000)
  }
  if (enabled) void poll()
  return { app, consumer, stop: () => { stopped = true; clearTimeout(timer) } }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { app, stop } = await createToolApp()
  const server = app.listen(Number(process.env.PORT || 3000), () => console.log(`[tool] ${process.env.TOOL_PAGE_ID} listening; auth=${authMode}`))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop(); server.close() })
}
