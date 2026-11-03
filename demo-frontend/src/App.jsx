import { completedMilestonePercent } from '../../src/utils/projectMilestones.js'
import { useCallback, useMemo } from 'react'
import { Activity, Briefcase, Plus, Target, TrendingUp, Wallet, Clock, ShieldCheck, BarChart3, CalendarDays } from 'lucide-react'
import {
  AppShell,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Metric,
  Mono,
  Panel,
  StatusChip,
  Tab,
  Table,
  DataRing,
  ComparisonBars,
  useToolSession
} from './components/controlRoom.jsx'
import { runComparePlannedVsActual, runTrackProjectProgress, localToday } from './api.js'
import { useErpRecord } from './useErpRecord.js'
import { cellError, fieldName, confidenceLabel, warningText, unitLabel, unitCode } from './resultExplanation.js'
import { useToolEvaluation } from './useToolEvaluation.js'
import { sessionAccess, storedEvaluation } from './sessionAccess.js'
import { progressBarWidth } from './visualModels.js'
import { comparisonDecision, metricExplanation, projectDecision, progressDifference, decisionAmount, decisionNumber, decisionDate, recordLabel } from './decisionSummary.js'

const TOOL_IDS = new Set(['compare_planned_vs_actual', 'track_project_progress'])
const BUILD_TOOL_ID = import.meta.env.VITE_TOOL_ID

const TOOLS = {
  compare_planned_vs_actual: {
    id: 'compare_planned_vs_actual',
    path: '/compare_planned_vs_actual',
    label: 'Comparación plan vs. real',
    clause: '9.1.1 - seguimiento y medición',
    eyebrow: 'producción · metas y resultados',
    description: 'Compara tus metas con los resultados reales e identifica desviaciones.',
    icon: <Activity size={18} />,

    event: 'PRODUCTION_VARIANCE_DETECTED',
  },
  track_project_progress: {
    id: 'track_project_progress',
    path: '/track_project_progress',
    label: 'Seguimiento de avance de proyecto',
    clause: '6.2 - seguimiento de objetivos',
    eyebrow: 'proyecto · avance y riesgo',
    description: 'Evalúa el avance, presupuesto e hitos para anticipar riesgo de proyecto.',
    icon: <Briefcase size={18} />,

    event: 'PROJECT_AT_RISK',
  }
}

const STATUS_LABELS = {
  on_track: 'En rango',
  deviation: 'Desviación',
  critical: 'Crítico',
  at_risk: 'En riesgo',
  delayed: 'Atrasado',
  not_calculable: 'No calculable',
  sin_meta: 'Sin meta',
  pending: 'Pendiente'
}

const ACTION_LABELS = {
  continue_monitoring: 'Continuar monitoreo',
  review_variance: 'Revisar desviación',
  confirm_data_source: 'Confirmar fuente de datos',
  open_corrective_action: 'Abrir acción correctiva',
  review_root_cause: 'Revisar causa raíz',
  notify_process_owner: 'Notificar responsable del proceso',
  review_project_risk: 'Revisar riesgo del proyecto',
  confirm_milestone_plan: 'Confirmar plan de hitos',
  escalate_project_review: 'Escalar revisión de proyecto',
  open_recovery_plan: 'Abrir plan de recuperación',
  notify_project_owner: 'Notificar responsable del proyecto',
  complete_required_data: 'Completar datos requeridos',
  review_input_quality: 'Revisar calidad de captura',
  define_sales_target: 'Definir meta de ventas'
}

const ACTION_DETAILS = {
  continue_monitoring: 'Mantener el seguimiento en el próximo corte de información.',
  review_variance: 'Revisar primero los indicadores fuera de tolerancia y sus causas.',
  confirm_data_source: 'Confirmar que las metas y los resultados corresponden al mismo periodo.',
  open_corrective_action: 'Valorar una acción correctiva con el responsable del proceso.',
  review_root_cause: 'Investigar el origen de las diferencias antes de definir medidas.',
  notify_process_owner: 'Compartir los hallazgos con el responsable del proceso.',
  review_project_risk: 'Revisar los compromisos pendientes y los recursos del proyecto.',
  confirm_milestone_plan: 'Confirmar fechas y condiciones para cumplir los próximos compromisos.',
  escalate_project_review: 'Llevar los riesgos del proyecto a la instancia de decisión correspondiente.',
  open_recovery_plan: 'Valorar medidas para recuperar los compromisos y el avance previsto.',
  notify_project_owner: 'Compartir las prioridades de atención con el responsable del proyecto.',
  complete_required_data: 'Completar la información señalada antes de utilizar el resultado.',
  review_input_quality: 'Confirmar los datos que presentan avisos o inconsistencias.',
  define_sales_target: 'Acordar una meta de ventas para poder comparar el resultado del periodo.'
}

