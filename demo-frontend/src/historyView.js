export function historyResult (update, kind, id) {
  if (update?.publication?.status !== 'stored') return { status: 'Pendiente de publicación', input: null, result: null }
  const events = update.chain?.events || []
  const root = events.find(event => event.event_id === update.event_id)
  const field = kind === 'project' ? 'project_id' : 'analysis_id'
  const expected = kind === 'project' ? 'KPI_REPORT_GENERATED' : 'PRODUCTION_VARIANCE_DETECTED'
  if (!root || root.event !== expected || root.data?.[field] !== id) throw new Error('El corte no corresponde al registro seleccionado')
  if (kind === 'analysis') return { input: root.data, result: root.data }
  const child = events.find(event => event.event === 'PROJECT_AT_RISK' && event.causation_id === root.event_id && event.data?.project_id === id)
  return child ? { input: root.data, result: child.data } : { input: root.data, result: null, status: 'Sin alerta publicada; no distingue por sí solo datos insuficientes de un proyecto en rango.' }
}
