const STATUS_TONES = {
  on_track: 'success',
  deviation: 'warning',
  critical: 'danger',
  at_risk: 'warning',
  delayed: 'danger',
  not_calculable: 'neutral',
  pendiente: 'neutral'
}

const OPERATIONAL_RANK = {
  on_track: 0,
  deviation: 1,
  critical: 2,
  not_calculable: 3,
  pendiente: -1
}

const PROJECT_RANK = {
  on_track: 0,
  at_risk: 1,
  delayed: 2,
  not_calculable: 3,
  pendiente: -1
}

export function toneForStatus (status) {
  return STATUS_TONES[status] || 'neutral'
}

export function deriveOperationalVisualModel (compare = {}, result) {
  const thresholds = compare.thresholds || {}
  const deviationThreshold = numberOrDefault(thresholds.deviation_percent, 5)
  const criticalThreshold = numberOrDefault(thresholds.critical_percent, 15)
  const sourceMetrics = Array.isArray(compare.metrics) ? compare.metrics : []
  const resultMetrics = Array.isArray(result?.details?.metrics) ? result.details.metrics : []
  const metrics = sourceMetrics.map((metric, index) => {
    const evaluated = resultMetrics[index] || {}
    const planned = toFiniteNumber(metric.planned)
    const actual = toFiniteNumber(metric.actual)
    const direction = metric.direction || 'target'
    const variancePercent = toFiniteNumber(evaluated.variance_percent) ?? calculateVariancePercent(planned, actual)
    const adversePercent = toFiniteNumber(evaluated.adverse_percent) ?? calculateAdversePercent(planned, actual, direction)
    const status = evaluated.status || classifyOperational(adversePercent, deviationThreshold, criticalThreshold)
    const tone = toneForStatus(status)

    return {
      id: metric.metric_id || `metric-${index + 1}`,
      name: metric.name || `Indicador ${index + 1}`,
      planned,
      actual,
      unit: metric.unit || '',
      direction,
      status,
      tone,
      variancePercent,
      adversePercent,
      variationWidth: scaleDeviation(adversePercent, criticalThreshold),
      impactText: operationalImpactText(metric.name, status, adversePercent, direction),
      radarActualScore: radarScore(planned, actual, direction)
    }
  })

  const worstLocalStatus = worstStatus(metrics.map(metric => metric.status), OPERATIONAL_RANK, 'pendiente')
  const status = result?.status || worstLocalStatus
  const inRange = metrics.filter(metric => metric.status === 'on_track').length
  const calculable = metrics.filter(metric => metric.status !== 'not_calculable').length
  const compliancePercent = metrics.length > 0 ? round((inRange / metrics.length) * 100) : null
  const deviationPercent = toFiniteNumber(result?.deviation_percent) ?? maxMetricValue(metrics, 'adversePercent')
  const weightedDeviationPercent = toFiniteNumber(result?.weighted_deviation_percent) ?? averageMetricValue(metrics, 'adversePercent')

  return {
    status,
    severity: result?.severity || severityForOperational(status),
    tone: toneForStatus(status),
    thresholds: {
      deviation: deviationThreshold,
      critical: criticalThreshold
    },
    metrics,
    compliance: {
      inRange,
      total: metrics.length,
      calculable,
      percent: compliancePercent
    },
    deviationPercent,
    weightedDeviationPercent,
    outOfRange: Math.max(0, metrics.length - inRange),
    radar: metrics.map(metric => ({
      label: shortMetricLabel(metric.name),
      planned: 100,
      actual: metric.radarActualScore
    }))
  }
}

export function deriveProjectVisualModel (project = {}, result) {
  const plannedProgress = toFiniteNumber(project.planned_progress_percent)
  const actualProgress = toFiniteNumber(result?.completionPercent) ?? toFiniteNumber(project.actual_progress_percent)
  const budgetUsedPercent = toFiniteNumber(result?.budgetUsedPercent) ?? calculateBudgetUsedPercent(project.budget)
  const scheduleVariancePercent = toFiniteNumber(result?.schedule_variance_percent) ?? positiveDifference(plannedProgress, actualProgress)
  const timelineElapsedPercent = toFiniteNumber(result?.timeline_elapsed_percent) ?? calculateTimelineElapsedPercent(project)
  const status = result?.status || classifyProject(scheduleVariancePercent)
  const milestones = deriveMilestones(project)
  const risks = Array.isArray(result?.risk_reasons) && result.risk_reasons.length > 0
    ? result.risk_reasons
    : deriveProjectRisks(scheduleVariancePercent, actualProgress, budgetUsedPercent, milestones)

  return {
    status,
    severity: result?.severity || severityForProject(status),
    tone: toneForStatus(status),
    plannedProgress,
    actualProgress,
    budgetUsedPercent,
    scheduleVariancePercent,
    timelineElapsedPercent,
    spi: ratio(actualProgress, plannedProgress),
    cpi: ratio(actualProgress, budgetUsedPercent),
    estimatedFinish: estimateFinish(project, actualProgress),
    milestones,
    calendar: buildMilestoneCalendar(project, milestones),
    risks
  }
}