const RISK_LABELS = {
  schedule_variance: 'Avance por debajo de lo planificado',
  critical_milestone_overdue: 'Hito crítico vencido',
  blocked_milestone: 'Hito bloqueado',
  budget_overrun: 'Presupuesto por encima del avance',
  missing_evidence: 'Datos insuficientes',
  sin_riesgo_abierto: 'Sin riesgos identificados'
}

function currentToolId () {
  if (TOOL_IDS.has(BUILD_TOOL_ID)) return BUILD_TOOL_ID

  const path = window.location.pathname
  if (path.includes('track_project_progress')) return 'track_project_progress'
  if (path.includes('compare_planned_vs_actual')) return 'compare_planned_vs_actual'
  return 'compare_planned_vs_actual'
}

export default function App () {
  const toolId = currentToolId()
  const tool = TOOLS[toolId]
  const lockedToBuildTool = TOOL_IDS.has(BUILD_TOOL_ID)

  return (
    <AppShell
      tool={tool.label}
      clause={tool.clause}
      icon={tool.icon}
      tabs={lockedToBuildTool ? null : <ToolTabs active={toolId} />}
    >
      <ErpTool key={toolId} tool={tool} />
    </AppShell>
  )
}

function ToolTabs ({ active }) {
  return (
    <>
      <Tab active={active === 'compare_planned_vs_actual'} href={TOOLS.compare_planned_vs_actual.path}>
        Plan vs. real
      </Tab>
      <Tab active={active === 'track_project_progress'} href={TOOLS.track_project_progress.path}>
        Avance de proyecto
      </Tab>
    </>
  )
}

function ErpTool ({ tool }) {
  const { record, records, evaluations, requested, setRequested, loading, error } = useErpRecord(tool.id)
  const session = useToolSession()
  const { canRead, canEvaluate } = sessionAccess(session)
  const saved = storedEvaluation(tool.id, record, evaluations)
  const project = tool.id === 'track_project_progress'
  const id = record?.[project ? 'project_id' : 'analysis_id'] || requested
  if (!session) return <Loading label="Comprobando acceso" />
  if (!canRead) return <ErrorState title="Acceso no disponible" detail={session.authenticated ? 'Tu cuenta necesita un permiso de consulta para ver estos registros. Solicítalo al administrador.' : 'Inicia sesión para consultar esta información.'} />
  return <div className="page-stack">
    <section className="record-picker" aria-label={project ? 'Proyecto en revisión' : 'Análisis en revisión'}>
      <Field label={project ? 'Seleccionar proyecto' : 'Seleccionar análisis'}>
        <select className="input" value={id} disabled={loading || Object.keys(records).length === 0} onChange={event => setRequested(event.target.value)}>
          <option value="">Selecciona un registro del ERP</option>
          {requested && !Object.hasOwn(records, requested) ? <option value={requested}>Registro no disponible: {requested}</option> : null}
          {Object.entries(records).map(([id, value]) => <option key={id} value={id}>{recordLabel(value, project)}</option>)}
        </select>
      </Field>
      <div className="record-context"><span>{Object.keys(records).length} {project ? 'proyectos disponibles' : 'análisis disponibles'}</span>{record ? <span>{record.test ? 'Datos de prueba · ' : ''}Datos del {erpDate(record.source?.source_extracted_at)}</span> : null}</div>
    </section>
    {loading ? <Loading label="Leyendo registros" /> : error ? <ErrorState title="No se pudieron consultar los registros" detail={error} /> : record
      ? !canEvaluate && !saved ? <EmptyState title="Aún no hay una evaluación disponible" detail="Puedes consultar este registro, pero todavía no tiene un resultado guardado válido. Solicita su revisión al responsable de operaciones." />
        : project ? <TrackPage key={`${canEvaluate}:${JSON.stringify(record)}`} initialInput={record} canEvaluate={canEvaluate} saved={saved} /> : <ComparePage key={`${canEvaluate}:${JSON.stringify(record)}`} initialInput={record} canEvaluate={canEvaluate} saved={saved} />
      : <EmptyState title={Object.keys(records).length === 0 ? project ? 'Aún no hay proyectos' : 'Aún no hay análisis' : requested ? 'Registro no disponible' : 'Selecciona un registro'} detail={Object.keys(records).length === 0 ? 'La información aparecerá cuando se actualicen los datos del ERP.' : requested ? 'La referencia solicitada no está disponible.' : 'Elige un registro para ver su resumen y las prioridades de atención.'} />}
  </div>
}

