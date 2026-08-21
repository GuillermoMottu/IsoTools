import { useMemo, useState } from 'react'
import { Activity, Briefcase, Play, Plus, RotateCcw } from 'lucide-react'
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
import { runComparePlannedVsActual, runTrackProjectProgress } from './api.js'
import { scenarioPayload } from './scenarios.js'
import { deriveOperationalVisualModel, deriveProjectVisualModel } from './visualModels.js'

const TOOL_IDS = new Set(['compare_planned_vs_actual', 'track_project_progress'])
const BUILD_TOOL_ID = import.meta.env.VITE_TOOL_ID

const TOOLS = {
  compare_planned_vs_actual: {
    id: 'compare_planned_vs_actual',
    path: '/compare_planned_vs_actual',
    label: 'Comparacion Plan vs Real',
    clause: '9.1.3 - analisis y evaluacion',
    eyebrow: 'produccion · plan contra real',
    description: 'Evalua metas aprobadas contra ejecucion real y prepara el evento de desviacion.',
    icon: <Activity size={18} />,
    action: 'Ejecutar comparacion',
    event: 'PRODUCTION_VARIANCE_DETECTED',
    defaultScenario: 'deviation'
  },
  track_project_progress: {
    id: 'track_project_progress',
    path: '/track_project_progress',
    label: 'Seguimiento de Avance de Proyecto',
    clause: '6.3 - planificacion de cambios',
    eyebrow: 'proyecto · avance y riesgo',
    description: 'Evalua avance, presupuesto e hitos para anticipar riesgo de proyecto.',
    icon: <Briefcase size={18} />,
    action: 'Evaluar avance',
    event: 'PROJECT_AT_RISK',
    defaultScenario: 'at_risk'
  }
}

const COMPARE_SCENARIOS = [
  ['on_track', 'En rango'],
  ['deviation', 'Desviacion'],
  ['critical', 'Critico'],
  ['validation', 'Datos incompletos']
]

const TRACK_SCENARIOS = [
  ['on_track', 'En rango'],
  ['at_risk', 'En riesgo'],
  ['delayed', 'Atrasado'],
  ['validation', 'Datos incompletos']
]

const STATUS_LABELS = {
  on_track: 'En rango',
  deviation: 'Desviacion',
  critical: 'Critico',
  at_risk: 'En riesgo',
  delayed: 'Atrasado',
  not_calculable: 'No calculable',
  pending: 'Pendiente'
}

const ACTION_LABELS = {
  continue_monitoring: 'Continuar monitoreo',
  review_variance: 'Revisar desviacion',
  confirm_data_source: 'Confirmar fuente de datos',
  open_corrective_action: 'Abrir accion correctiva',
  review_root_cause: 'Revisar causa raiz',
  notify_process_owner: 'Notificar responsable del proceso',
  review_project_risk: 'Revisar riesgo del proyecto',
  confirm_milestone_plan: 'Confirmar plan de hitos',
  escalate_project_review: 'Escalar revision de proyecto',
  open_recovery_plan: 'Abrir plan de recuperacion',
  notify_project_owner: 'Notificar responsable del proyecto',
  complete_required_data: 'Completar datos requeridos',
  review_input_quality: 'Revisar calidad de captura'
}

const RISK_LABELS = {
  schedule_variance: 'Brecha avance plan vs real',
  critical_milestone_overdue: 'Hito critico vencido',
  blocked_milestone: 'Hito bloqueado',
  budget_overrun: 'Presupuesto por encima del avance',
  missing_evidence: 'Evidencia incompleta'
}

function currentToolId () {
  if (TOOL_IDS.has(BUILD_TOOL_ID)) return BUILD_TOOL_ID

  const path = window.location.pathname
  if (path.includes('track_project_progress')) return 'track_project_progress'
  if (path.includes('compare_planned_vs_actual')) return 'compare_planned_vs_actual'
  return 'compare_planned_vs_actual'
}

function scenarioInput (toolId, scenario) {
  const payload = scenarioPayload(scenario)
  return toolId === 'compare_planned_vs_actual' ? payload.compare : payload.project
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
      {toolId === 'compare_planned_vs_actual'
        ? <ComparePage tool={tool} />
        : <TrackPage tool={tool} />}
    </AppShell>
  )
}

