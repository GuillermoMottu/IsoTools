import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { railwayJson, stateDirectoryIsPersistent } from './inspect_railway_tool.js'

const planFile = '.tool-isolation/plan.json'
const uuid = value => /^[a-f0-9-]{36}$/i.test(value || '')
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const targets = () => [
  { tool: 'compare_planned_vs_actual', service: process.env.COMPARE_SERVICE || 'compare-planned-vs-actual', origin: 'https://cpa.orcalabs.mx', token: process.env.COMPARE_RAILWAY_TOKEN },
  { tool: 'track_project_progress', service: process.env.TRACK_SERVICE || 'track-project-progress', origin: 'https://tpp.orcalabs.mx', token: process.env.TRACK_RAILWAY_TOKEN }
]
function cli (target, args) {
  const previous = process.env.RAILWAY_TOKEN
  try { process.env.RAILWAY_TOKEN = target.token; return railwayJson(args) } finally {
    if (previous === undefined) delete process.env.RAILWAY_TOKEN
    else process.env.RAILWAY_TOKEN = previous
  }
}
async function control (target, query, variables) {
  const response = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json', 'Project-Access-Token': target.token },
    body: JSON.stringify({ query, variables })
  })
  if (!response.ok) throw new Error('railway_control_unavailable')
  const result = await response.json()
  if (result.errors?.length || !result.data) throw new Error('railway_control_rejected')
  return result.data
}
let writes = Promise.resolve()
async function save (plan) {
  const pending = writes.catch(() => {}).then(async () => {
    await mkdir(path.dirname(planFile), { recursive: true })
    await writeFile(`${planFile}.tmp`, JSON.stringify(plan, null, 2), { mode: 0o600 })
    await rename(`${planFile}.tmp`, planFile)
  })
  writes = pending
  await pending
}
async function jsonGet (url, key) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: key ? { 'x-api-key': key } : {} })
  if (!response.ok) throw new Error('tool_unavailable')
  return response.json()
}
function summarize (state) {
  assert.ok(Number.isSafeInteger(state.cursor) && state.cursor >= 0)
  assert.ok(state.records && typeof state.records === 'object' && !Array.isArray(state.records))
  return { cursor: state.cursor, records_count: Object.keys(state.records).length, rejected_count: Object.keys(state.rejected || {}).length, publication_pending: Boolean(state.pending), records_sha256: hash(state.records), state_sha256: hash(state) }
}
function context (target) {
  if (!target.token) throw new Error('missing_railway_token')
  const variables = cli(target, ['variable', 'list', '--service', target.service, '--json'])
  if (variables.TOOL_PAGE_ID !== target.tool || variables.TOOL_CONSUMER_ENABLED !== 'true' || !uuid(variables.RAILWAY_SERVICE_ID)) throw new Error('wrong_tool_configuration')
  if (!variables.TOOL_API_KEY || typeof variables.TOOL_API_KEY !== 'string') throw new Error('service_key_unreadable')
  return variables
}
async function capture (target) {
  const variables = context(target)
  const volumes = cli(target, ['volume', '--service', target.service, 'list', '--json'])
  if (!stateDirectoryIsPersistent(volumes, target.service, variables.TOOL_STATE_DIR || '/data')) throw new Error('persistent_volume_required')
  const deployments = cli(target, ['deployment', 'list', '--service', target.service, '--limit', '5', '--json'])
  const latest = deployments[0]
  if (latest?.status !== 'SUCCESS' || !uuid(latest.id)) throw new Error('active_deployment_required')
  const { deployment } = await control(target, 'query($id: String!) { deployment(id: $id) { id status canRedeploy } }', { id: latest.id })
  if (deployment.status !== 'SUCCESS' || deployment.canRedeploy !== true) throw new Error('recoverable_deployment_required')
  const health = await jsonGet(`${target.origin}/health`)
  if (health.tool !== target.tool || health.auth !== 'sso' || !/^[a-f0-9]{40}$/.test(health.build_sha || '')) throw new Error('wrong_deployed_tool')
  if ((await jsonGet(`${target.origin}/ready`)).status !== 'ready') throw new Error('tool_not_ready')
  const state = summarize(await jsonGet(`${target.origin}/api/tool/status`, variables.TOOL_API_KEY))
  if (state.publication_pending) throw new Error('pending_publication_requires_review')
  return { tool: target.tool, service_id: variables.RAILWAY_SERVICE_ID, deployment_id: deployment.id, build_sha: health.build_sha, before: state, stop_requested: false }
}
async function providerProbe () {
  const verifier = randomBytes(32).toString('base64url')
  const url = new URL('https://pfwk8f.logto.app/oidc/auth')
  url.search = new URLSearchParams({ client_id: '7ms3ixe2j7nb4d98s3w98', redirect_uri: 'https://tpp.orcalabs.mx/auth/callback', response_type: 'code', scope: 'openid roles', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: randomBytes(24).toString('base64url'), nonce: randomBytes(24).toString('base64url') })
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
  const headers = {}
  for (const name of ['date', 'content-type', 'retry-after', 'cf-ray', 'x-request-id']) if (response.headers.has(name)) headers[name] = response.headers.get(name)
  const body = await response.text()
  return { at: new Date().toISOString(), status: response.status, headers, too_many_requests: /too many requests/i.test(body), cookies_sent: false, redirects_followed: false }
}
export async function runIsolation (entries, operations) {
  const touched = []
  try {
    const baseline = await operations.probe('before')
    if (baseline.status !== 429) return { skipped: '429_not_reproduced_before_pause' }
    for (const entry of entries) {
      touched.push(entry)
      await operations.mark(entry)
      await operations.stop(entry)
    }
    await operations.confirmStopped()
    await operations.quiet()
    return { paused: await operations.probe('paused') }
  } finally {
    const results = await Promise.allSettled(touched.map(entry => operations.restore(entry)))
    if (results.some(result => result.status === 'rejected')) throw new Error('restoration_requires_attention')
  }
}
async function waitFor (check, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  do { if (await check()) return; await delay(3000) } while (Date.now() < deadline)
  throw new Error('verification_timeout')
}
async function restoreEntry (target, entry, plan) {
  if (!entry.stop_requested || entry.restored) return
  console.log(JSON.stringify({ stage: 'restore', tool: target.tool }))
  const variables = context(target)
  if (variables.RAILWAY_SERVICE_ID !== entry.service_id) throw new Error('wrong_restore_target')
  // Always create a recovery deployment: the old process may still answer while
  // its stop is being drained. A healthy old response is not restoration proof.
  if (!entry.restore_deployment_id) {
    const result = await control(target, 'mutation($id: String!) { deploymentRedeploy(id: $id) { id status } }', { id: entry.deployment_id })
    if (!uuid(result.deploymentRedeploy?.id)) throw new Error('invalid_restore_response')
    entry.restore_deployment_id = result.deploymentRedeploy.id
    await save(plan)
  }
  await waitFor(async () => {
    try {
      const { deployment } = await control(target, 'query($id: String!) { deployment(id: $id) { id status } }', { id: entry.restore_deployment_id })
      return deployment.status === 'SUCCESS' && (await jsonGet(`${target.origin}/health`)).build_sha === entry.build_sha && (await jsonGet(`${target.origin}/ready`)).status === 'ready'
    } catch { return false }
  }, 240000)
  entry.after = summarize(await jsonGet(`${target.origin}/api/tool/status`, variables.TOOL_API_KEY))
  if (entry.after.cursor < entry.before.cursor || entry.after.records_count < entry.before.records_count) throw new Error('restored_state_requires_review')
  entry.state_unchanged = entry.after.state_sha256 === entry.before.state_sha256
  if (entry.after.cursor === entry.before.cursor && !entry.state_unchanged) throw new Error('restored_state_requires_review')
  entry.restored = true
  await save(plan)
  console.log(JSON.stringify({ stage: 'restored', tool: target.tool, cursor: entry.after.cursor, state_unchanged: entry.state_unchanged }))
}
async function main (mode) {
  const definitions = targets()
  if (mode === 'plan') {
    const plan = { created_at: new Date().toISOString(), scope: definitions.map(target => target.tool), entries: [] }
    for (const target of definitions) plan.entries.push(await capture(target))
    await save(plan)
    console.log(JSON.stringify(plan))
    return
  }
  const plan = JSON.parse(await readFile(planFile, 'utf8'))
  assert.deepEqual(plan.scope, definitions.map(target => target.tool))
  for (const entry of plan.entries) {
    assert.ok(uuid(entry.deployment_id) && uuid(entry.service_id))
    assert.ok(definitions.some(target => target.tool === entry.tool))
  }
  const restore = entry => restoreEntry(definitions.find(target => target.tool === entry.tool), entry, plan)
  if (mode === 'restore') {
    const results = await Promise.allSettled(plan.entries.map(restore))
    if (results.some(result => result.status === 'rejected')) throw new Error('restoration_requires_attention')
    return
  }
  if (mode !== 'isolate' || process.env.CONFIRM_ISOLATION !== 'true') throw new Error('explicit_isolation_required')
  // Recheck both exact deployment IDs before any control-plane mutation.
  for (const target of definitions) {
    const fresh = await capture(target)
    const entry = plan.entries.find(candidate => candidate.tool === target.tool)
    if (fresh.deployment_id !== entry.deployment_id || fresh.before.state_sha256 !== entry.before.state_sha256) throw new Error('preflight_state_changed')
  }
  const result = await runIsolation(plan.entries, {
    probe: async phase => { const value = await providerProbe(); plan[`${phase}_probe`] = value; await save(plan); console.log(JSON.stringify({ stage: phase, ...value })); return value },
    mark: async entry => { entry.stop_requested = true; await save(plan) },
    stop: async entry => {
      const target = definitions.find(candidate => candidate.tool === entry.tool)
      console.log(JSON.stringify({ stage: 'stop', tool: entry.tool }))
      const result = await control(target, 'mutation($id: String!) { deploymentStop(id: $id) }', { id: entry.deployment_id })
      if (result.deploymentStop !== true) throw new Error('stop_not_acknowledged')
      entry.stop_acknowledged = true
      await save(plan)
    },
    confirmStopped: async () => {
      let consecutive = 0
      await waitFor(async () => {
        let allDown = true
        for (const target of definitions) {
          const entry = plan.entries.find(candidate => candidate.tool === target.tool)
          if (!entry.stop_acknowledged) throw new Error('stop_not_acknowledged')
          const observation = { at: new Date().toISOString(), http_status: null }
          try {
            const response = await fetch(`${target.origin}/health`, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
            observation.http_status = response.status
            if (response.ok) allDown = false
          } catch { observation.unavailable = true }
          entry.stop_health_observations = [...(entry.stop_health_observations || []), observation].slice(-10)
        }
        consecutive = allDown ? consecutive + 1 : 0
        await save(plan)
        return consecutive >= 2
      }, 90000)
      plan.pause_confirmed_at = new Date().toISOString()
      await save(plan)
      console.log(JSON.stringify({ stage: 'both_tools_stopped' }))
    },
    quiet: async () => { console.log(JSON.stringify({ stage: 'quiet_window', seconds: 60 })); await delay(60000) },
    restore
  })
  plan.result = result
  await save(plan)
  console.log(JSON.stringify({ stage: 'complete', result }))
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch(error => {
    const codes = ['verification_timeout', 'railway_control_unavailable', 'railway_control_rejected', 'restoration_requires_attention', 'restored_state_requires_review', 'stop_not_acknowledged', 'preflight_state_changed', 'recoverable_deployment_required', 'wrong_tool_configuration', 'tool_unavailable']
    console.error(codes.includes(error.message) ? error.message : 'isolation_step_failed_check_plan_and_restore')
    process.exitCode = 1
  })
}
