import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { railwayJson, inspectConnection, inspectConfiguration } from './inspect_railway_tool.js'

const COOKIES = { compare_planned_vs_actual: 'cpa_session', track_project_progress: 'tpp_session' }

export function runtimePlan (toolId, service, variables, volumeList) {
  if (!COOKIES[toolId] || !service || !Array.isArray(volumeList.volumes)) throw new Error('invalid_runtime_configuration')
  if (!inspectConfiguration(variables, toolId).open_mode_configured) throw new Error('existing_authentication_requires_review')
  const volumes = volumeList.volumes.filter(volume => volume.serviceName === service && !volume.deletedAt)
  if (volumes.length > 1 || volumes.some(volume => volume.isPendingDeletion)) throw new Error('existing_volume_requires_review')
  const mount = volumes[0]?.mountPath || '/data'
  const validPath = value => typeof value === 'string' && value.startsWith('/') && value !== '/' && !/[\r\n\0]/.test(value) && path.posix.normalize(value) === value
  if (!validPath(mount)) throw new Error('invalid_volume_mount')
  const volumeServiceId = variables.RAILWAY_SERVICE_ID
  if (volumes.length === 0 && !/^[a-f0-9-]{36}$/i.test(volumeServiceId || '')) throw new Error('missing_volume_service_id')
  const previousDirectory = variables.TOOL_STATE_DIR
  const stateDirectory = validPath(previousDirectory) && (previousDirectory === mount || previousDirectory.startsWith(`${mount}/`)) ? previousDirectory : mount
  if (variables.TOOL_CONSUMER_ENABLED === 'true' && previousDirectory && previousDirectory !== stateDirectory) throw new Error('existing_state_directory_requires_review')
  return {
    createVolume: volumes.length === 0,
    volumeServiceId,
    assignments: [
      'ISOTOOLS_API_URL=https://api-events.orcalabs.mx/api/v1',
      `TOOL_PAGE_ID=${toolId}`,
      `TOOL_STATE_DIR=${stateDirectory}`,
      `SESSION_COOKIE_NAME=${COOKIES[toolId]}`,
      ...(variables.TOOL_CONSUMER_ENABLED === 'true' ? [] : ['TOOL_CONSUMER_ENABLED=false'])
    ]
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let stage = 'configuration'
  try {
    const service = process.env.RAILWAY_SERVICE
    const toolId = process.env.TOOL_PAGE_ID
    if (!process.env.RAILWAY_TOKEN) throw new Error('missing_railway_token')
    if (!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || '')) throw new Error('missing_build_revision')
    stage = 'read_variables'
    const variables = railwayJson(['variable', 'list', '--service', service, '--json'])
    stage = 'read_volumes'
    const volumeList = railwayJson(['volume', '--service', service, 'list', '--json'])
    const plan = runtimePlan(toolId, service, variables, volumeList)
    if (variables.TOOL_CONSUMER_ENABLED === 'true') {
      const connection = await inspectConnection(variables, toolId, process.env.HEALTH_URL)
      if (!connection.central_api_key_works) throw new Error('active_consumer_requires_valid_central_key')
    }
    stage = 'create_volume'
    // Volume creation in CLI 5.67.1 requires an ID; variable commands accept names.
    if (plan.createVolume) railwayJson(['volume', '--service', plan.volumeServiceId, 'add', '--mount-path', '/data', '--json'])
    stage = 'set_variables'
    railwayJson(['variable', 'set', '--service', service, '--skip-deploys', '--json', ...plan.assignments, `TOOL_BUILD_SHA=${process.env.GITHUB_SHA}`])
    console.log(JSON.stringify({ tool: toolId, runtime_variables_configured: true, volume_created: plan.createVolume, existing_volume_preserved: !plan.createVolume, active_consumer_preserved: variables.TOOL_CONSUMER_ENABLED === 'true' }))
  } catch (error) {
    // CLI stdout/stderr may contain credentials. Report only known local failure codes.
    const safe = ['invalid_runtime_configuration', 'existing_authentication_requires_review', 'existing_volume_requires_review', 'existing_state_directory_requires_review', 'invalid_volume_mount', 'missing_railway_token', 'missing_build_revision', 'missing_volume_service_id', 'active_consumer_requires_valid_central_key'].includes(error.message) ? error.message : 'runtime_preparation_failed'
    console.error(JSON.stringify({ stage, error: safe }))
    process.exitCode = 1
  }
}
