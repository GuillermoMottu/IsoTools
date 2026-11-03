import { completedMilestonePercent } from '../../src/utils/projectMilestones.js'
import { useEffect, useState } from 'react'

export async function readErpRecords (toolId, fetcher = fetch, signal) {
  const project = toolId === 'track_project_progress'
  const response = await fetcher(project ? '/api/records' : '/api/analyses', { signal, cache: 'no-store', credentials: 'include' })
  if (!response.ok) throw new Error('No se pudieron cargar los datos del ERP')
  const records = await response.json()
  return validateRecords(records, toolId)
}

function validateRecords (records, toolId) {
  const project = toolId === 'track_project_progress'
  if (!records || typeof records !== 'object' || Array.isArray(records)) throw new Error('Respuesta del ERP inv\u00e1lida')
  const field = project ? 'project_id' : 'analysis_id'
  for (const [id, record] of Object.entries(records)) {
    if (!record || typeof record !== 'object' || Array.isArray(record) || record[field] !== id) throw new Error('La referencia del registro ERP no coincide')
  }
  return records
}

export async function readErpSnapshot (toolId, fetcher = fetch, signal) {
  // Read records and their persisted evaluations from the same consumer snapshot.
  const response = await fetcher('/api/tool/status', { signal, cache: 'no-store', credentials: 'include' })
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión para consultar los registros.' : response.status === 403 ? 'Tu usuario no tiene permiso para consultar los registros.' : 'No se pudieron cargar los datos del ERP')
  const snapshot = await response.json()
  const records = validateRecords(snapshot?.records, toolId)
  const evaluations = snapshot.evaluations || {}
  if (typeof evaluations !== 'object' || Array.isArray(evaluations)) throw new Error('Respuesta de evaluaciones inválida')
  return { records, evaluations }
}

export function selectErpRecord (records, requested) {
  if (requested) return Object.hasOwn(records, requested) ? records[requested] : null
  const ids = Object.keys(records)
  return ids.length === 1 ? records[ids[0]] : null
}

export function useErpRecord (toolId) {
  const [requested, setRequestedState] = useState(() => new URLSearchParams(window.location.search).get('record') || '')
  function setRequested (id) {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('record', id)
    else url.searchParams.delete('record')
    window.history.replaceState(null, '', url)
    setRequestedState(id)
  }
  const [{ records, evaluations }, setSnapshot] = useState({ records: {}, evaluations: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let timer
    async function refresh () {
      try {
        const next = await readErpSnapshot(toolId, fetch, controller.signal)
        if (!controller.signal.aborted) {
          setSnapshot(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
          setError('')
          if (Object.keys(next.records).length === 0) setRequested('')
        }
      } catch (error) {
        if (!controller.signal.aborted) { setSnapshot({ records: {}, evaluations: {} }); setError(error.message) }
      } finally {
        if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(refresh, 5000) }
      }
    }
    refresh()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [toolId])
  const record = selectErpRecord(records, requested)
  return { record, records, evaluations, requested, setRequested, loading, error }
}

export function erpSummary (records, toolId) {
  const values = Object.values(records)
  if (toolId === 'track_project_progress') {
    const progress = record => completedMilestonePercent(record.milestones)
    return [
      { label: 'Proyectos registrados', value: values.length },
      { label: 'En curso', value: values.filter(record => progress(record) > 0 && progress(record) < 100).length, hint: 'Con avance y pendientes de terminar' },
      { label: 'Por iniciar', value: values.filter(record => progress(record) === 0).length, hint: 'Sin avance reportado' },
      { label: 'Completados', value: values.filter(record => progress(record) === 100).length, hint: 'Avance real del 100%' }
    ]
  }
  return [
    { label: 'Análisis registrados', value: values.length },
    { label: 'Plantas representadas', value: new Set(values.map(record => record.plant_id).filter(Boolean)).size },
    { label: 'Indicadores', value: values.reduce((count, record) => count + (Array.isArray(record.metrics) ? record.metrics.length : 0), 0) },
    { label: 'Sin indicadores', value: values.filter(record => !Array.isArray(record.metrics) || record.metrics.length === 0).length }
  ]
}