function ErpValue ({ label, value }) {
  return <dl className="erp-value"><dt>{label}</dt><dd>{value === undefined || value === null || value === '' ? 'No disponible' : String(value)}</dd></dl>
}

function erpDate (value, dateOnly = false) {
  if (!value || Number.isNaN(Date.parse(value))) return 'No disponible'
  if (dateOnly) return decisionDate(value)
  return new Date(value).toLocaleString('es-MX', dateOnly ? { year: 'numeric', month: '2-digit', day: '2-digit' } : undefined)
}

function ComparePage ({ initialInput, canEvaluate, saved }) {
  const { input, setInput, response, loading, error } = useToolEvaluation(() => structuredClone(initialInput), runComparePlannedVsActual, { enabled: canEvaluate, storedResponse: saved })
  const result = response?.result
  const decision = useMemo(() => comparisonDecision(result), [result])
  const adjusted = JSON.stringify(input) !== JSON.stringify(initialInput)
  const quality = result?.data_quality
  const inRange = decision.metrics.filter(metric => metric.status === 'on_track').length
  const comparable = result && !['sin_meta', 'not_calculable'].includes(result.status) && decision.metrics.length > 0
  return (
    <ToolPage headline={decision.headline} context={initialInput.domain === 'sales' ? 'Ventas del periodo' : 'Resultados del periodo'} result={result} loading={loading} error={error} adjusted={adjusted} readOnly={!canEvaluate} evaluationDate={input.as_of_date} graphic={<DataRing value={comparable ? inRange / decision.metrics.length * 100 : null} display={`${inRange}/${decision.metrics.length}`} label="Indicadores en rango" tone="ok" />}>
      <section className="metrics-grid" aria-label="Resumen del desempeño">
        <Metric icon={<Target size={16} />} label="Indicadores por atender" value={result ? ['sin_meta', 'not_calculable'].includes(result.status) ? 'Sin evaluar' : `${decision.attention.length} de ${decision.metrics.length}` : '—'} hint={decision.unavailable.length ? `${decision.unavailable.length} sin datos suficientes` : 'Fuera de las tolerancias acordadas'} tone={decision.attention.length ? 'warn' : 'default'} />
        <Metric icon={<TrendingUp size={16} />} label="Mayor desviación observada" value={formatPercent(decision.largest)} hint="Diferencia desfavorable respecto a la meta" />
        <Metric icon={<BarChart3 size={16} />} label="Desviación ponderada" value={formatPercent(result?.weighted_deviation_percent)} hint="Promedio según la importancia de cada indicador" />
        <Metric icon={<ShieldCheck size={16} />} label="Calidad de la información" value={result ? confidenceLabel(quality?.confidence) : 'Pendiente'} hint={result ? `${quality?.missing_fields?.length || 0} faltantes · ${quality?.warnings?.length || 0} avisos` : 'Evaluación en curso'} />
      </section>
      <div className="decision-grid">
        <Panel title="Dónde concentrar la atención" subtitle="Los indicadores con mayor prioridad aparecen primero.">
          {!result ? error ? <EmptyState title="Evaluación no disponible" detail="Revisa el mensaje de la evaluación antes de utilizar estos datos." /> : <Loading label="Preparando los indicadores" /> : decision.metrics.length ? <div className="indicator-list">
            {decision.metrics.map((metric, index) => <article className="indicator-card" key={`${metric.metric_id}-${index}`}>
              <div className="indicator-heading"><strong>{metric.name || 'Indicador sin nombre'}</strong><StatusChip status={STATUS_LABELS[metric.status] || 'Sin evaluar'} tone={toneForStatus(metric.status)} /></div>
              <div className="comparison-values"><span>Meta <b>{displayQuantity(metric.planned, metric.unit)}</b></span><span>Resultado <b>{displayQuantity(metric.actual, metric.unit)}</b></span><span>Diferencia desfavorable <b>{formatPercent(metric.adverse_percent)}</b></span></div>
              <ComparisonBars planned={metric.planned} actual={metric.actual} tone={toneForStatus(metric.status)} />
              <p>{metricExplanation(metric)}</p>
            </article>)}
          </div> : <EmptyState title={result.status === 'sin_meta' ? 'Define la meta del periodo' : 'Sin indicadores evaluados'} detail="Se necesita una meta y un resultado comparables para medir el desempeño." />}
        </Panel>
        <DecisionActions result={result} loading={loading} />
      </div>
      <EvaluationTrace input={response?.input || input} project={false} result={result} adjusted={adjusted} />
      {canEvaluate ? <ScenarioPanel adjusted={adjusted} reset={() => setInput(structuredClone(initialInput))}>
        <Panel title="Ajustar indicadores para esta evaluación" subtitle="Estos cambios no se guardan en el ERP." actions={<Button onClick={() => addMetric(setInput)}><Plus size={14} /> Agregar indicador</Button>}>
          <MetricsEditor metrics={input.metrics || []} setInput={setInput} checked={Boolean(result)} evaluated={result?.details?.metrics || []} />
        </Panel>
      </ScenarioPanel> : null}
    </ToolPage>
  )
}

