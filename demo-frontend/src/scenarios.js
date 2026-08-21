export const scenarioOptions = [
  {
    id: 'on_track',
    label: 'En rango',
    tone: 'success',
    summary: 'Resultados dentro de la tolerancia del periodo.'
  },
  {
    id: 'deviation',
    label: 'Desviacion',
    tone: 'warning',
    summary: 'Brechas moderadas contra las metas.'
  },
  {
    id: 'critical',
    label: 'Critico',
    tone: 'danger',
    summary: 'Brecha alta que exige accion correctiva.'
  },
  {
    id: 'at_risk',
    label: 'Proyecto en riesgo',
    tone: 'warning',
    summary: 'Riesgo por hito critico o presupuesto.'
  },
  {
    id: 'delayed',
    label: 'Proyecto atrasado',
    tone: 'danger',
    summary: 'Avance real muy por debajo del plan.'
  },
  {
    id: 'validation',
    label: 'Validacion',
    tone: 'neutral',
    summary: 'Captura incompleta para revisar errores.'
  }
]

const baseCompare = {
  organization_id: 'ORG-001',
  plant_id: 'Planta Norte',
  process_id: 'Linea de ensamble 1',
  analysis_id: 'AN-ISO-DEMO',
  as_of_date: '2026-07-23T12:00:00Z',
  domain: 'production',
  period: 'monthly',
  period_start: '2026-07-01',
  period_end: '2026-07-31',
  thresholds: {
    deviation_percent: 5,
    critical_percent: 15
  }
}

const baseProject = {
  organization_id: 'ORG-001',
  plant_id: 'Planta Norte',
  project_id: 'PRJ-ISO-9001',
  project_name: 'Implementacion ISO 9001 Planta Norte',
  as_of_date: '2026-07-23T12:00:00Z',
  planned_start_date: '2026-07-01T00:00:00Z',
  planned_end_date: '2026-09-30T00:00:00Z',
  planned_progress_percent: 30,
  actual_progress_percent: 28,
  target_type: 'Auditoria interna',
  target_ids: ['PRJ-ISO-9001'],
  thresholds: {
    at_risk_delay_percent: 5,
    delayed_percent: 15,
    budget_overrun_vs_progress_percent: 10
  },
  milestones: [
    {
      milestone_id: 'MS-001',
      name: 'Diagnostico inicial',
      due_date: '2026-07-15T00:00:00Z',
      completed_at: '2026-07-14T00:00:00Z',
      status: 'completed',
      critical: true
    }
  ],
  budget: {
    planned_amount: 100000,
    actual_amount: 28000,
    currency: 'MXN'
  }
}

const periodIndicators = [
  {
    metric_id: 'PRODUCTION',
    name: 'Produccion total',
    unit: 'units',
    direction: 'higher_is_better',
    weight: 1.1
  },
  {
    metric_id: 'FIRST_PASS',
    name: 'Calidad a primera pasada',
    unit: 'percent',
    direction: 'higher_is_better',
    weight: 1
  },
  {
    metric_id: 'DEFECT_RATE',
    name: 'Tasa de defectos',
    unit: 'percent',
    direction: 'lower_is_better',
    weight: 1
  },
  {
    metric_id: 'DELIVERY',
    name: 'Cumplimiento de entregas',
    unit: 'percent',
    direction: 'higher_is_better',
    weight: 1
  }
]

const scenarioMetrics = {
  on_track: [
    [1200, 1185],
    [96, 95],
    [2, 2.05],
    [98, 97]
  ],
  deviation: [
    [1200, 1120],
    [96, 92],
    [2, 2.22],
    [98, 93]
  ],
  critical: [
    [1200, 970],
    [96, 84],
    [2, 3],
    [98, 82]
  ],
  at_risk: [
    [1200, 1120],
    [96, 92],
    [2, 2.2],
    [98, 93]
  ],
  delayed: [
    [1200, 1040],
    [96, 88],
    [2, 2.7],
    [98, 84]
  ]
}

function metricsForScenario (scenarioId) {
  return periodIndicators.map((indicator, index) => ({
    ...indicator,
    planned: scenarioMetrics[scenarioId][index][0],
    actual: scenarioMetrics[scenarioId][index][1]
  }))
}

function milestone (milestoneId, name, dueDate, status, critical, completedAt) {
  const value = { milestone_id: milestoneId, name, due_date: dueDate, status, critical }
  if (completedAt) value.completed_at = completedAt
  return value
}

function clone (value) {
  return JSON.parse(JSON.stringify(value))
}

export function scenarioPayload (scenarioId) {
  const compare = clone(baseCompare)
  const project = clone(baseProject)

  if (scenarioId !== 'validation') {
    compare.analysis_id = `AN-${scenarioId.toUpperCase().replaceAll('_', '-')}`
    compare.metrics = metricsForScenario(scenarioId)
  }

  if (scenarioId === 'on_track') {
    project.milestones = [
      milestone('MS-001', 'Diagnostico inicial', '2026-07-15T00:00:00Z', 'completed', true, '2026-07-14T00:00:00Z'),
      milestone('MS-002', 'Mapa de procesos', '2026-08-01T00:00:00Z', 'pending', false)
    ]
  }

  if (scenarioId === 'deviation') {
    project.planned_progress_percent = 35
    project.actual_progress_percent = 32
    project.budget.actual_amount = 37000
  }

  if (scenarioId === 'critical') {
    project.planned_progress_percent = 42
    project.actual_progress_percent = 38
    project.budget.actual_amount = 51000
  }

  if (scenarioId === 'at_risk') {
    project.project_id = 'PRJ-RISK-002'
    project.target_ids = ['PRJ-RISK-002']
    project.planned_progress_percent = 40
    project.actual_progress_percent = 36
    project.budget.actual_amount = 50000
    project.milestones = [
      milestone('MS-030', 'Taller critico de recuperacion', '2026-07-15T00:00:00Z', 'pending', true)
    ]
  }

  if (scenarioId === 'delayed') {
    project.project_id = 'PRJ-DELAYED-003'
    project.target_ids = ['PRJ-DELAYED-003']
    project.planned_progress_percent = 60
    project.actual_progress_percent = 35
    project.budget.planned_amount = 160000
    project.budget.actual_amount = 92000
    project.milestones = [
      milestone('MS-040', 'Aprobacion de plan documental', '2026-07-12T00:00:00Z', 'pending', true),
      milestone('MS-041', 'Capacitacion de auditores', '2026-07-18T00:00:00Z', 'blocked', false)
    ]
  }

  if (scenarioId === 'validation') {
    return {
      compare: {
        module: 'production',
        period_start: '2026-07-01',
        period_end: '2026-07-31',
        plant_id: 'Planta Norte'
      },
      project: {
        organization_id: 'ORG-001',
        project_id: 'PRJ-MISSING-DATA'
      }
    }
  }

  return { compare, project }
}
