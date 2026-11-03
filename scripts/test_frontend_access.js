import assert from 'node:assert/strict'
import { sessionAccess, storedEvaluation } from '../demo-frontend/src/sessionAccess.js'
import { readErpSnapshot } from '../demo-frontend/src/useErpRecord.js'

for (const session of [null, { authenticated: false }, { authenticated: true, user: { roles: [] } }, { authenticated: true, user: { roles: ['platform.admin'] } }]) {
  assert.deepEqual(sessionAccess(session), { canRead: false, canEvaluate: false })
}
assert.deepEqual(sessionAccess({ authenticated: true, user: { roles: ['Auditor'] } }), { canRead: true, canEvaluate: false })
for (const session of [{ mode: 'open' }, { authenticated: true, user: { roles: ['OperationsManager'] } }, { authenticated: true, user: { roles: ['Auditor', 'OperationsManager'] } }]) {
  assert.deepEqual(sessionAccess(session), { canRead: true, canEvaluate: true })
}
for (const [tool, field] of [['compare_planned_vs_actual', 'analysis_id'], ['track_project_progress', 'project_id']]) {
  const record = { [field]: 'ONE', as_of_date: '2026-01-01' }
  const result = { [field]: 'ONE', status: 'on_track' }
  const requests = []
  const snapshot = await readErpSnapshot(tool, async (url, options) => {
    requests.push({ url, options })
    return { ok: true, json: async () => ({ records: { ONE: record }, evaluations: { ONE: result } }) }
  })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/api/tool/status')
  assert.equal(requests[0].options.method, undefined, 'saved evaluations use GET')
  assert.equal(requests[0].options.cache, 'no-store')
  assert.equal(requests[0].options.credentials, 'include')
  assert.deepEqual(storedEvaluation(tool, snapshot.records.ONE, snapshot.evaluations), { status: 'ok', tool, input: record, result })
  for (const evaluations of [{}, { ONE: null }, { ONE: { ...result, [field]: 'TWO' } }, { ONE: { [field]: 'ONE' } }]) {
    assert.equal(storedEvaluation(tool, record, evaluations), null)
  }
  assert.equal(storedEvaluation(tool, { [field]: '__proto__' }, {}), null)
  await assert.rejects(readErpSnapshot(tool, async () => ({ ok: true, json: async () => ({ records: { ONE: { [field]: 'TWO' } } }) })), /referencia/)
}
for (const status of [401, 403, 500]) await assert.rejects(readErpSnapshot('track_project_progress', async () => ({ ok: false, status })))
console.log('Frontend permissions and atomic stored evaluations: both tools, missing/mismatched results, read-only GET and historical cutoff PASS')