function TrackPage ({ initialInput, canEvaluate, saved }) {
  const baseline = useMemo(() => ({ ...structuredClone(initialInput), actual_progress_percent: completedMilestonePercent(initialInput.milestones) ?? initialInput.actual_progress_percent }), [initialInput])
  const evaluate = useCallback(async ({ input }) => runTrackProjectProgress({ input }), [])
  const { input, response, loading, error, setInput: updateInput } = useToolEvaluation(() => structuredClone(baseline), evaluate, { enabled: canEvaluate, storedResponse: saved })
  function setInput (update) {
    updateInput(current => {
      const next = typeof update === 'function' ? update(current) : update
      return { ...next, actual_progress_percent: completedMilestonePercent(next.milestones) ?? initialInput.actual_progress_percent }
    })
  }
  const evaluationDate = response?.input?.as_of_date || (canEvaluate ? localToday() : initialInput.as_of_date)
  const result = response?.result
  const decision = useMemo(() => projectDecision({ ...input, as_of_date: evaluationDate }, result), [input, result, evaluationDate])
  const { visual } = decision
  const adjusted = canEvaluate && JSON.stringify(input) !== JSON.stringify(baseline)
  const milestones = [...visual.milestones].sort((a, b) => Number(b.isOverdue || b.status === 'blocked') - Number(a.isOverdue || a.status === 'blocked') || (a.dueDate?.getTime() || Infinity) - (b.dueDate?.getTime() || Infinity))
  return (
    <ToolPage headline={decision.headline} context={input.project_name || 'Proyecto seleccionado'} result={result} loading={loading} error={error} adjusted={adjusted} readOnly={!canEvaluate} evaluationDate={evaluationDate} graphic={<DataRing value={result ? visual.actualProgress : null} label="Avance real" tone="info" />}>
      <section className="metrics-grid" aria-label="Resumen del proyecto">
        <Metric icon={<Target size={16} />} label="Avance alcanzado" value={result ? formatPercent(visual.actualProgress) : '—'} hint={`Planificado: ${formatPercent(visual.plannedProgress)}`} />
        <Metric icon={<TrendingUp size={16} />} label="Posición frente al plan" value={result && visual.actualProgress !== null && visual.plannedProgress !== null ? `${decisionNumber(Math.abs(visual.actualProgress - visual.plannedProgress))} pp` : '—'} hint={progressDifference(visual.plannedProgress, visual.actualProgress)} tone={result ? toneForStatus(result.status) : 'default'} />
        <Metric icon={<Clock size={16} />} label="Compromisos vencidos" value={result?.status === 'not_calculable' ? 'Sin evaluar' : result ? decision.overdue.length : '—'} hint={result?.status === 'not_calculable' ? 'Completa la información del proyecto antes de valorar sus compromisos.' : `${decision.open.length} abiertos · ${decision.blocked.length} bloqueados`} tone={decision.overdue.length || decision.blocked.length ? 'warn' : 'default'} />
        <Metric icon={<Wallet size={16} />} label="Presupuesto utilizado" value={result ? formatPercent(visual.budgetUsedPercent) : '—'} hint={decisionAmount(input.budget?.actual_amount, input.budget?.currency)} />
      </section>
      <div className="decision-grid">
        <div className="stack">
          <Panel title="Avance y presupuesto" subtitle="Compara el cumplimiento del plan con el uso de los recursos.">
            <ProgressPair visual={visual} />
            <div className="budget-context"><span>Gasto: <strong>{decisionAmount(input.budget?.actual_amount, input.budget?.currency)}</strong></span><span>Presupuesto: <strong>{decisionAmount(input.budget?.planned_amount, input.budget?.currency)}</strong></span></div>
            <p className="supporting-copy">{!canEvaluate ? 'El avance corresponde a la evaluación guardada en la fecha de corte.' : Array.isArray(input.milestones) && completedMilestonePercent(input.milestones) !== null ? 'El avance real se calcula con los hitos completados; los cancelados no cuentan.' : 'El avance real corresponde al dato disponible del proyecto.'}</p>
          </Panel>
          <Panel title="Compromisos del proyecto" subtitle="Primero los vencidos o bloqueados; después los compromisos pendientes.">
            {decision.upcoming ? <p className="next-commitment"><CalendarDays size={16} aria-hidden="true" /> Próximo compromiso: <strong>{decision.upcoming.name}</strong> · {erpDate(decision.upcoming.dueDate.toISOString(), true)}</p> : null}
            {milestones.length ? <div className="commitment-list">{milestones.map(milestone => <article className={`commitment ${milestone.isOverdue || milestone.status === 'blocked' ? 'attention' : milestone.status === 'completed' ? 'completed' : 'upcoming'}`} key={milestone.id}>
              <span className="commitment-marker" aria-hidden="true" />
              <div><strong>{milestone.name}</strong><span>{milestone.dueDate ? erpDate(milestone.dueDate.toISOString(), true) : 'Fecha no disponible'}{milestone.critical ? ' · Crítico para el proyecto' : ''}</span></div>
              <Badge tone={milestone.isOverdue || milestone.status === 'blocked' ? 'danger' : milestone.status === 'completed' ? 'ok' : 'neutral'}>{milestone.status === 'blocked' ? milestone.isOverdue ? 'Bloqueado y vencido' : 'Bloqueado' : milestone.isOverdue ? 'Vencido' : { pending: 'Pendiente', completed: 'Completado', cancelled: 'Cancelado' }[milestone.status] || 'Por revisar'}</Badge>
            </article>)}</div> : <EmptyState title="Sin compromisos registrados" detail="No hay hitos disponibles para identificar próximas fechas o bloqueos." />}
          </Panel>
        </div>
        <DecisionActions result={result} loading={loading} risks={result?.risk_reasons || []} />
      </div>
      <EvaluationTrace input={response?.input || { ...input, as_of_date: evaluationDate }} project result={result} adjusted={adjusted} sourceInput={initialInput} />
      {canEvaluate ? <ScenarioPanel adjusted={adjusted} reset={() => updateInput(structuredClone(baseline))}>
        <Panel title="Ajustar compromisos para esta evaluación" subtitle="Estos cambios no se guardan en el ERP." actions={<Button onClick={() => addMilestone(setInput)}><Plus size={14} /> Agregar hito</Button>}>
          <MilestonesEditor milestones={input.milestones || []} checked={Boolean(result)} setInput={setInput} />
        </Panel>
      </ScenarioPanel> : null}
    </ToolPage>
  )
}

