import { useEffect, useState } from 'react'
import { Panel, Field, Input, Button, Loading, ErrorState } from './controlRoom.jsx'
import { historyResult } from '../historyView.js'
import { explainResult } from '../resultExplanation.js'
const LABELS = { on_track: 'En rango', deviation: 'Desviación', critical: 'Crítico', at_risk: 'En riesgo', delayed: 'Atrasado', not_calculable: 'No calculable' }
export default function HistoryPanel ({ toolId }) {
  const kind = toolId === 'track_project_progress' ? 'project' : 'analysis'
  const initial = new URLSearchParams(window.location.search).get('record') || ''
  const [id, setId] = useState(initial)
  const [requested, setRequested] = useState(initial)
  const [data, setData] = useState(null)
  const [eventId, setEventId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    setData(null); setError(''); setEventId('')
    if (!requested) return
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/demo/history?kind=${kind}&id=${encodeURIComponent(requested)}`, { signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'No se pudo consultar el historial'); if (body.id !== requested || body.kind !== kind || !Array.isArray(body.updates)) throw new Error('Historial inválido'); for (const update of body.updates) historyResult(update, kind, requested); return body })
      .then(body => { setData(body); setEventId(body.updates[0]?.event_id || '') })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [kind, requested, reload])
  const selected = data?.updates.find(update => update.event_id === eventId)
  const view = selected ? historyResult(selected, kind, data.id) : null
  return <Panel title="Cortes publicados desde el ERP" subtitle="Historial de la base aislada. No recalcula ni modifica la captura.">
    <form onSubmit={event => { event.preventDefault(); setRequested(id.trim()); setReload(value => value + 1) }}>
      <Field label={kind === 'project' ? 'Referencia del proyecto' : 'Referencia del análisis'}><Input required value={id} onChange={event => setId(event.target.value)} /></Field>
      <Button type="submit" loading={loading}>Consultar historial</Button>
    </form>
    {loading ? <Loading label="Consultando cortes publicados" /> : null}
    {error ? <ErrorState title="No se pudo consultar" detail={error} /> : null}
    {data ? <p>Registro consultado: {data.id} · {data.updates.length} actualizaciones</p> : null}
    {data?.updates.length ? <Field label="Corte histórico"><select className="input" value={eventId} onChange={event => setEventId(event.target.value)}>{data.updates.map(update => <option key={update.event_id} value={update.event_id}>{new Date(update.timestamp).toLocaleString('es-MX')} · {update.event_id.slice(0, 8)}</option>)}</select></Field> : null}
    {view ? <div aria-live="polite"><p>{LABELS[view.result?.status] || view.status}</p>{view.result ? explainResult(view.input, view.result).map((line, index) => <p key={index}>{line}</p>) : null}<details><summary>Entrada, resultado y trazabilidad del corte</summary><pre className="json-preview">{JSON.stringify(selected, null, 2)}</pre></details></div> : null}
    {data && !data.updates.length ? <p>Este registro aún no tiene actualizaciones.</p> : null}
    <p><a href="/">Volver al ERP</a></p>
  </Panel>
}
