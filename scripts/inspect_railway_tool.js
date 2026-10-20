import { execFileSync } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveAuthConfig } from '../src/tool-auth/oidc-config.js'

const CENTRAL_API = 'https://api-events.orcalabs.mx/api/v1'
const CONSUMES = { compare_planned_vs_actual: 'ERP_SALES_PERIOD_CLOSED', track_project_progress: 'KPI_REPORT_GENERATED' }
const TOOL_ORIGINS = { compare_planned_vs_actual: 'https://cpa.orcalabs.mx', track_project_progress: 'https://tpp.orcalabs.mx' }
const configured = (variables, name) => Object.hasOwn(variables, name) && (variables[name] === null || Boolean(variables[name]?.trim()))

export function inspectConfiguration (variables, toolId, configuredHealthUrl = '') {
  if (!CONSUMES[toolId] || !variables || typeof variables !== 'object' || Array.isArray(variables)) throw new Error('invalid_configuration_response')
  let healthUrl = configuredHealthUrl
  if (!healthUrl && /^[a-z0-9.-]+$/i.test(variables.RAILWAY_PUBLIC_DOMAIN || '')) healthUrl = `https://${variables.RAILWAY_PUBLIC_DOMAIN}/health`
  if (healthUrl) {
    const url = new URL(healthUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/health') throw new Error('invalid_health_url')
    healthUrl = url.href
  }
  // Sealed secrets prove presence, not their value or strength. Never rotate them here.
  const authVariables = { ...variables, NODE_ENV: 'production' }
  for (const name of ['SESSION_SECRET', 'OIDC_CLIENT_SECRET', 'APP_SECRETS']) {
    if (variables[name] === null) authVariables[name] = 'sealed-secret-value-not-readable-32-characters'
  }
  let ssoConfigured = false
  try { ssoConfigured = resolveAuthConfig(authVariables) !== null } catch { /* Report only booleans. */ }
  return {
    tool: toolId,
    api_url_configured: configured(variables, 'ISOTOOLS_API_URL'),
    api_url_matches: variables.ISOTOOLS_API_URL === CENTRAL_API,
    api_url_is_origin_only: variables.ISOTOOLS_API_URL?.replace(/\/$/, '') === 'https://api-events.orcalabs.mx',
    api_key_configured: configured(variables, 'ISOTOOLS_API_KEY'),
    api_key_readable: typeof variables.ISOTOOLS_API_KEY === 'string' && Boolean(variables.ISOTOOLS_API_KEY.trim()),
    tool_id_matches: !variables.TOOL_PAGE_ID || variables.TOOL_PAGE_ID === toolId,
    dockerfile_matches: !variables.RAILWAY_DOCKERFILE_PATH || variables.RAILWAY_DOCKERFILE_PATH === `Docker/${toolId}.Dockerfile`,
    open_mode_configured: !configured(variables, 'OIDC_ISSUER') && !configured(variables, 'ISSUER_ENDPOINT') && !configured(variables, 'TOOL_API_KEY'),
    sso_configured: ssoConfigured,
    sso_missing_variables: [['OIDC_ISSUER', 'ISSUER_ENDPOINT'], ['OIDC_CLIENT_ID', 'APP_ID'], ['OIDC_CLIENT_SECRET', 'APP_SECRETS'], ['OIDC_REDIRECT_URI'], ['SESSION_SECRET']].filter(names => !names.some(name => configured(variables, name))).map(names => names.join('/')),
    redirect_uri_matches: variables.OIDC_REDIRECT_URI === `${TOOL_ORIGINS[toolId]}/auth/callback`,
    session_secret_configured: configured(variables, 'SESSION_SECRET'),
    tool_api_key_configured: configured(variables, 'TOOL_API_KEY'),
    connector_credential_names_to_review: Object.keys(variables).filter(name => /^(CF_ACCESS_|MICROSIP_|ERP_(HOST|URL|USER|PASSWORD|PASS|TOKEN|API_KEY|CONNECTION|DATABASE))/.test(name) && configured(variables, name)),
    roles_scope_configured: (variables.OIDC_SCOPES || 'openid profile email roles').split(/\s+/).includes('roles'),
    post_logout_redirect_uri_matches: variables.OIDC_POST_LOGOUT_REDIRECT_URI?.trim().replace(/\/$/, '') === 'https://api-events.orcalabs.mx',
    consumer_enabled: variables.TOOL_CONSUMER_ENABLED === 'true',
    volume_mounted_at_data: variables.RAILWAY_VOLUME_MOUNT_PATH === '/data' ? true : null,
    state_path_matches: !variables.TOOL_STATE_DIR || variables.TOOL_STATE_DIR === '/data',
    business_config_configured: Boolean(variables.TOOL_BUSINESS_CONFIG_FILE?.trim()),
    health_url: healthUrl || null
  }
}

export async function inspectConnection (variables, toolId, configuredHealthUrl = '', fetcher = fetch) {
  const report = inspectConfiguration(variables, toolId, configuredHealthUrl)
  report.central_api_key_works = null
  if (report.api_key_readable) {
    report.central_api_key_works = false
    try {
      // Read the subscription only: inspection never publishes or moves a cursor.
      const response = await fetcher(`${CENTRAL_API}/events/subscriptions/${toolId}?since_seq=0&limit=1`, {
        headers: { 'x-api-key': variables.ISOTOOLS_API_KEY }, redirect: 'error', signal: AbortSignal.timeout(15000)
      })
      report.central_http_status = response.status
      if (response.ok) {
        const payload = await response.json()
        report.central_api_key_works = payload.consumer === toolId && Array.isArray(payload.consumes) && payload.consumes.includes(CONSUMES[toolId]) && Array.isArray(payload.events)
      }
    } catch { report.central_connection_failed = true }
  }
  if (report.health_url) {
    try {
      const response = await fetcher(report.health_url, { redirect: 'error', signal: AbortSignal.timeout(15000) })
      report.health_http_status = response.status
      if (response.ok) {
        const health = await response.json()
        report.deployed_tool_identity_matches = health.tool === toolId
        report.deployed_build_sha = /^[a-f0-9]{40}$/.test(health.build_sha || '') ? health.build_sha : null
        report.deployed_auth_mode_sso = health.auth === 'sso'
      }
      const session = await fetcher(new URL('/auth/me', report.health_url).href, { redirect: 'error', signal: AbortSignal.timeout(15000) })
      const description = await session.json()
      report.deployed_auth_mode_open = session.ok && description.mode === 'open'
      report.anonymous_session_rejected = session.status === 401 && description.mode === 'sso' && description.authenticated === false
      const api = await fetcher(new URL('/api/tool/status', report.health_url).href, { redirect: 'error', signal: AbortSignal.timeout(15000) })
      const apiBody = await api.json()
      report.anonymous_api_rejected = api.status === 401 && apiBody.error === 'authentication_required'
    } catch { report.health_connection_failed = true }
  }
  return report
}

export function stateDirectoryIsPersistent (volumeList, service, stateDirectory = '/data') {
  if (!Array.isArray(volumeList.volumes)) throw new Error('invalid_volume_response')
  return volumeList.volumes.some(volume => volume.serviceName === service && !volume.isPendingDeletion && !volume.deletedAt &&
    typeof volume.mountPath === 'string' && volume.mountPath !== '/' &&
    (stateDirectory === volume.mountPath || stateDirectory.startsWith(`${volume.mountPath}/`)))
}

export async function inspectFrontendBundle (variables, healthUrl, fetcher = fetch) {
  const report = { frontend_bundle_checked: false, frontend_key_leak: null, frontend_actual_key_checked: false, frontend_actual_client_secret_checked: false, frontend_actual_session_secret_checked: false }
  try {
    const origin = new URL(healthUrl).origin
    const shell = await fetcher(origin, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
    let paths = []
    if (shell.ok && shell.headers.get('content-type')?.includes('text/html')) {
      const html = await shell.text()
      paths = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match => new URL(match[1], origin))
    } else if (shell.status === 302) {
      // The shell requires login; Vite's public asset manifest contains no session data.
      const manifest = await fetcher(`${origin}/assets/manifest.json`, { redirect: 'error', signal: AbortSignal.timeout(15000) })
      if (!manifest.ok) return report
      const entries = Object.values(await manifest.json())
      paths = entries.flatMap(entry => [entry.file, ...(entry.css || [])]).filter(Boolean).map(file => new URL(file, `${origin}/`))
    }
    paths = paths.filter(url => url.origin === origin && url.pathname.startsWith('/assets/'))
    if (paths.length === 0) return report
    const readable = value => typeof value === 'string' && value.trim().length >= 8
    const keys = [variables.ISOTOOLS_API_KEY, variables.TOOL_API_KEY, variables.APP_SECRETS, variables.OIDC_CLIENT_SECRET, variables.SESSION_SECRET].filter(readable)
    let leak = false
    for (const url of paths) {
      const response = await fetcher(url.href, { redirect: 'error', signal: AbortSignal.timeout(15000) })
      if (!response.ok) return report
      const script = await response.text()
      leak ||= /ISOTOOLS_API_KEY|TOOL_API_KEY|APP_SECRETS|OIDC_CLIENT_SECRET|SESSION_SECRET|CF_ACCESS|erp-planta1|MICROSIP/.test(script) || keys.some(key => script.includes(key.trim().slice(0, 8)))
    }
    const clientSecret = configured(variables, 'OIDC_CLIENT_SECRET') ? variables.OIDC_CLIENT_SECRET : variables.APP_SECRETS
    return { frontend_bundle_checked: true, frontend_key_leak: leak, frontend_actual_key_checked: readable(variables.ISOTOOLS_API_KEY), frontend_actual_client_secret_checked: readable(clientSecret), frontend_actual_session_secret_checked: readable(variables.SESSION_SECRET) }
  } catch { return report }
}

export function hasDataVolume (volumeList, service) {
  return stateDirectoryIsPersistent(volumeList, service, '/data')
}

export function deploymentConfigurationReady (report) {
  // Railway-first deployment is allowed while paused; an active worker must have a valid central key.
  return report.api_url_matches && (!report.consumer_enabled || report.central_api_key_works === true) &&
    report.tool_id_matches && report.dockerfile_matches && report.sso_configured && report.redirect_uri_matches &&
    report.state_directory_persistent === true && Boolean(report.health_url)
}

export function railwayText (args, input) {
  return execFileSync('railway', args, { input, encoding: 'utf8', stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], timeout: 60000, maxBuffer: 5 * 1024 * 1024 })
}