function ToolPage ({ headline, context, result, loading, error, adjusted, readOnly, evaluationDate, graphic, children }) {
  return <div className="page-stack">
    <section className={`decision-hero tone-${toneForStatus(result?.status)}`} aria-label="Conclusión de la evaluación" aria-busy={loading}>
      <div className="decision-copy"><div className="decision-hero-top"><span className="eyebrow">Resumen ejecutivo</span><StatusChip status={loading ? 'Actualizando' : STATUS_LABELS[result?.status] || 'Pendiente'} tone={loading ? 'neutral' : toneForStatus(result?.status)} /></div>
      <p className="hero-context">{context}</p>
      <h2>{error ? 'No se pudo completar la evaluación' : headline}</h2>
      <p role="status">{readOnly ? `Solo consulta · resultado guardado al corte del ${erpDate(evaluationDate, true)}. No se recalcula a la fecha de hoy.` : adjusted ? 'Escenario ajustado · los datos originales del ERP no se han modificado.' : 'Evaluación de los datos disponibles del registro seleccionado.'}</p>
      </div>{graphic}
    </section>
    {error ? <ErrorState title="Revisa la información antes de tomar una decisión" detail={error} /> : null}
    {children}
  </div>
}

function DecisionActions ({ result, loading, risks = [] }) {
  return <aside className="stack">
    <Panel title="Qué conviene hacer" subtitle="Recomendaciones para revisión; no ejecutan cambios.">
      {loading ? <Loading label="Preparando las recomendaciones" /> : <ActionList actions={result?.recommended_actions || []} />}
    </Panel>
    {risks.filter(risk => risk !== 'sin_riesgo_abierto').length ? <Panel title="Motivos de atención"><div className="quality-list">{risks.filter(risk => risk !== 'sin_riesgo_abierto').map(risk => <p className="risk-reason" key={risk}>{RISK_LABELS[risk] || 'Revisar las condiciones del proyecto'}</p>)}</div></Panel> : null}
    <details className="review-details quality-details" open={result?.status === 'not_calculable'}>
      <summary>¿La información está completa?</summary>
      {result?.status === 'not_calculable' ? <p className="supporting-copy">Completa o confirma los datos señalados en la fuente de información antes de utilizar la evaluación.</p> : null}
      <DataQuality loading={loading} pending={!result} missingFields={result?.data_quality?.missing_fields || []} warnings={result?.data_quality?.warnings || []} />
    </details>
  </aside>
}

