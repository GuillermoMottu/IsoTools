import { randomUUID } from 'node:crypto'
import {
  evaluatePlannedVsActual,
  meta as compareMeta
} from '../tools/compare_planned_vs_actual.js'
import {
  evaluateProjectProgress,
  meta as trackMeta
} from '../tools/track_project_progress.js'

const VALID_SCENARIOS = new Set(['on_track', 'deviation', 'critical', 'at_risk', 'delayed', 'validation'])

const COMPARE_ASSET = {
  asset_id: 'plant_01-assembly-line_1-production_line_01',
  asset_type: 'production_line',
  plant_id: 'plant_01'
}

const PROJECT_ASSET = {
  asset_id: 'plant_01-management-line_1-project_01',
  asset_type: 'project',
  plant_id: 'plant_01'
}

const BASE_COMPARE = {
  organization_id: 'ORG-001',
  tenant_id: 'TENANT-ISO',
  plant_id: 'plant_01',
  process_id: 'assembly-line_1',
  analysis_id: 'AN-ISO-DEMO',
  as_of_date: '2026-07-23T12:00:00Z',
  domain: 'production',
  period: 'monthly',
  period_start: '2026-07-01',
  period_end: '2026-07-31',
  thresholds: {
    deviation_percent: 5,
    critical_percent: 15
  },
  source: {
    source_system: 'demo-frontend',
    source_record_ids: ['prod-run-iso-001'],
    source_extracted_at: '2026-07-23T12:00:00Z'
  }
}

const BASE_PROJECT = {
  organization_id: 'ORG-001',
  tenant_id: 'TENANT-ISO',
  plant_id: 'plant_01',
  project_id: 'PRJ-ISO-9001',
  project_name: 'Implementacion ISO 9001 Planta Norte',
  as_of_date: '2026-07-23T12:00:00Z',
  planned_start_date: '2026-07-01T00:00:00Z',
  planned_end_date: '2026-09-30T00:00:00Z',
  planned_progress_percent: 30,
  actual_progress_percent: 28,
  target_type: 'order',
  target_ids: ['PRJ-ISO-9001'],
  thresholds: {
    at_risk_delay_percent: 5,
    delayed_percent: 15,
    budget_overrun_vs_progress_percent: 10
  },
  source: {
    source_system: 'demo-frontend',
    source_record_ids: ['project-iso-001'],
    source_extracted_at: '2026-07-23T12:00:00Z'
  }
}

