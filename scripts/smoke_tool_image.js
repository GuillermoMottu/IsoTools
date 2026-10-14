import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createToolApp } from '../src/tool-server.js'

const { app, stop } = await createToolApp()
const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)) })
const base = `http://127.0.0.1:${server.address().port}`
try {
  const health = await fetch(`${base}/health`)
  assert.equal(health.status, 200)
  assert.equal((await health.json()).tool, process.env.TOOL_PAGE_ID)
  assert.equal((await (await fetch(`${base}/auth/me`)).json()).mode, 'open')
  assert.equal((await fetch(`${base}/ready`)).status, 503)
  const shell = await fetch(`${base}/`)
  assert.equal(shell.status, 200)
  assert.match(await shell.text(), /<html/)
  const recordRoute = process.env.TOOL_PAGE_ID === 'compare_planned_vs_actual' ? 'api/analyses' : 'api/records'
  assert.deepEqual(await (await fetch(`${base}/${recordRoute}`)).json(), {})
  const assets = path.join(process.env.WEB_DIST_DIR, 'assets')
  for (const file of await readdir(assets)) {
    if (file.endsWith('.js')) assert.doesNotMatch(await readFile(path.join(assets, file), 'utf8'), /ISOTOOLS_API_KEY|TOOL_API_KEY/)
  }
  console.log(`${process.env.TOOL_PAGE_ID}: image start, unauthenticated health, open SSO, existing UI and key-free bundle PASS`)
} finally {
  stop()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