function toFiniteNumber (value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function numberOrDefault (value, fallback) {
  const number = toFiniteNumber(value)
  return number === null ? fallback : number
}

function round (value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : value
}

function clamp (value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function positiveDifference (left, right) {
  if (left === null || right === null) return null
  return round(Math.max(0, left - right))
}

function ratio (numerator, denominator) {
  if (numerator === null || denominator === null || denominator <= 0) return null
  return round(numerator / denominator)
}

function calculateVariancePercent (planned, actual) {
  if (planned === null || actual === null || planned === 0) return null
  return round(((actual - planned) / Math.abs(planned)) * 100)
}

function calculateAdversePercent (planned, actual, direction) {
  const signedPercent = calculateVariancePercent(planned, actual)
  if (signedPercent === null) return null
  if (direction === 'higher_is_better') return round(Math.max(0, -signedPercent))
  if (direction === 'lower_is_better') return round(Math.max(0, signedPercent))
  return round(Math.abs(signedPercent))
}

function classifyOperational (adversePercent, deviationThreshold, criticalThreshold) {
  if (adversePercent === null) return 'not_calculable'
  if (adversePercent <= deviationThreshold) return 'on_track'
  if (adversePercent <= criticalThreshold) return 'deviation'
  return 'critical'
}

function classifyProject (scheduleVariancePercent) {
  if (scheduleVariancePercent === null) return 'not_calculable'
  if (scheduleVariancePercent <= 5) return 'on_track'
  if (scheduleVariancePercent <= 15) return 'at_risk'
  return 'delayed'
}

function worstStatus (statuses, rank, fallback) {
  if (statuses.length === 0) return fallback
  return statuses.reduce((worst, status) => rank[status] > rank[worst] ? status : worst, fallback)
}

function severityForOperational (status) {
  if (status === 'critical') return 'high'
  if (status === 'deviation' || status === 'not_calculable') return 'medium'
  return 'low'
}

function severityForProject (status) {
  if (status === 'delayed') return 'high'
  if (status === 'at_risk' || status === 'not_calculable') return 'medium'
  return 'low'
}

function scaleDeviation (adversePercent, criticalThreshold) {
  if (adversePercent === null) return 0
  return clamp((Math.abs(adversePercent) / Math.max(criticalThreshold, 1)) * 100, 4, 100)
}

function radarScore (planned, actual, direction) {
  if (planned === null || actual === null || planned <= 0) return 0
  if (direction === 'lower_is_better') return clamp((planned / Math.max(actual, 0.001)) * 100, 0, 130)
  return clamp((actual / planned) * 100, 0, 130)
}

function maxMetricValue (metrics, key) {
  const values = metrics.map(metric => metric[key]).filter(value => typeof value === 'number')
  return values.length > 0 ? round(Math.max(...values)) : null
}

function averageMetricValue (metrics, key) {
  const values = metrics.map(metric => metric[key]).filter(value => typeof value === 'number')
  if (values.length === 0) return null
  return round(values.reduce((total, value) => total + value, 0) / values.length)
}

function shortMetricLabel (name = '') {
  const words = String(name).split(/\s+/).filter(Boolean)
  if (words.length <= 2) return name
  return words.slice(0, 2).join(' ')
}

function operationalImpactText (metricName = 'El indicador', status, adversePercent, direction) {
  if (status === 'not_calculable') return 'No hay datos suficientes para calcular la variacion.'
  if (status === 'on_track') return `${metricName} se mantiene dentro de tolerancia para el periodo.`
  const value = typeof adversePercent === 'number' ? `${adversePercent}%` : 'la meta'
  if (direction === 'lower_is_better') return `${metricName} esta por encima de lo esperado en ${value}; puede elevar costo, scrap o retrabajo.`
  if (direction === 'higher_is_better') return `${metricName} esta por debajo de lo esperado en ${value}; puede afectar cumplimiento del plan.`
  return `${metricName} se aleja de la meta en ${value}; requiere revision de causa.`
}

function calculateBudgetUsedPercent (budget = {}) {
  const planned = toFiniteNumber(budget.planned_amount)
  const actual = toFiniteNumber(budget.actual_amount)
  if (planned === null || actual === null || planned <= 0) return null
  return round((actual / planned) * 100)
}

function calculateTimelineElapsedPercent (project = {}) {
  const start = Date.parse(project.planned_start_date)
  const end = Date.parse(project.planned_end_date)
  const asOf = Date.parse(project.as_of_date)
  if ([start, end, asOf].some(Number.isNaN) || end <= start) return null
  return round(clamp(((asOf - start) / (end - start)) * 100, 0, 100))
}

function deriveProjectRisks (scheduleVariance, actualProgress, budgetUsed, milestones) {
  const risks = []
  if (scheduleVariance !== null && scheduleVariance > 5) risks.push('schedule_variance')
  if (budgetUsed !== null && actualProgress !== null && budgetUsed > actualProgress + 10) risks.push('budget_overrun')
  if (milestones.some(milestone => milestone.status === 'blocked')) risks.push('blocked_milestone')
  if (milestones.some(milestone => milestone.critical && milestone.isOverdue)) risks.push('critical_milestone_overdue')
  return risks.length > 0 ? risks : ['sin_riesgo_abierto']
}

function deriveMilestones (project = {}) {
  const start = Date.parse(project.planned_start_date)
  const end = Date.parse(project.planned_end_date)
  const asOf = Date.parse(project.as_of_date)
  const milestones = Array.isArray(project.milestones) ? project.milestones : []
  const sorted = [...milestones].sort((left, right) => Date.parse(left.due_date) - Date.parse(right.due_date))

  return sorted.map((milestone, index) => {
    const previousDue = index > 0 ? Date.parse(sorted[index - 1].due_date) : start
    const due = Date.parse(milestone.due_date)
    const completed = Date.parse(milestone.completed_at)
    const effectiveEnd = Number.isNaN(completed) ? due : completed
    const isOverdue = milestone.status !== 'completed' && !Number.isNaN(due) && !Number.isNaN(asOf) && due < asOf
    const tone = milestone.status === 'completed'
      ? 'success'
      : milestone.status === 'blocked' || isOverdue
        ? 'danger'
        : 'warning'

    return {
      id: milestone.milestone_id || `MS-${index + 1}`,
      name: milestone.name || `Hito ${index + 1}`,
      status: milestone.status || 'pending',
      critical: milestone.critical === true,
      dueDate: Number.isNaN(due) ? null : new Date(due),
      completedAt: Number.isNaN(completed) ? null : new Date(completed),
      startPercent: timelinePercent(previousDue, start, end),
      endPercent: timelinePercent(effectiveEnd, start, end),
      markerPercent: timelinePercent(due, start, end),
      isOverdue,
      tone
    }
  })
}

function timelinePercent (dateValue, start, end) {
  if ([dateValue, start, end].some(Number.isNaN) || end <= start) return 0
  return clamp(((dateValue - start) / (end - start)) * 100, 0, 100)
}

function estimateFinish (project = {}, actualProgress) {
  const start = Date.parse(project.planned_start_date)
  const plannedEnd = Date.parse(project.planned_end_date)
  const asOf = Date.parse(project.as_of_date)
  if ([start, plannedEnd, asOf].some(Number.isNaN) || actualProgress === null || actualProgress <= 0) {
    return { date: null, delayDays: null }
  }

  const elapsedMs = Math.max(0, asOf - start)
  const estimatedTotalMs = elapsedMs / (actualProgress / 100)
  const estimatedDate = new Date(start + estimatedTotalMs)
  const delayDays = Math.ceil((estimatedDate.getTime() - plannedEnd) / 86400000)
  return {
    date: estimatedDate,
    delayDays: Math.max(0, delayDays)
  }
}

function buildMilestoneCalendar (project = {}, milestones = []) {
  const anchor = new Date(project.as_of_date || project.planned_start_date || Date.now())
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leadingBlanks = firstDay.getDay()
  const days = []

  for (let index = 0; index < leadingBlanks; index += 1) {
    days.push({ key: `blank-${index}`, day: '', milestones: [] })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayMilestones = milestones.filter(milestone => {
      if (!milestone.dueDate) return false
      return milestone.dueDate.getFullYear() === year && milestone.dueDate.getMonth() === month && milestone.dueDate.getDate() === day
    })
    days.push({ key: `day-${day}`, day, milestones: dayMilestones })
  }

  return {
    label: new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(anchor),
    days
  }
}
