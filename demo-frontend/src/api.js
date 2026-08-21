async function postJson (path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body.error || `Request failed with ${response.status}`
    throw new Error(message)
  }
  return body
}

export function runComparePlannedVsActual ({ scenario, input }) {
  return postJson('/api/tool/compare_planned_vs_actual/run', { scenario, input })
}

export function runTrackProjectProgress ({ scenario, input }) {
  return postJson('/api/tool/track_project_progress/run', { scenario, input })
}
