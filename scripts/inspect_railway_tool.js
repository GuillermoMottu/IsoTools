import { execFileSync } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CENTRAL_API = 'https://api-events.orcalabs.mx/api/v1'
const CONSUMES = { compare_planned_vs_actual: 'ERP_SALES_PERIOD_CLOSED', track_project_progress: 'KPI_REPORT_GENERATED' }
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
  return {
    tool: toolId,
    api_url_matches: variables.ISOTOOLS_API_URL === CENTRAL_API,
    api_key_configured: configured(variables, 'ISOTOOLS_API_KEY'),
    api_key_readable: typeof variables.ISOTOOLS_API_KEY === 'string' && Boolean(variables.ISOTOOLS_API_KEY.trim()),
    tool_id_matches: !variables.TOOL_PAGE_ID || variables.TOOL_PAGE_ID === toolId,
    dockerfile_matches: !variables.RAILWAY_DOCKERFILE_PATH || variables.RAILWAY_DOCKERFILE_PATH === `Docker/${toolId}.Dockerfile`,
    open_mode_configured: !configured(variables, 'OIDC_ISSUER') && !configured(variables, 'TOOL_API_KEY'),
    consumer_enabled: variables.TOOL_CONSUMER_ENABLED === 'true',
    volume_mounted_at_data: variables.RAILWAY_VOLUME_MOUNT_PATH === '/data',
    state_path_matches: !variables.TOOL_STATE_DIR || variables.TOOL_STATE_DIR === '/data',
    business_config_configured: Boolean(variables.TOOL_BUSINESS_CONFIG_FILE?.trim()),
    health_url: healthUrl || null
  }
}

export async function inspectConnection (variables, toolId, configuredHealthUrl = '', fetcher = fetch) {
  const report = inspectConfiguration(variables, toolId, configuredHealthUrl)
  report.central_api_key_works = null
  if (report.api_url_matches && report.api_key_readable) {
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
        report.deployed_auth_mode_open = health.auth === 'open'
      }
    } catch { report.health_connection_failed = true }
  }
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.env.RAILWAY_TOKEN || !process.env.RAILWAY_SERVICE) throw new Error('missing_workflow_configuration')
    let variables
    try {
      // CLI JSON contains secrets. Capture it in memory and never print raw stdout/stderr.
      variables = JSON.parse(execFileSync('railway', ['variable', 'list', '--service', process.env.RAILWAY_SERVICE, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, maxBuffer: 5 * 1024 * 1024 }))
    } catch { throw new Error('railway_variables_query_failed') }
    const report = await inspectConnection(variables, process.env.TOOL_PAGE_ID, process.env.HEALTH_URL)
    console.log(JSON.stringify(report, null, 2))
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### ${report.tool}\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`)
    if (report.health_url && process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `HEALTH_URL=${report.health_url}\n`)
    if (process.argv.includes('--require-deploy-config') && (!report.central_api_key_works || !report.tool_id_matches || !report.dockerfile_matches || !report.open_mode_configured || !report.volume_mounted_at_data || !report.state_path_matches || !report.health_url)) throw new Error('deployment_configuration_incomplete')
    if (process.argv.includes('--require-deployed-tool') && (!report.deployed_tool_identity_matches || !report.deployed_auth_mode_open)) throw new Error('deployed_tool_verification_failed')
  } catch (error) {
    const safe = ['missing_workflow_configuration', 'railway_variables_query_failed', 'deployment_configuration_incomplete', 'deployed_tool_verification_failed', 'invalid_configuration_response', 'invalid_health_url'].includes(error.message) ? error.message : 'railway_inspection_failed'
    console.error(safe)
    process.exitCode = 1
  }
}
