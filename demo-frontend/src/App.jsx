import { completedMilestonePercent } from '../../src/utils/projectMilestones.js'
import { useCallback, useMemo } from 'react'
import { Activity, Briefcase, Plus } from 'lucide-react'
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
  PageHeader,
  Panel,
  StatusChip,
  Tab,
  Table
} from './components/controlRoom.jsx'
import { runComparePlannedVsActual, runTrackProjectProgress, saveProjectMilestones, localToday } from './api.js'
import { useErpRecord, erpSummary } from './useErpRecord.js'
import { cellError, explainResult, fieldError, fieldName, confidenceLabel, warningText, unitLabel, unitCode } from './resultExplanation.js'
import { useToolEvaluation } from './useToolEvaluation.js'
import { deriveOperationalVisualModel, deriveProjectVisualModel, progressBarWidth } from './visualModels.js'

const TOOL_IDS = new Set(['compare_planned_vs_actual', 'track_project_progress'])
const BUILD_TOOL_ID = import.meta.env.VITE_TOOL_ID

const TOOLS = {
  compare_planned_vs_actual: {
    id: 'compare_planned_vs_actual',
    path: '/compare_planned_vs_actual',
    label: 'Comparación plan vs. real',
    clause: '9.1.3 - análisis y evaluación',
    eyebrow: 'producción · metas y resultados',
    description: 'Compara tus metas con los resultados reales e identifica desviaciones.',
    icon: <Activity size={18} />,

    event: 'PRODUCTION_VARIANCE_DETECTED',
  },
  track_project_progress: {
    id: 'track_project_progress',
    path: '/track_project_progress',
    label: 'Seguimiento de avance de proyecto',
    clause: '6.3 - planificación de cambios',
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
  review_input_quality: 'Revisar calidad de captura'
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
  const { record, records, requested, setRequested, loading, error } = useErpRecord(tool.id)
  const project = tool.id === 'track_project_progress'
  const id = record?.[project ? 'project_id' : 'analysis_id'] || requested
  return <div className="page-stack">
    <Panel title={project ? 'Proyecto' : 'Análisis'} subtitle="Resumen de los registros del ERP. Selecciona uno para consultar su evaluación.">
      {!loading && !error ? <div className="metrics-grid erp-summary">{erpSummary(records, tool.id).map(item => <Metric key={item.label} label={item.label} value={item.value} hint={item.hint} />)}</div> : null}
      <Field label={project ? 'Seleccionar proyecto' : 'Seleccionar análisis'}>
        <select className="input" value={id} disabled={loading || Object.keys(records).length === 0} onChange={event => setRequested(event.target.value)}>
          <option value="">Selecciona un registro del ERP</option>
          {requested && !Object.hasOwn(records, requested) ? <option value={requested}>Registro no disponible: {requested}</option> : null}
          {Object.entries(records).map(([id, value]) => <option key={id} value={id}>{project ? `${value.project_name || id} · ${id}` : `${value.plant_id || 'Análisis'} · ${id}`}</option>)}
        </select>
      </Field>
    </Panel>
    {loading ? <Loading label="Leyendo datos del ERP" /> : error ? <ErrorState title="No se pudo sincronizar con el ERP" detail={error} /> : record
      ? project ? <TrackPage key={JSON.stringify(record)} tool={tool} initialInput={record} /> : <ComparePage key={JSON.stringify(record)} tool={tool} initialInput={record} />
      : <EmptyState title={Object.keys(records).length === 0 ? project ? 'Aún no hay proyectos' : 'Aún no hay análisis' : requested ? 'Registro no disponible' : 'Selecciona un registro'} detail={Object.keys(records).length === 0 ? 'Los registros aparecerán aquí cuando se guarden en el ERP.' : requested ? 'La referencia solicitada no existe en el ERP.' : 'Selecciona un registro existente para consultar su evaluación.'} />}
  </div>
}

function ErpValue ({ label, value }) {
  return <dl className="erp-value"><dt>{label}</dt><dd>{value === undefined || value === null || value === '' ? 'No disponible' : String(value)}</dd></dl>
}

function erpDate (value, dateOnly = false) {
  if (!value || Number.isNaN(Date.parse(value))) return 'No disponible'
  if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/')
  return new Date(value).toLocaleString('es-MX', dateOnly ? { year: 'numeric', month: '2-digit', day: '2-digit' } : undefined)
}

function ComparePage ({ tool, initialInput }) {
  const { input, setInput, response, loading, error } = useToolEvaluation(() => structuredClone(initialInput), runComparePlannedVsActual)
  const result = response?.result
  const visual = useMemo(() => deriveOperationalVisualModel(input, result), [input, result])

  const dataQuality = result?.data_quality
  const missingFields = dataQuality?.missing_fields || []
  const warnings = dataQuality?.warnings || []
  const displayStatus = result?.status || 'pending'

  return (
    <ToolPage
      tool={tool}
      loading={loading}
      error={error}
      response={response}
      metrics={(
        <>
          <Metric label="Estado" value={STATUS_LABELS[displayStatus] || 'Pendiente'} tone={toneForStatus(displayStatus)} />
          <Metric label="Mayor desviación" value={formatPercent(visual.deviationPercent)} hint="Mayor diferencia desfavorable respecto a la meta" tone={toneForStatus(visual.status)} />
          <Metric label="Desviación ponderada" value={formatPercent(visual.weightedDeviationPercent)} hint="Promedio ponderado" />
          <Metric label="Calidad de los datos" value={result ? confidenceLabel(dataQuality?.confidence) : 'Pendiente'} hint={`${missingFields.length} faltantes · ${warnings.length} avisos`} tone={result ? missingFields.length ? 'danger' : warnings.length ? 'warn' : 'ok' : 'default'} />
        </>
      )}
    >
      <div className="tool-grid">
        <div className="stack">
          <Panel title="Datos de comparación" subtitle="Información del ERP · solo lectura">
            <div className="form-grid">
              <ErpValue label="Organización" value={input.organization_id} />
              <ErpValue label="Referencia del análisis" value={input.analysis_id} />
              <ErpValue label="Planta" value={input.plant_id} />
              <ErpValue label="Fecha de corte" value={erpDate(input.as_of_date)} />
              <ErpValue label="Periodo" value={{ daily: 'Diario', weekly: 'Semanal', monthly: 'Mensual' }[input.period] || 'No disponible'} />
              <ErpValue label="Umbral de desviación (%)" value={input.thresholds?.deviation_percent ?? input.thresholds?.deviationPercent ?? '5 (predeterminado)'} />
              <ErpValue label="Umbral crítico (%)" value={input.thresholds?.critical_percent ?? input.thresholds?.criticalPercent ?? '15 (predeterminado)'} />
            </div>
          </Panel>

          <Panel
            title="Indicadores: metas y resultados"
            subtitle="Compara cada indicador en su unidad. La importancia determina su contribución al promedio."
            actions={<Button onClick={() => addMetric(setInput)}> <Plus size={14} /> Agregar</Button>}
          >
            <MetricsEditor metrics={input.metrics || []} setInput={setInput} checked={Boolean(result)} evaluated={result?.details?.metrics || []} />
          </Panel>
        </div>

        <ResultColumn
          tool={tool}
          result={result}
          response={response}
          loading={loading}
          missingFields={missingFields}
          warnings={warnings}
        />
      </div>
    </ToolPage>
  )
}

function TrackPage ({ tool, initialInput }) {
  const evaluate = useCallback(async ({ input }) => {
    if (JSON.stringify(input.milestones || []) !== JSON.stringify(initialInput.milestones || [])) await saveProjectMilestones(input.project_id, input.milestones || [])
    return runTrackProjectProgress({ input })
  }, [initialInput])
  const evaluation = useToolEvaluation(() => ({ ...structuredClone(initialInput), actual_progress_percent: completedMilestonePercent(initialInput.milestones) }), evaluate)
  const { input, response, loading, error } = evaluation
  function setInput (update) {
    evaluation.setInput(current => {
      const next = typeof update === 'function' ? update(current) : update
      return { ...next, actual_progress_percent: completedMilestonePercent(next.milestones) }
    })
  }
  const evaluationDate = response?.input?.as_of_date || localToday()
  const result = response?.result
  const visual = useMemo(() => deriveProjectVisualModel({ ...input, as_of_date: evaluationDate }, result), [input, result, evaluationDate])
  const summary = result?.milestone_summary || {}

  const dataQuality = result?.data_quality
  const missingFields = dataQuality?.missing_fields || []
  const warnings = dataQuality?.warnings || []
  const risks = result?.risk_reasons || visual.risks || []
  const displayStatus = result?.status || 'pending'
  const overdueCount = summary.overdue ?? countOverdue(visual.milestones)
  const criticalOverdueCount = summary.critical_overdue ?? countCriticalOverdue(visual.milestones)
  const blockedCount = summary.blocked ?? countBlocked(visual.milestones)

  return (
    <ToolPage
      tool={tool}
      loading={loading}
      error={error}
      response={response}
      metrics={(
        <>
          <Metric label="Estado" value={STATUS_LABELS[displayStatus] || 'Pendiente'} tone={toneForStatus(displayStatus)} />
          <Metric label="Avance planificado / real" value={`${formatPercent(visual.plannedProgress)} / ${formatPercent(visual.actualProgress)}`} />
          <Metric label="Hitos abiertos" value={`${overdueCount} vencidos`} hint={`${criticalOverdueCount} críticos · ${blockedCount} bloqueados`} tone={(overdueCount || blockedCount) ? 'warn' : 'ok'} />
          <Metric label="Presupuesto utilizado" value={formatPercent(visual.budgetUsedPercent)} hint={`Diferencia de avance: ${visual.scheduleVariancePercent === null ? "No disponible" : `${visual.scheduleVariancePercent} puntos porcentuales`}`} tone={toneForStatus(visual.status)} />
        </>
      )}
    >
      <div className="tool-grid">
        <div className="stack">
          <Panel title="Datos del proyecto" subtitle="Información del ERP · solo lectura">
            <div className="form-grid">
              <ErpValue label="Organización" value={input.organization_id} />
              <ErpValue label="Referencia del proyecto" value={input.project_id} />
              <ErpValue label="Nombre del proyecto" value={input.project_name} />
              <ErpValue label="Fecha de corte del ERP" value={erpDate(input.as_of_date)} />
              <ErpValue label="Fecha de evaluación" value={erpDate(evaluationDate, true)} />
              <ErpValue label="Inicio planificado" value={erpDate(input.planned_start_date, true)} />
              <ErpValue label="Fin planificado" value={erpDate(input.planned_end_date, true)} />
            </div>
          </Panel>

          <Panel title="Avance y presupuesto" subtitle="Datos del ERP y avance calculado a partir de los hitos">
            <div className="form-grid">
              <ErpValue label="Avance planificado (%)" value={formatPercent(visual.plannedProgress)} />
              <ErpValue label="Avance real (%)" value={formatPercent(visual.actualProgress)} />
              <ErpValue label="Presupuesto planificado" value={input.budget?.planned_amount} />
              <ErpValue label="Moneda del presupuesto" value={input.budget?.currency} />
              <ErpValue label="Presupuesto ejercido" value={input.budget?.actual_amount} />
            </div>
            <ProgressPair visual={visual} />
          </Panel>

          <Panel
            title="Hitos"
            subtitle="El avance real corresponde a los hitos completados. Los hitos cancelados no cuentan."
            actions={<Button onClick={() => addMilestone(setInput)}><Plus size={14} /> Agregar</Button>}
          >
            <MilestonesEditor milestones={input.milestones || []} checked={Boolean(result)} setInput={setInput} />
          </Panel>
        </div>

        <ResultColumn
          tool={tool}
          result={result}
          response={response}
          loading={loading}
          missingFields={missingFields}
          warnings={warnings}
          risks={risks}
        />
      </div>
    </ToolPage>
  )
}

function ToolPage ({ tool, loading, error, metrics, response, children }) {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={tool.eyebrow}
        title={tool.label}
        description={tool.description}
      />
      <p role="status">{loading ? 'Actualizando evaluación…' : 'La evaluación se actualiza automáticamente al cambiar los datos.'}</p>

      {error ? <ErrorState title="No se pudo actualizar la evaluación" detail={error} /> : null}

      <section className="metrics-grid">
        {metrics}
      </section>

      <fieldset className="evaluation-fields" aria-busy={loading}>
        <legend className="sr-only">Captura y resultado de la evaluación</legend>
        {children}
      </fieldset>

      {!response && !loading ? (
        <EmptyState title="Evaluación pendiente" detail="Los resultados se actualizarán automáticamente con los datos de la captura." />
      ) : null}
    </div>
  )
}