function EvaluationTrace ({ input, project, result, adjusted, sourceInput = input }) {
  const thresholds = result?.audit?.thresholds_applied || input.thresholds || {}
  return <details className="review-details">
    <summary>Origen y criterios de la evaluación</summary>
    <p className="supporting-copy">{adjusted ? 'El resultado incluye ajustes de escenario; no representa una actualización del ERP.' : 'Información que respalda el resultado de este registro.'}</p>
    {project ? <Panel title="Datos del proyecto"><div className="form-grid">
      <ErpValue label="Organización" value={input.organization_name || input.organization_id} />
      <ErpValue label="Referencia del proyecto" value={input.project_id} />
      <ErpValue label="Inicio planificado" value={erpDate(input.planned_start_date, true)} />
      <ErpValue label="Fin planificado" value={erpDate(input.planned_end_date, true)} />
      <ErpValue label="Datos del ERP al" value={erpDate(sourceInput.as_of_date)} />
      <ErpValue label="Fecha de evaluación" value={erpDate(input.as_of_date, true)} />
    </div></Panel> : <Panel title="Datos de comparación"><div className="form-grid">
      <ErpValue label="Organización" value={input.organization_name || input.organization_id} />
      <ErpValue label="Referencia del análisis" value={input.analysis_id} />
      <ErpValue label="Planta" value={input.plant_name || input.plant_id} />
      <ErpValue label="Fecha de corte" value={erpDate(input.as_of_date)} />
      <ErpValue label="Periodo" value={[input.period_start, input.period_end].filter(Boolean).join(' al ')} />
    </div></Panel>}
    <div className="form-grid trace-criteria">
      <ErpValue label="Fuente de la información" value={sourceInput.source?.source_system === 'microsip' ? 'ERP Microsip' : sourceInput.source?.source_system} />
      <ErpValue label="Última extracción de datos" value={erpDate(sourceInput.source?.source_extracted_at)} />
      {project ? <>
        <ErpValue label="Tolerancia de retraso" value={formatPercent(thresholds.at_risk_delay_percent)} />
        <ErpValue label="Umbral de atraso" value={formatPercent(thresholds.delayed_percent)} />
        <ErpValue label="Tolerancia de gasto respecto al avance" value={formatPercent(thresholds.budget_overrun_vs_progress_percent)} />
      </> : <>
        <ErpValue label="Tolerancia de desviación" value={formatPercent(thresholds.deviation_percent)} />
        <ErpValue label="Umbral crítico" value={formatPercent(thresholds.critical_percent)} />
      </>}
    </div>
  </details>
}

function ScenarioPanel ({ adjusted, reset, children }) {
  return <details className="review-details scenario-details">
    <summary>Explorar otro escenario</summary>
    <div className="scenario-notice"><p>Prueba cambios para comparar su efecto en el resultado. No se guardan en el ERP ni generan acciones automáticas.</p><Button onClick={reset} disabled={!adjusted}>Restablecer datos originales</Button></div>
    {children}
  </details>
}

function displayQuantity (value, unit) {
  return typeof value === 'number' && Number.isFinite(value) ? `${decisionNumber(value)} ${unitLabel(unit)}` : 'No disponible'
}

