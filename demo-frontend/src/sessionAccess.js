export function sessionAccess (session) {
  const roles = session?.authenticated ? session.user?.roles || [] : []
  const canEvaluate = session?.mode === 'open' || roles.includes('OperationsManager')
  return { canEvaluate, canRead: canEvaluate || roles.includes('Auditor') }
}

export function storedEvaluation (toolId, record, evaluations) {
  const field = toolId === 'track_project_progress' ? 'project_id' : 'analysis_id'
  const id = record?.[field]
  if (!id || !Object.hasOwn(evaluations, id)) return null
  const result = evaluations[id]
  if (!result || result[field] !== id || typeof result.status !== 'string') return null
  return { status: 'ok', tool: toolId, input: record, result }
}
