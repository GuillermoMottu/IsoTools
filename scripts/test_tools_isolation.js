import assert from 'node:assert/strict'
import { runIsolation } from './isolate_tools_logto.js'

for (const failure of [null, 'second_stop', 'probe', 'confirm']) {
  const actions = []
  const operations = {
    probe: async phase => { actions.push(`probe:${phase}`); if (failure === 'probe' && phase === 'paused') throw new Error('fixture'); return { status: 429 } },
    mark: async entry => actions.push(`mark:${entry}`),
    stop: async entry => { actions.push(`stop:${entry}`); if (failure === 'second_stop' && entry === 'TPP') throw new Error('fixture') },
    confirmStopped: async () => { actions.push('confirm'); if (failure === 'confirm') throw new Error('fixture') },
    quiet: async () => actions.push('quiet'),
    restore: async entry => actions.push(`restore:${entry}`)
  }
  if (failure) await assert.rejects(runIsolation(['CPA', 'TPP'], operations))
  else assert.equal((await runIsolation(['CPA', 'TPP'], operations)).paused.status, 429)
  assert.ok(actions.includes('restore:CPA') && actions.includes('restore:TPP'), 'partial stop, probe and verification failures always attempt both restorations')
  assert.ok(actions.indexOf('mark:CPA') < actions.indexOf('stop:CPA'), 'journal precedes mutation')
}
let stopped = false
assert.equal((await runIsolation(['CPA'], { probe: async () => ({ status: 302 }), stop: async () => { stopped = true } })).skipped, '429_not_reproduced_before_pause')
assert.equal(stopped, false)
await assert.rejects(runIsolation(['CPA', 'TPP'], { probe: async () => ({ status: 429 }), mark: async () => {}, stop: async () => {}, confirmStopped: async () => {}, quiet: async () => {}, restore: async () => { throw new Error('fixture') } }), /restoration_requires_attention/)
console.log('Isolation safety: exact scope, no pause without baseline 429, journal before stop, restoration on partial failure and explicit recovery errors PASS')