const PERIOD_INDICATORS = [
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

const SCENARIO_METRICS = {
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

const SCENARIOS = {
  on_track: {
    compare: {
      ...BASE_COMPARE,
      analysis_id: 'AN-ON-TRACK',
      metrics: metricsForScenario('on_track')
    },
    project: {
      ...BASE_PROJECT,
      planned_progress_percent: 30,
      actual_progress_percent: 28,
      milestones: [
        milestone('MS-001', 'Diagnostico inicial', '2026-07-15T00:00:00Z', 'completed', true, '2026-07-14T00:00:00Z'),
        milestone('MS-002', 'Mapa de procesos', '2026-08-01T00:00:00Z', 'pending', false)
      ],
      budget: budget(100000, 28000)
    }
  },
  deviation: {
    compare: {
      ...BASE_COMPARE,
      analysis_id: 'AN-DEVIATION',
      metrics: metricsForScenario('deviation')
    },
    project: {
      ...BASE_PROJECT,
      planned_progress_percent: 35,
      actual_progress_percent: 32,
      milestones: [
        milestone('MS-010', 'Revision de indicadores', '2026-07-28T00:00:00Z', 'pending', false)
      ],
      budget: budget(120000, 37000)
    }
  },
  critical: {
    compare: {
      ...BASE_COMPARE,
      analysis_id: 'AN-CRITICAL',
      metrics: metricsForScenario('critical')
    },
    project: {
      ...BASE_PROJECT,
      planned_progress_percent: 42,
      actual_progress_percent: 38,
      milestones: [
        milestone('MS-020', 'Contencion de brecha operativa', '2026-08-03T00:00:00Z', 'pending', true)
      ],
      budget: budget(140000, 51000)
    }
  },
  at_risk: {
    compare: {
      ...BASE_COMPARE,
      analysis_id: 'AN-AT-RISK',
      metrics: metricsForScenario('at_risk')
    },
    project: {
      ...BASE_PROJECT,
      project_id: 'PRJ-RISK-002',
      target_ids: ['PRJ-RISK-002'],
      planned_progress_percent: 40,
      actual_progress_percent: 36,
      milestones: [
        milestone('MS-030', 'Taller critico de recuperacion', '2026-07-15T00:00:00Z', 'pending', true)
      ],
      budget: budget(100000, 50000)
    }
  },
  delayed: {
    compare: {
      ...BASE_COMPARE,
      analysis_id: 'AN-DELAYED',
      metrics: metricsForScenario('delayed')
    },
    project: {
      ...BASE_PROJECT,
      project_id: 'PRJ-DELAYED-003',
      target_ids: ['PRJ-DELAYED-003'],
      planned_progress_percent: 60,
      actual_progress_percent: 35,
      milestones: [
        milestone('MS-040', 'Aprobacion de plan documental', '2026-07-12T00:00:00Z', 'pending', true),
        milestone('MS-041', 'Capacitacion de auditores', '2026-07-18T00:00:00Z', 'blocked', false)
      ],
      budget: budget(160000, 92000)
    }
  },
  validation: {
    compare: {
      module: 'production',
      period_start: '2026-07-01',
      period_end: '2026-07-31',
      plant_id: 'plant_01'
    },
    project: {
      organization_id: 'ORG-001',
      project_id: 'PRJ-MISSING-DATA'
    }
  }
}

function metricsForScenario (scenarioId) {
  return PERIOD_INDICATORS.map((indicator, index) => ({
    ...indicator,
    planned: SCENARIO_METRICS[scenarioId][index][0],
    actual: SCENARIO_METRICS[scenarioId][index][1]
  }))
}

function metric (metricId, name, planned, actual, unit, direction, weight) {
  return { metric_id: metricId, name, planned, actual, unit, direction, weight }
}

function milestone (milestoneId, name, dueDate, status, critical, completedAt) {
  const item = {
    milestone_id: milestoneId,
    name,
    due_date: dueDate,
    status,
    critical
  }
  if (completedAt) item.completed_at = completedAt
  return item
}

function budget (plannedAmount, actualAmount, currency = 'MXN') {
  return { planned_amount: plannedAmount, actual_amount: actualAmount, currency }
}

function clone (value) {
  return JSON.parse(JSON.stringify(value))
}

function demoEvent (moduleId, asset, type, category, severity, data) {
  return {
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    platform_version: '1.0',
    module: { id: moduleId, version: '1.0.0' },
    asset,
    event: { type, category, severity },
    data,
    metadata: { source: 'compare-track-demo' }
  }
}

function emittedCompareEvent (asset, result) {
  return {
    event: {
      type: 'PRODUCTION_VARIANCE_DETECTED',
      category: compareMeta.category,
      severity: result.severity
    },
    asset,
    data: result
  }
}

function emittedProjectEvent (asset, result) {
  if (result.status === 'on_track' || result.status === 'not_calculable') return null
  return {
    event: {
      type: 'PROJECT_AT_RISK',
      category: trackMeta.category,
      severity: result.severity
    },
    asset,
    data: result
  }
}

function validationFor (toolId, result) {
  const quality = result?.data_quality || {}
  const messages = [
    ...(quality.missing_fields || []).map(field => ({ level: 'error', field, message: 'Campo requerido incompleto' })),
    ...(quality.warnings || []).map(message => ({ level: 'warning', field: null, message }))
  ]
  return messages.map(item => ({ tool: toolId, ...item }))
}

function scenarioDefaults (scenario) {
  const scenarioId = VALID_SCENARIOS.has(scenario) ? scenario : 'deviation'
  return {
    scenario: scenarioId,
    defaults: SCENARIOS[scenarioId]
  }
}

export function runComparePlannedVsActualTool (payload = {}) {
  const { scenario, defaults } = scenarioDefaults(payload.scenario)
  const compareData = clone(Object.hasOwn(payload, 'input') || Object.hasOwn(payload, 'compare') ? payload.input || payload.compare || {} : defaults.compare)

  const compareInputEvent = demoEvent(
    compareMeta.id,
    COMPARE_ASSET,
    'DEMO_COMPARE_REQUESTED',
    compareMeta.category,
    'low',
    compareData
  )
  const compareResult = evaluatePlannedVsActual(compareInputEvent)
  const compareEvent = emittedCompareEvent(compareInputEvent.asset, compareResult)

  return {
    status: 'ok',
    scenario,
    tool: compareMeta.id,
    input: compareData,
    result: compareResult,
    emitted_event: compareEvent,
    validation: validationFor(compareMeta.id, compareResult)
  }
}

export function runTrackProjectProgressTool (payload = {}) {
  const { scenario, defaults } = scenarioDefaults(payload.scenario)
  const projectData = clone(Object.hasOwn(payload, 'input') || Object.hasOwn(payload, 'project') ? payload.input || payload.project || {} : defaults.project)

  const projectInputEvent = demoEvent(
    'generate_kpis',
    PROJECT_ASSET,
    'KPI_REPORT_GENERATED',
    'system',
    'low',
    projectData
  )
  const projectResult = evaluateProjectProgress(projectInputEvent)
  const projectEvent = emittedProjectEvent(projectInputEvent.asset, projectResult)

  return {
    status: 'ok',
    scenario,
    tool: trackMeta.id,
    input: projectData,
    result: projectResult,
    emitted_event: projectEvent,
    downstream_impact: projectEvent
      ? {
          event: 'PROJECT_AT_RISK',
          next_tool: 'automate_followups',
          applies: projectResult.status === 'at_risk'
        }
      : {
          event: 'PROJECT_AT_RISK',
          next_tool: 'automate_followups',
          applies: false
        },
    validation: validationFor(trackMeta.id, projectResult)
  }
}
