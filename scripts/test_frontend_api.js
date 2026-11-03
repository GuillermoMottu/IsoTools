import assert from 'node:assert/strict'
import { runComparePlannedVsActual, runTrackProjectProgress } from '../demo-frontend/src/api.js'
import { runComparePlannedVsActualTool, runTrackProjectProgressTool } from '../src/services/compareTrackDemoService.js'

const originalFetch = globalThis.fetch
try {
  for (const [client, evaluate, input] of [
    [runTrackProjectProgress, runTrackProjectProgressTool, { project_id: 'PROJECT-ISO-9001', kpis: [{ name: 'OEE', value: 0.9 }] }],
    [runComparePlannedVsActual, runComparePlannedVsActualTool, { analysis_id: 'INCOMPLETE-ANALYSIS' }]
  ]) {
    let expected
    globalThis.fetch = async (url, options) => {
      assert.equal(options.credentials, 'include')
      expected = evaluate(JSON.parse(options.body))
      assert.equal(url, `/api/tool/${expected.tool}/run`)
      assert.equal(expected.result.status, 'not_calculable')
      return Response.json(expected, { status: 400 })
    }
    const response = await client({ input })
    assert.deepEqual(response, expected)
    assert.ok(response.result.data_quality.missing_fields.length > 0)
    if (client === runTrackProjectProgress) assert.equal(response.emitted_event, null)
  }

  const input = runTrackProjectProgressTool({ scenario: 'at_risk' }).input
  const complete = runTrackProjectProgressTool({ input })
  globalThis.fetch = async () => Response.json(complete)
  assert.equal((await runTrackProjectProgress({ input })).result.status, 'at_risk')

  const incomplete = runTrackProjectProgressTool({ input: { project_id: 'OTHER-PROJECT' } })
  globalThis.fetch = async () => Response.json(incomplete, { status: 400 })
  await assert.rejects(runTrackProjectProgress({ input }), /otro registro/)

  for (const [status, message] of [[400, /Revisa los datos/], [401, /Inicia sesión/], [403, /no tiene permiso/], [429, /demasiadas consultas/], [500, /más tarde/]]) {
    globalThis.fetch = async () => Response.json(status === 400 ? { error: 'explicit_input_required' } : incomplete, { status })
    await assert.rejects(runTrackProjectProgress({ input }), message)
  }
  for (const body of [null, { status: 'ok', result: { status: 'not_calculable' } }]) {
    globalThis.fetch = async () => Response.json(body, { status: 400 })
    await assert.rejects(runTrackProjectProgress({ input }), /Revisa los datos/)
  }
  globalThis.fetch = async () => new Response('<html>Bad request</html>', { status: 400 })
  await assert.rejects(runTrackProjectProgress({ input }), /Revisa los datos/)
  globalThis.fetch = async () => { throw new Error('offline') }
  await assert.rejects(runTrackProjectProgress({ input }), /No se pudo conectar/)
  console.log('Frontend API: structured validation, field details, identity checks, successful evaluation and HTTP/network errors PASS')
} finally {
  globalThis.fetch = originalFetch
}
