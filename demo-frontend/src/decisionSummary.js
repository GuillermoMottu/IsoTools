import { deriveProjectVisualModel } from './visualModels.js'

const priority = { critical: 3, deviation: 2, not_calculable: 1, on_track: 0 }
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null
export const decisionNumber = value => number(value) === null ? 'No disponible' : value.toLocaleString('es-MX', { maximumFractionDigits: 2 })

export function decisionDate (value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) || Number.isNaN(Date.parse(value))) return 'No disponible'
  return value.slice(0, 10).split('-').reverse().join('/')
}

export function comparisonDecision (result) {
  const metrics = [...(result?.details?.metrics || [])].sort((a, b) =>
    (priority[b.status] ?? 1) - (priority[a.status] ?? 1) || (number(b.adverse_percent) ?? -1) - (number(a.adverse_percent) ?? -1))
  const attention = metrics.filter(metric => ['deviation', 'critical'].includes(metric.status))
  const unavailable = metrics.filter(metric => metric.status === 'not_calculable')
  const values = metrics.map(metric => number(metric.adverse_percent)).filter(value => value !== null)
  const largest = values.length ? Math.max(...values) : null
  let headline = 'Preparando el resumen del análisis'
  if (result?.status === 'sin_meta') headline = 'Falta una meta para valorar el resultado'
  else if (result?.status === 'not_calculable') headline = 'Falta información para evaluar el desempeño'
  else if (result) {
    headline = attention.length
      ? `${attention.length} de ${metrics.length} indicadores ${attention.length === 1 ? 'requiere' : 'requieren'} atención`
      : metrics.length ? 'Los indicadores se mantienen dentro de tolerancia' : 'Sin indicadores evaluados'
  }
  return { metrics, attention, unavailable, largest, headline }
}

export function metricExplanation (metric) {
  if (metric.status === 'sin_meta') return 'No hay una meta aprobada para comparar este resultado.'
  if (metric.status === 'on_track') return 'Dentro de la tolerancia acordada.'
  if (!['critical', 'deviation'].includes(metric.status)) return 'Completa o confirma los datos antes de tomar una decisión.'
  if (metric.direction === 'lower_is_better') return 'El resultado supera el máximo esperado. Revisa las causas de la diferencia.'
  if (metric.direction === 'higher_is_better') return 'El resultado está por debajo de la meta. Revisa las causas de la diferencia.'
  return 'El resultado se aleja del objetivo. Revisa las causas de la diferencia.'
}

export function progressDifference (planned, actual) {
  if (number(planned) === null || number(actual) === null) return 'Sin avance comparable'
  const difference = Math.round((actual - planned) * 100) / 100
  if (difference === 0) return 'Al nivel del plan'
  return `${decisionNumber(Math.abs(difference))} puntos ${difference > 0 ? 'por delante' : 'por debajo'} del plan`
}

export function projectDecision (input, result) {
  const visual = deriveProjectVisualModel(input, result)
  const open = visual.milestones.filter(milestone => ['pending', 'blocked'].includes(milestone.status))
  const overdue = open.filter(milestone => milestone.isOverdue)
  const blocked = open.filter(milestone => milestone.status === 'blocked')
  const critical = overdue.filter(milestone => milestone.critical)
  const upcoming = [...open].filter(milestone => milestone.dueDate && !milestone.isOverdue)
    .sort((a, b) => a.dueDate - b.dueDate)[0] || null
  let headline = 'Preparando el resumen del proyecto'
  if (result?.status === 'not_calculable') headline = 'Falta información para evaluar el proyecto'
  else if (result?.status === 'on_track') headline = 'El proyecto se mantiene dentro de las tolerancias'
  else if (result) {
    headline = critical.length
      ? 'Hay compromisos críticos vencidos'
      : blocked.length
        ? 'Hay compromisos bloqueados que requieren atención'
        : result.risk_reasons?.includes('budget_overrun')
          ? 'El gasto requiere revisión frente al avance'
          : 'El proyecto requiere atención para recuperar el plan'
  }
  return { visual, open, overdue, blocked, critical, upcoming, headline }
}

export function decisionAmount (value, currency) {
  if (number(value) === null) return 'No disponible'
  if (!currency) return `${decisionNumber(value)} (moneda no indicada)`
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 2 }).format(value) } catch {
    return `${decisionNumber(value)} ${currency}`
  }
}

export function recordLabel (input, project) {
  if (project) return input.project_name || input.project_id
  const domain = { sales: 'Ventas', production: 'Producción' }[input.domain] || 'Análisis'
  const period = [input.period_start, input.period_end].filter(Boolean).map(decisionDate).join(' al ')
  return `${input.plant_name || input.plant_id || domain}${period ? ` · ${period}` : ''} · ${input.analysis_id}`
}
