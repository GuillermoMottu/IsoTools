async function postJson (path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }).catch(() => { throw new Error('No se pudo conectar con el servicio. La evaluación se actualizará cuando se restablezca la conexión.') })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = requestErrorLabel(response.status)
    throw new Error(message)
  }
  return body
}

export async function runComparePlannedVsActual ({ scenario, input }) {
  return evaluationForRecord(await postJson('/api/tool/compare_planned_vs_actual/run', { scenario, input }), input, 'analysis_id')
}

export async function runTrackProjectProgress ({ scenario, input }) {
  const evaluationInput = { ...input, as_of_date: localToday() }
  return evaluationForRecord(await postJson('/api/tool/track_project_progress/run', { scenario, input: evaluationInput }), input, 'project_id')
}

export function evaluationForRecord (response, input, field) {
  const expected = input?.[field] ?? null
  if ((response.input?.[field] ?? null) !== expected || (response.result?.[field] ?? null) !== expected) throw new Error('La evaluaci\u00f3n recibida corresponde a otro registro')
  return response
}

export function requestErrorLabel (status) {
  if (status === 401) return 'Inicia sesión para consultar la evaluación.'
  if (status === 403) return 'Tu usuario no tiene permiso para consultar esta evaluación.'
  if (status === 429) return 'Hay demasiadas consultas. Espera un momento antes de modificar los datos.'
  if (status === 400) return 'Revisa los datos; no se pudo procesar la captura.'
  return 'No se pudo actualizar la evaluación. Intenta de nuevo más tarde.'
}

export function localToday (date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function saveProjectMilestones (projectId, milestones) {
  return postJson('/project-milestones', { project_id: projectId, milestones })
}