function MetricsEditor ({ metrics, setInput, evaluated, checked }) {
  return (
    <Table
      rows={metrics}
      getRowKey={(row, index) => `${row.metric_id || 'metric'}-${index}`}
      empty={<EmptyState title="Sin indicadores" detail="Agrega al menos un indicador para calcular la comparación." />}
      columns={[
        ...[['name', 'Nombre'], ['unit', 'Unidad']].map(([key, label]) => ({
          key, header: label,
          render: (row, index) => <Input aria-label={`${label}, indicador ${index + 1}`} error={cellError(row[key], key, checked)} value={key === 'unit' && row[key] ? unitLabel(row[key]) : row[key] || ''} onChange={event => updateMetric(setInput, index, key, key === 'unit' ? unitCode(event.target.value) : event.target.value)} />
        })),
        {
          key: 'weight', header: 'Importancia',
          render: (row, index) => <Input type="number" min="0" step="any" aria-label={`Importancia, indicador ${index + 1}`} error={cellError(row.weight, 'weight', checked)} value={numberValue(row.weight)} onChange={event => updateMetricNumber(setInput, index, 'weight', event.target.value)} />
        },
        {
          key: 'planned',
          header: 'Planificado',
          render: (row, index) => <Input type="number" aria-label={`Valor planificado, indicador ${index + 1}`} error={cellError(row.planned, 'planned', checked)} value={numberValue(row.planned)} onChange={event => updateMetricNumber(setInput, index, 'planned', event.target.value)} />
        },
        {
          key: 'actual',
          header: 'Real',
          render: (row, index) => <Input type="number" aria-label={`Valor real, indicador ${index + 1}`} error={cellError(row.actual, 'actual', checked)} value={numberValue(row.actual)} onChange={event => updateMetricNumber(setInput, index, 'actual', event.target.value)} />
        },
        {
          key: 'direction',
          header: 'Criterio',
          render: (row, index) => (
            <select aria-label={`Criterio, indicador ${index + 1}`} className="input" value={row.direction || 'target'} onChange={event => updateMetric(setInput, index, 'direction', event.target.value)}>
              <option value="higher_is_better">Mayor es mejor</option>
              <option value="lower_is_better">Menor es mejor</option>
              <option value="target">Valor objetivo</option>
            </select>
          )
        },
        {
          key: 'status',
          header: 'Resultado',
          render: (row, index) => <div><StatusChip status={STATUS_LABELS[evaluated[index]?.status] || 'Pendiente'} tone={toneForStatus(evaluated[index]?.status)} /><p>Desviación desfavorable: {formatPercent(evaluated[index]?.adverse_percent)}</p></div>
        },
        {
          key: 'remove', header: 'Acciones',
          render: (row, index) => <Button aria-label={`Eliminar indicador ${index + 1}`} onClick={() => setInput(current => ({ ...current, metrics: current.metrics.filter((item, itemIndex) => itemIndex !== index) }))}>Eliminar</Button>
        }
      ]}
    />
  )
}

function MilestonesEditor ({ milestones, setInput, checked }) {
  return (
    <Table
      rows={milestones}
      getRowKey={(row, index) => `${row.milestone_id || 'milestone'}-${index}`}
      empty={<EmptyState title="Sin hitos" detail="El avance puede evaluarse sin hitos, pero la lectura de riesgo será menos completa." />}
      columns={[
        {
          key: 'name',
          header: 'Hito',
          render: (row, index) => <Input aria-label={`Nombre, hito ${index + 1}`} error={cellError(row.name, 'name', checked)} value={row.name || ''} onChange={event => updateMilestone(setInput, index, 'name', event.target.value)} />
        },
        {
          key: 'due',
          header: 'Fecha de compromiso',
          render: (row, index) => <Input aria-label={`Fecha de compromiso, hito ${index + 1}`} type="date" error={cellError(row.due_date, 'due_date', checked)} value={dateOnly(row.due_date)} onChange={event => updateMilestone(setInput, index, 'due_date', event.target.value)} />
        },
        {
          key: 'status',
          header: 'Estado',
          render: (row, index) => (
            <select aria-label={`Estado, hito ${index + 1}`} className="input" value={row.status || 'pending'} onChange={event => updateMilestone(setInput, index, 'status', event.target.value)}>
              <option value="pending">Pendiente</option>
              <option value="completed">Completado</option>
              <option value="blocked">Bloqueado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          )
        },
        {
          key: 'critical',
          header: 'Crítico',
          render: (row, index) => (
            <label className="checkbox-field">
              <input aria-label={`Hito crítico, ${row.name || index + 1}`} type="checkbox" checked={row.critical === true} onChange={event => updateMilestone(setInput, index, 'critical', event.target.checked)} />
              <span>{row.critical ? 'Sí' : 'No'}</span>
            </label>
          )
        },
        {
          key: 'remove', header: 'Acciones',
          render: (row, index) => <Button aria-label={`Eliminar hito ${index + 1}`} onClick={() => setInput(current => ({ ...current, milestones: current.milestones.filter((item, itemIndex) => itemIndex !== index) }))}>Eliminar</Button>
        }
      ]}
    />
  )
}

function DataQuality ({ loading, pending, missingFields, warnings }) {
  if (loading) return <Loading label="Validando datos" />
  if (pending) {
    return <EmptyState title="Evaluación pendiente" detail="La calidad de los datos se confirma durante la evaluación automática." />
  }

  if (!missingFields.length && !warnings.length) {
    return <EmptyState title="Sin hallazgos de calidad" detail="La captura actual no reporta faltantes ni avisos." />
  }

  return (
    <div className="quality-list">
      {missingFields.map(field => (
        <div className="quality-row danger" key={`missing-${field}`}>
          <Badge tone="danger">faltante</Badge>
          <span>{fieldName(field)}</span>
        </div>
      ))}
      {warnings.map(warning => (
        <div className="quality-row warn" key={`warning-${warning}`}>
          <Badge tone="warn">aviso</Badge>
          <span>{warningText(warning)}</span>
        </div>
      ))}
    </div>
  )
}