function ResultColumn ({ tool, result, response, loading, missingFields, warnings, risks = [] }) {
  const emitted = response?.emitted_event
  const downstream = response?.downstream_impact

  return (
    <aside className="stack">
      <Panel title="Resultado de la evaluación" subtitle="Esta evaluación prepara información; no publica ni realiza acciones automáticamente.">
        {loading ? <Loading label="Evaluando información" /> : null}
        {!loading ? (
          <div className="status-stack">
            <StatusChip status={STATUS_LABELS[result?.status] || 'Pendiente'} tone={toneForStatus(result?.status)} />
            {result ? <div aria-live="polite" className="quality-list">{explainResult(response.input, result).map((line, index) => <p key={index}>{line}</p>)}</div> : <p>Completa la captura para actualizar la evaluación automáticamente.</p>}
          </div>
        ) : null}
      </Panel>

      <Panel title="Calidad de los datos">
        <DataQuality loading={loading} pending={!response} missingFields={missingFields} warnings={warnings} />
      </Panel>

      {risks.length ? (
        <Panel title="Lectura de riesgo">
          <div className="chip-list">
            {risks.map(risk => <Badge tone={risk === 'sin_riesgo_abierto' ? 'ok' : 'warn'} key={risk}>{RISK_LABELS[risk] || 'Riesgo por revisar'}</Badge>)}
          </div>
        </Panel>
      ) : null}

      <Panel title="Acciones recomendadas">
        <ActionList actions={result?.recommended_actions || []} />
      </Panel>

      <details className="technical-details">
        <summary>Detalles técnicos de la evaluación</summary>
        <p>Evento: <span>{tool.id === 'track_project_progress' ? 'Proyecto en riesgo' : 'Desviación detectada'}</span> · {emitted ? 'Preparado, sin publicar' : 'Sin evento preparado'}</p>
        {tool.id === 'track_project_progress' ? <p>Regla de seguimiento automático: {downstream?.applies ? 'aplica' : 'no aplica'}. Solo corresponde al estado de riesgo definido por el contrato.</p> : null}
        <Panel title="Entrada y resultado">
        <pre className="json-preview">{JSON.stringify(response ? {
          input: response.input,
          result: response.result,
          emitted_event: response.emitted_event
        } : { pending: true }, null, 2)}</pre>
        </Panel>
      </details>
    </aside>
  )
}

function MetricsEditor ({ metrics, setInput, evaluated, checked }) {
  return (
    <Table
      rows={metrics}
      getRowKey={(row, index) => `${row.metric_id || 'metric'}-${index}`}
      empty={<EmptyState title="Sin indicadores" detail="Agrega al menos un indicador para calcular la comparación." />}
      columns={[
        {
          key: 'metric',
          header: 'Referencia',
          render: (row, index) => <Input aria-label={`Referencia, indicador ${index + 1}`} error={cellError(row.metric_id, 'metric_id', checked)} value={row.metric_id || ''} onChange={event => updateMetric(setInput, index, 'metric_id', event.target.value)} />
        },
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
    <div className="action-list">
      {actions.map(action => (
        <div className="action-row" key={action}>
          <span>{ACTION_LABELS[action] || 'Revisar el resultado de la evaluación'}</span>

        </div>
      ))}
    </div>
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
