import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout } from 'node:timers/promises'

export function deploymentIsCurrent (health, toolId, sha) {
  return health?.status === 'ok' && health.service === 'isotools-tool' && health.tool === toolId && health.auth === 'sso' && health.build_sha === sha
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { HEALTH_URL, TOOL_PAGE_ID, GITHUB_SHA } = process.env
  if (!HEALTH_URL || !TOOL_PAGE_ID || !/^[a-f0-9]{40}$/.test(GITHUB_SHA || '')) throw new Error('missing_deployment_check_configuration')
  let ready = false
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const response = await fetch(HEALTH_URL, { redirect: 'error', signal: AbortSignal.timeout(5000) })
      if (response.ok && deploymentIsCurrent(await response.json(), TOOL_PAGE_ID, GITHUB_SHA)) {
        console.log(`${TOOL_PAGE_ID}: expected build healthy and SSO enabled`)
        ready = true
        break
      }
    } catch { /* The previous deployment may still serve traffic during the swap. */ }
    console.log(`${TOOL_PAGE_ID}: waiting for expected build, attempt ${attempt}/30`)
    if (attempt < 30) await setTimeout(10000)
  }
  if (!ready) throw new Error('deployment_not_ready_before_timeout')
}