function ToolTabs ({ active }) {
  return (
    <>
      <Tab active={active === 'compare_planned_vs_actual'} href={TOOLS.compare_planned_vs_actual.path}>
        compare_planned_vs_actual
      </Tab>
      <Tab active={active === 'track_project_progress'} href={TOOLS.track_project_progress.path}>
        track_project_progress
      </Tab>
    </>
  )
}

function ComparePage ({ tool }) {
  const [scenario, setScenario] = useState(tool.defaultScenario)
  const [input, setInput] = useState(() => scenarioInput(tool.id, tool.defaultScenario))
  const [response, setResponse] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const result = response?.result
  const visual = useMemo(() => deriveOperationalVisualModel(input, result), [input, result])

  function selectScenario (nextScenario) {
    setScenario(nextScenario)
    setInput(scenarioInput(tool.id, nextScenario))
    setResponse(null)
    setError('')
  }

  async function run () {
    setLoading(true)
    setError('')
    try {
      setResponse(await runComparePlannedVsActual({ scenario, input }))
    } catch (err) {
      setError(err.message || 'No se pudo ejecutar la comparacion')
    } finally {
      setLoading(false)
    }
  }

  const dataQuality = result?.data_quality
  const missingFields = dataQuality?.missing_fields || []
  const warnings = dataQuality?.warnings || []
  const displayStatus = result?.status || 'pending'

  return (
    <ToolPage
      tool={tool}
      scenario={scenario}
      scenarios={COMPARE_SCENARIOS}
      loading={loading}
      error={error}
      response={response}
      onScenario={selectScenario}
      onRun={run}
      onReset={() => selectScenario(scenario)}
      metrics={(
        <>
          <Metric label="Estado" value={STATUS_LABELS[displayStatus] || 'Pendiente'} tone={toneForStatus(displayStatus)} />
          <Metric label="Desviacion max." value={formatPercent(visual.deviationPercent)} hint="Peor brecha adversa" tone={toneForStatus(visual.status)} />
          <Metric label="Desviacion ponderada" value={formatPercent(visual.weightedDeviationPercent)} hint="Promedio ponderado" />
          <Metric label="Calidad de datos" value={result ? dataQuality?.confidence || 'N/D' : 'pendiente'} hint={`${missingFields.length} faltantes · ${warnings.length} avisos`} tone={result ? missingFields.length ? 'danger' : warnings.length ? 'warn' : 'ok' : 'default'} />
        </>
      )}
    >
      <div className="tool-grid">
        <div className="stack">
          <Panel title="Datos de comparacion" subtitle="Captura editable de la tool">
            <div className="form-grid">
              <Field label="organization_id" required>
                <Input value={input.organization_id || ''} onChange={event => setField(setInput, 'organization_id', event.target.value)} />
              </Field>
              <Field label="analysis_id" required>
                <Input value={input.analysis_id || ''} onChange={event => setField(setInput, 'analysis_id', event.target.value)} />
              </Field>
              <Field label="plant_id" required>
                <Input value={input.plant_id || ''} onChange={event => setField(setInput, 'plant_id', event.target.value)} />
              </Field>
              <Field label="as_of_date" required>
                <Input type="datetime-local" value={datetimeLocal(input.as_of_date)} onChange={event => setField(setInput, 'as_of_date', fromDatetimeLocal(event.target.value))} />
              </Field>
              <Field label="period">
                <select className="input" value={input.period || ''} onChange={event => setField(setInput, 'period', event.target.value)}>
                  <option value="">N/D</option>
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                  <option value="monthly">monthly</option>
                </select>
              </Field>
              <Field label="umbrales">
                <div className="inline-fields">
                  <Input type="number" value={numberValue(input.thresholds?.deviation_percent)} onChange={event => setNestedNumber(setInput, ['thresholds', 'deviation_percent'], event.target.value)} aria-label="deviation_percent" />
                  <Input type="number" value={numberValue(input.thresholds?.critical_percent)} onChange={event => setNestedNumber(setInput, ['thresholds', 'critical_percent'], event.target.value)} aria-label="critical_percent" />
                </div>
              </Field>
            </div>
          </Panel>

          <Panel
            title="Metricas plan vs real"
            subtitle="planned, actual, direction y weight se envian al handler"
            actions={<Button onClick={() => addMetric(setInput)}> <Plus size={14} /> Agregar</Button>}
          >
            <MetricsEditor metrics={input.metrics || []} setInput={setInput} evaluated={result?.details?.metrics || []} />
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

function TrackPage ({ tool }) {
  const [scenario, setScenario] = useState(tool.defaultScenario)
  const [input, setInput] = useState(() => scenarioInput(tool.id, tool.defaultScenario))
  const [response, setResponse] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const result = response?.result
  const visual = useMemo(() => deriveProjectVisualModel(input, result), [input, result])
  const summary = result?.milestone_summary || {}

  function selectScenario (nextScenario) {
    setScenario(nextScenario)
    setInput(scenarioInput(tool.id, nextScenario))
    setResponse(null)
    setError('')
  }

  async function run () {
    setLoading(true)
    setError('')
    try {
      setResponse(await runTrackProjectProgress({ scenario, input }))
    } catch (err) {
      setError(err.message || 'No se pudo evaluar el avance')
    } finally {
      setLoading(false)
    }
  }

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
      scenario={scenario}
      scenarios={TRACK_SCENARIOS}
      loading={loading}
      error={error}
      response={response}
      onScenario={selectScenario}
      onRun={run}
      onReset={() => selectScenario(scenario)}
      metrics={(
        <>
          <Metric label="Estado" value={STATUS_LABELS[displayStatus] || 'Pendiente'} tone={toneForStatus(displayStatus)} />
          <Metric label="Avance plan / real" value={`${formatPercent(visual.plannedProgress)} / ${formatPercent(visual.actualProgress)}`} />
          <Metric label="Hitos abiertos" value={`${overdueCount} vencidos`} hint={`${criticalOverdueCount} criticos · ${blockedCount} bloqueados`} tone={(overdueCount || blockedCount) ? 'warn' : 'ok'} />
          <Metric label="Presupuesto usado" value={formatPercent(visual.budgetUsedPercent)} hint={`Brecha ${formatPercent(visual.scheduleVariancePercent)}`} tone={toneForStatus(visual.status)} />
        </>
      )}
    >
      <div className="tool-grid">
        <div className="stack">
          <Panel title="Datos del proyecto" subtitle="Entrada propia de track_project_progress">
            <div className="form-grid">
              <Field label="organization_id" required>
                <Input value={input.organization_id || ''} onChange={event => setField(setInput, 'organization_id', event.target.value)} />
              </Field>
              <Field label="project_id" required>
                <Input value={input.project_id || ''} onChange={event => setField(setInput, 'project_id', event.target.value)} />
              </Field>
              <Field label="project_name" required>
                <Input value={input.project_name || ''} onChange={event => setField(setInput, 'project_name', event.target.value)} />
              </Field>
              <Field label="as_of_date" required>
                <Input type="datetime-local" value={datetimeLocal(input.as_of_date)} onChange={event => setField(setInput, 'as_of_date', fromDatetimeLocal(event.target.value))} />
              </Field>
              <Field label="planned_start_date" required>
                <Input type="date" value={dateOnly(input.planned_start_date)} onChange={event => setField(setInput, 'planned_start_date', event.target.value)} />
              </Field>
              <Field label="planned_end_date" required>
                <Input type="date" value={dateOnly(input.planned_end_date)} onChange={event => setField(setInput, 'planned_end_date', event.target.value)} />
              </Field>
            </div>
          </Panel>

          <Panel title="Avance y presupuesto" subtitle="Se compara avance real contra plan y presupuesto ejercido">
            <div className="form-grid">
              <Field label="planned_progress_percent" required>
                <Input type="number" value={numberValue(input.planned_progress_percent)} onChange={event => setNumber(setInput, 'planned_progress_percent', event.target.value)} />
              </Field>
              <Field label="actual_progress_percent" required>
                <Input type="number" value={numberValue(input.actual_progress_percent)} onChange={event => setNumber(setInput, 'actual_progress_percent', event.target.value)} />
              </Field>
              <Field label="budget.planned_amount">
                <Input type="number" value={numberValue(input.budget?.planned_amount)} onChange={event => setNestedNumber(setInput, ['budget', 'planned_amount'], event.target.value)} />
              </Field>
              <Field label="budget.actual_amount">
                <Input type="number" value={numberValue(input.budget?.actual_amount)} onChange={event => setNestedNumber(setInput, ['budget', 'actual_amount'], event.target.value)} />
              </Field>
            </div>
            <ProgressPair planned={input.planned_progress_percent} actual={input.actual_progress_percent} budget={visual.budgetUsedPercent} />
          </Panel>

          <Panel
            title="Hitos"
            subtitle="Vencidos, criticos y bloqueados elevan el estado"
            actions={<Button onClick={() => addMilestone(setInput)}><Plus size={14} /> Agregar</Button>}
          >
            <MilestonesEditor milestones={input.milestones || []} setInput={setInput} />
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

function ToolPage ({ tool, scenario, scenarios, loading, error, metrics, response, onScenario, onRun, onReset, children }) {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={tool.eyebrow}
        title={tool.label}
        description={tool.description}
        actions={(
          <>
            <Button onClick={onReset}><RotateCcw size={14} /> Restaurar</Button>
            <Button variant="primary" loading={loading} onClick={onRun}>
              <Play size={14} />
              {tool.action}
            </Button>
          </>
        )}
      />

      <section className="scenario-row" aria-label="Escenarios">
        {scenarios.map(([id, label]) => (
          <Button className={scenario === id ? 'selected' : ''} key={id} onClick={() => onScenario(id)}>
            {label}
          </Button>
        ))}
      </section>

      {error ? <ErrorState title="No se pudo ejecutar la tool" detail={error} /> : null}

      <section className="metrics-grid">
        {metrics}
      </section>

      {children}

      {!response && !loading ? (
        <EmptyState title="Sin ejecucion en esta sesion" detail="Ajusta la captura o usa un escenario y ejecuta la accion primaria." />
      ) : null}
    </div>
  )
}

function ResultColumn ({ tool, result, response, loading, missingFields, warnings, risks = [] }) {
  const emitted = response?.emitted_event
  const downstream = response?.downstream_impact

  return (
    <aside className="stack">
      <Panel title="Estado y evento esperado" subtitle="Preview server-side; no publica por si solo">
        {loading ? <Loading label="Ejecutando tool" /> : null}
        {!loading ? (
          <div className="status-stack">
            <StatusChip status={STATUS_LABELS[result?.status] || 'Pendiente'} tone={toneForStatus(result?.status)} />
            <div className="event-card">
              <span>Evento esperado</span>
              <Mono>{tool.event}</Mono>
              <Badge tone={emitted ? 'ok' : 'neutral'}>{emitted ? 'preparado' : 'sin emitir'}</Badge>
            </div>
            {tool.id === 'track_project_progress' ? (
              <div className="event-card">
                <span>Impacto hacia automate_followups</span>
                <Mono>{downstream?.applies ? 'aplica' : 'no aplica'}</Mono>
                <p>Solo aplica cuando el estado es <Mono>at_risk</Mono>.</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Panel>

      <Panel title="Calidad de datos">
        <DataQuality pending={!response && !loading} missingFields={missingFields} warnings={warnings} />
      </Panel>

      {risks.length ? (
        <Panel title="Lectura de riesgo">
          <div className="chip-list">
            {risks.map(risk => <Badge tone={risk === 'sin_riesgo_abierto' ? 'ok' : 'warn'} key={risk}>{RISK_LABELS[risk] || risk}</Badge>)}
          </div>
        </Panel>
      ) : null}

      <Panel title="Acciones recomendadas">
        <ActionList actions={result?.recommended_actions || []} />
      </Panel>

      <Panel title="Payload y resultado">
        <pre className="json-preview">{JSON.stringify(response ? {
          input: response.input,
          result: response.result,
          emitted_event: response.emitted_event
        } : { pending: true }, null, 2)}</pre>
      </Panel>
    </aside>
  )
}

function MetricsEditor ({ metrics, setInput, evaluated }) {
  return (
    <Table
      rows={metrics}
      getRowKey={(row, index) => `${row.metric_id || 'metric'}-${index}`}
      empty={<EmptyState title="Sin metricas" detail="Agrega al menos una metrica para calcular la comparacion." />}
      columns={[
        {
          key: 'metric',
          header: 'metric_id',
          render: (row, index) => <Input value={row.metric_id || ''} onChange={event => updateMetric(setInput, index, 'metric_id', event.target.value)} />
        },
        {
          key: 'planned',
          header: 'planned',
          render: (row, index) => <Input type="number" value={numberValue(row.planned)} onChange={event => updateMetricNumber(setInput, index, 'planned', event.target.value)} />
        },
        {
          key: 'actual',
          header: 'actual',
          render: (row, index) => <Input type="number" value={numberValue(row.actual)} onChange={event => updateMetricNumber(setInput, index, 'actual', event.target.value)} />
        },
        {
          key: 'direction',
          header: 'direction',
          render: (row, index) => (
            <select className="input" value={row.direction || 'target'} onChange={event => updateMetric(setInput, index, 'direction', event.target.value)}>
              <option value="higher_is_better">higher_is_better</option>
              <option value="lower_is_better">lower_is_better</option>
              <option value="target">target</option>
            </select>
          )
        },
        {
          key: 'status',
          header: 'estado',
          render: (row, index) => <StatusChip status={STATUS_LABELS[evaluated[index]?.status] || 'Pendiente'} tone={toneForStatus(evaluated[index]?.status)} />
        }
      ]}
    />
  )
}

function MilestonesEditor ({ milestones, setInput }) {
  return (
    <Table
      rows={milestones}
      getRowKey={(row, index) => `${row.milestone_id || 'milestone'}-${index}`}
      empty={<EmptyState title="Sin hitos" detail="La tool puede evaluar avance sin hitos, pero la lectura de riesgo sera menos completa." />}
      columns={[
        {
          key: 'name',
          header: 'hito',
          render: (row, index) => <Input value={row.name || ''} onChange={event => updateMilestone(setInput, index, 'name', event.target.value)} />
        },
        {
          key: 'due',
          header: 'due_date',
          render: (row, index) => <Input type="date" value={dateOnly(row.due_date)} onChange={event => updateMilestone(setInput, index, 'due_date', event.target.value)} />
        },
        {
          key: 'status',
          header: 'status',
          render: (row, index) => (
            <select className="input" value={row.status || 'pending'} onChange={event => updateMilestone(setInput, index, 'status', event.target.value)}>
              <option value="pending">pending</option>
              <option value="completed">completed</option>
              <option value="blocked">blocked</option>
            </select>
          )
        },
        {
          key: 'critical',
          header: 'critical',
          render: (row, index) => (
            <label className="checkbox-field">
              <input type="checkbox" checked={row.critical === true} onChange={event => updateMilestone(setInput, index, 'critical', event.target.checked)} />
              <span>{row.critical ? 'si' : 'no'}</span>
            </label>
          )
        }
      ]}
    />
  )
}

function DataQuality ({ pending, missingFields, warnings }) {
  if (pending) {
    return <EmptyState title="Pendiente de ejecucion" detail="La calidad de datos se confirma al ejecutar la tool." />
  }

  if (!missingFields.length && !warnings.length) {
    return <EmptyState title="Sin hallazgos de calidad" detail="La captura actual no reporta faltantes ni avisos." />
  }

  return (
    <div className="quality-list">
      {missingFields.map(field => (
        <div className="quality-row danger" key={`missing-${field}`}>
          <Badge tone="danger">faltante</Badge>
          <Mono>{field}</Mono>
        </div>
      ))}
      {warnings.map(warning => (
        <div className="quality-row warn" key={`warning-${warning}`}>
          <Badge tone="warn">aviso</Badge>
          <Mono>{warning}</Mono>
        </div>
      ))}
    </div>
  )
}

function ActionList ({ actions }) {
  if (!actions.length) return <EmptyState title="Sin acciones" detail="Ejecuta la tool para obtener recomendaciones." />
  return (
    <div className="action-list">
      {actions.map(action => (
        <div className="action-row" key={action}>
          <span>{ACTION_LABELS[action] || action}</span>
          <Mono>{action}</Mono>
        </div>
      ))}
    </div>
  )
}

function ProgressPair ({ planned, actual, budget }) {
  return (
    <div className="progress-stack">
      <ProgressBar label="planned_progress_percent" value={planned} tone="info" />
      <ProgressBar label="actual_progress_percent" value={actual} tone="ok" />
      <ProgressBar label="budget_used_percent" value={budget} tone="warn" />
    </div>
  )
}

function ProgressBar ({ label, value, tone }) {
  const width = clampPercent(value)
  return (
    <div className={`progress-row tone-${tone}`}>
      <div>
        <Mono>{label}</Mono>
        <Mono>{formatPercent(value)}</Mono>
      </div>
      <span><i style={{ width: `${width}%` }} /></span>
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
        metric_id: `KPI-${(current.metrics || []).length + 1}`,
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
        milestone_id: `MS-${(current.milestones || []).length + 1}`,
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
  return typeof value === 'number' && Number.isFinite(value) ? `${value}%` : 'N/D'
}

function dateOnly (value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function datetimeLocal (value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

function fromDatetimeLocal (value) {
  return value ? new Date(value).toISOString() : ''
}

function clampPercent (value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, number))
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