export function railwayJson (args, input) {
  return JSON.parse(railwayText(args, input))
}

export function inspectRailwayOperations (toolId, service, json = railwayJson, raw = railwayText) {
  const report = { deployment_query_succeeded: false, latest_deployment_status: null, runtime_log_queries_succeeded: false, runtime_log_lines_read: 0, runtime_json_logs_read: 0, observed_log_actions: [], runtime_log_samples: [] }
  try {
    const deployments = json(['deployment', 'list', '--service', service, '--limit', '5', '--json'])
    if (!Array.isArray(deployments)) throw new Error('invalid_deployment_list')
    const latest = deployments[0]
    const statuses = ['SUCCESS', 'FAILED', 'CRASHED', 'BUILDING', 'DEPLOYING', 'REMOVED', 'QUEUED', 'SKIPPED', 'WAITING', 'INITIALIZING', 'NEEDS_APPROVAL', 'SLEEPING']
    report.deployment_query_succeeded = true
    report.latest_deployment_status = statuses.includes(latest?.status) ? latest.status : null
    if (/^[a-f0-9-]{36}$/i.test(latest?.id || '')) report.latest_deployment_id = latest.id
  } catch { /* Raw CLI errors may contain credentials. Keep the failed query explicit. */ }
  const actions = new Set()
  try {
    for (const filter of [null, 'published OR processed OR discarded OR retry']) {
      const output = raw(['logs', '--service', service, '--lines', '100', '--json', ...(filter ? ['--filter', filter] : [])])
      for (const line of output.split(/\r?\n/)) {
        if (!line.trim()) continue
        report.runtime_log_lines_read++
        let row, entry
        try {
          row = JSON.parse(line)
          report.runtime_json_logs_read++
          // Railway may flatten structured JSON fields into log attributes.
          entry = row.tool && row.action ? row : typeof row.message === 'string' ? JSON.parse(row.message) : row
        } catch { continue }
        if (entry.tool !== toolId || !['poll', 'published', 'processed', 'discarded', 'retry', 'duplicate_input', 'duplicate_period'].includes(entry.action)) continue
        actions.add(entry.action)
        const sample = { action: entry.action }
        for (const name of ['cursor', 'count', 'next_seq', 'input_seq', 'seq', 'retry_after_ms', 'http_status']) {
          if (Number.isSafeInteger(entry[name]) && entry[name] >= 0) sample[name] = entry[name]
        }
        if (typeof row.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(row.timestamp) && Number.isFinite(Date.parse(row.timestamp))) sample.timestamp = new Date(row.timestamp).toISOString()
        report.runtime_log_samples.push(sample)
      }
    }
    report.runtime_log_queries_succeeded = true
  } catch { /* A log permission or CLI failure is not proof of healthy operation. */ }
  report.observed_log_actions = [...actions].sort()
  report.runtime_log_samples = report.runtime_log_samples.slice(-12)
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.env.RAILWAY_TOKEN || !process.env.RAILWAY_SERVICE) throw new Error('missing_workflow_configuration')
    let variables
    try {
      // CLI JSON contains secrets. Capture it in memory and never print raw stdout/stderr.
      variables = railwayJson(['variable', 'list', '--service', process.env.RAILWAY_SERVICE, '--json'])
    } catch { throw new Error('railway_variables_query_failed') }
    const report = await inspectConnection(variables, process.env.TOOL_PAGE_ID, process.env.HEALTH_URL)
    if (report.health_url) Object.assign(report, await inspectFrontendBundle(variables, report.health_url))
    try {
      const volumeList = railwayJson(['volume', '--service', process.env.RAILWAY_SERVICE, 'list', '--json'])
      report.volume_mounted_at_data = hasDataVolume(volumeList, process.env.RAILWAY_SERVICE)
      report.state_directory_persistent = stateDirectoryIsPersistent(volumeList, process.env.RAILWAY_SERVICE, variables.TOOL_STATE_DIR || '/data')
      report.volume_query_succeeded = true
    } catch { report.volume_query_succeeded = false }
    Object.assign(report, inspectRailwayOperations(process.env.TOOL_PAGE_ID, process.env.RAILWAY_SERVICE))
    console.log(JSON.stringify(report, null, 2))
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### ${report.tool}\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`)
    if (report.health_url && process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `HEALTH_URL=${report.health_url}\n`)
    if (process.argv.includes('--require-deploy-config') && !deploymentConfigurationReady(report)) throw new Error('deployment_configuration_incomplete')
    if (process.argv.includes('--require-deployed-tool') && (!report.deployed_tool_identity_matches || !report.deployed_auth_mode_sso || !report.anonymous_session_rejected || !report.anonymous_api_rejected || report.deployed_build_sha !== process.env.GITHUB_SHA)) throw new Error('deployed_tool_verification_failed')
    if (process.argv.includes('--require-deployed-tool') && (!report.frontend_bundle_checked || report.frontend_key_leak !== false || !report.frontend_actual_key_checked || !report.frontend_actual_client_secret_checked || !report.frontend_actual_session_secret_checked)) throw new Error('frontend_bundle_unsafe_or_unverified')
  } catch (error) {
    const safe = ['missing_workflow_configuration', 'railway_variables_query_failed', 'deployment_configuration_incomplete', 'deployed_tool_verification_failed', 'frontend_bundle_unsafe_or_unverified', 'invalid_configuration_response', 'invalid_health_url'].includes(error.message) ? error.message : 'railway_inspection_failed'
    console.error(safe)
    process.exitCode = 1
  }
}