function ActionList ({ actions }) {
  if (!actions.length) return <EmptyState title="Sin acciones" detail="Las recomendaciones aparecerán al completar la evaluación." />
  return (
    <ol className="action-list">
      {actions.map((action, index) => (
        <li className="action-row" key={action}>
          <span className="action-step" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <div><strong>{ACTION_LABELS[action] || 'Revisar el resultado de la evaluación'}</strong>
          {ACTION_DETAILS[action] ? <span>{ACTION_DETAILS[action]}</span> : null}</div>
        </li>
      ))}
    </ol>
  )
}

function ProgressPair ({ visual }) {
  const tones = { success: 'ok', warning: 'warn', danger: 'danger', neutral: 'neutral' }
  return (
    <div className="progress-stack">
      <ProgressBar label="Avance planificado" value={visual.plannedProgress} tone="info" />
      <ProgressBar label="Avance real" value={visual.actualProgress} tone={tones[visual.scheduleBarTone]} />
      <ProgressBar label="Presupuesto utilizado" value={visual.budgetUsedPercent} tone="budget" allowOverflow />
    </div>
  )
}

function ProgressBar ({ label, value, tone, allowOverflow = false }) {
  const width = progressBarWidth(value, allowOverflow)
  return (
    <div className={`progress-row tone-${tone}`}>
      <div><span>{label}</span><Mono>{width === null ? 'No disponible' : formatPercent(value)}</Mono></div>
      {width === null ? <small>Sin datos válidos para representar este porcentaje.</small> : <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={width} aria-valuetext={formatPercent(value)}><i style={{ width: `${width}%` }} /></span>}
    </div>
  )
}

function setField (setInput, field, value) {
  setInput(current => ({ ...current, [field]: value }))
}

function setNumber (setInput, field, value) {
  setField(setInput, field, parseMaybeNumber(value))
}

function setNestedNumber (setInput, path, value) {
  setInput(current => {
    const next = { ...current }
    let cursor = next
    for (let index = 0; index < path.length - 1; index += 1) {
      const key = path[index]
      cursor[key] = { ...(cursor[key] || {}) }
      cursor = cursor[key]
    }
    cursor[path[path.length - 1]] = parseMaybeNumber(value)
    return next
  })
}

function updateMetric (setInput, index, field, value) {
  setInput(current => ({
    ...current,
    metrics: (current.metrics || []).map((metric, itemIndex) => itemIndex === index ? { ...metric, [field]: value } : metric)
  }))
}

function updateMetricNumber (setInput, index, field, value) {
  updateMetric(setInput, index, field, parseMaybeNumber(value))
}

function updateMilestone (setInput, index, field, value) {
  setInput(current => ({
    ...current,
    milestones: (current.milestones || []).map((milestone, itemIndex) => itemIndex === index ? { ...milestone, [field]: value } : milestone)
  }))
}

function addMetric (setInput) {
  setInput(current => ({
    ...current,
    metrics: [
      ...(current.metrics || []),
      {
        metric_id: `KPI-${crypto.randomUUID()}`,
        name: 'Indicador adicional',
        planned: 100,
        actual: 95,
        unit: 'percent',
        direction: 'higher_is_better',
        weight: 1
      }
    ]
  }))
}

function addMilestone (setInput) {
  setInput(current => ({
    ...current,
    milestones: [
      ...(current.milestones || []),
      {
        milestone_id: `MS-${crypto.randomUUID()}`,
        name: 'Nuevo hito',
        due_date: dateOnly(current.as_of_date || new Date().toISOString()),
        status: 'pending',
        critical: false
      }
    ]
  }))
}

function parseMaybeNumber (value) {
  if (value === '') return ''
  const number = Number(value)
  return Number.isFinite(number) ? number : value
}

function numberValue (value) {
  return value === null || value === undefined ? '' : String(value)
}

function formatPercent (value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}%` : 'No disponible'
}

function dateOnly (value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function toneForStatus (status) {
  if (status === 'on_track') return 'ok'
  if (status === 'deviation' || status === 'at_risk') return 'warn'
  if (status === 'critical' || status === 'delayed') return 'danger'
  return 'neutral'
}

function countOverdue (milestones) {
  return milestones.filter(milestone => milestone.isOverdue).length
}

function countCriticalOverdue (milestones) {
  return milestones.filter(milestone => milestone.critical && milestone.isOverdue).length
}

function countBlocked (milestones) {
  return milestones.filter(milestone => milestone.status === 'blocked').length
}
