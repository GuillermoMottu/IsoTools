const FIELD_NAMES = { organization_id: 'Organización', analysis_id: 'Referencia del análisis', plant_id: 'Planta', as_of_date: 'Fecha de corte', period: 'Periodo', metrics: 'Indicadores', project_id: 'Referencia del proyecto', project_name: 'Nombre del proyecto', planned_start_date: 'Inicio planificado', planned_end_date: 'Fin planificado', planned_progress_percent: 'Avance planificado', actual_progress_percent: 'Avance real' }
export function fieldName (field) {
  if (FIELD_NAMES[field]) return FIELD_NAMES[field]
  const nested = /^(metrics|milestones)\[(\d+)\](?:\.(.+))?$/.exec(field)
  if (nested) return `${nested[1] === 'metrics' ? 'Indicador' : 'Hito'} ${Number(nested[2]) + 1}${nested[3] ? `: ${fieldName(nested[3])}` : ''}`
  const names = { metric_id: 'Referencia del indicador', milestone_id: 'Referencia del hito', name: 'Nombre', planned: 'Valor planificado', actual: 'Valor real', unit: 'Unidad', direction: 'Criterio de comparación', weight: 'Importancia del indicador', due_date: 'Fecha de compromiso', status: 'Estado', milestones: 'Hitos', budget: 'Presupuesto', 'thresholds.deviation_percent': 'Umbral de desviación', 'thresholds.critical_percent': 'Umbral crítico', 'thresholds.at_risk_delay_percent': 'Tolerancia de retraso', 'thresholds.delayed_percent': 'Umbral de atraso', 'thresholds.budget_overrun_vs_progress_percent': 'Tolerancia de gasto respecto al avance' }
  return names[field] || 'Dato por revisar'
}

export function confidenceLabel (value) {
  return { high: 'Alta', medium: 'Media', low: 'Baja' }[value] || 'No disponible'
}

const UNITS = { percent: '%', percentage: '%', units: 'unidades', items: 'unidades', hours: 'horas', days: 'días', minutes: 'minutos' }
export function unitLabel (value) { return UNITS[value] || value || 'sin unidad' }
export function unitCode (value) { return Object.entries(UNITS).find(([, label]) => label === value)?.[0] || value }

export function warningText (message) {
  const text = String(message)
  if (text.includes('must be less than or equal')) return 'El umbral de advertencia no puede superar el umbral crítico.'
  if (text.startsWith('thresholds.') && text.includes('must be')) return `${fieldName(text.split(' must')[0])}: introduce un número finito mayor o igual a cero.`
  if (text.startsWith('thresholds must')) return 'Revisa la configuración de las tolerancias.'
  if (text.startsWith('budget requires')) return 'El presupuesto planificado debe ser mayor que cero y el gasto debe ser un importe válido, mayor o igual a cero.'
  if (text.startsWith('weight must')) return 'La importancia del indicador debe ser mayor o igual a cero. Se utilizó el valor predeterminado de 1.'
  if (text.includes('total weight is zero')) return 'Asigna una importancia mayor que cero a al menos un indicador para calcular el promedio.'
  if (text.startsWith('planned and actual must')) return 'Los valores planificados y reales deben ser números válidos.'
  if (text.startsWith('invalid direction')) return 'Selecciona un criterio de comparación válido.'
  if (text.startsWith('planned is zero and actual is non-zero')) return 'La meta es cero y el resultado es distinto de cero; no se puede calcular la desviación porcentual.'
  if (text.startsWith('planned is zero;')) return 'La meta y el resultado son cero; el indicador se considera dentro del rango esperado.'
  const milestone = /^milestones\[(\d+)\]/.exec(text)
  if (milestone) return `Hito ${Number(milestone[1]) + 1}: revisa la referencia, el nombre, la fecha de compromiso y el estado.`
  if (text.startsWith('milestones must')) return 'Revisa la lista de hitos del proyecto.'
  if (text.startsWith('planned_start_date must be before')) return 'El inicio debe ser anterior al fin planificado.'
  const field = text.split(' must')[0]
  if (text.includes('must be between 0 and 100')) return `${fieldName(field)}: introduce un porcentaje entre 0 y 100.`
  if (text.includes('must be ISO 8601') || text.includes('must be a valid date')) return `${fieldName(field)}: introduce una fecha válida.`
  return 'Revisa los datos de la captura; uno de los valores requiere atención.'
}
export function fieldError (result, field) {
  if (result?.data_quality?.missing_fields?.includes(field)) return 'Completa este campo.'
  const warning = result?.data_quality?.warnings?.find(message => message.startsWith(`${field} must`))
  if (!warning) return ''
  if (field.includes('progress_percent')) return 'Introduce un avance entre 0 y 100%.'
  if (field === 'planned_start_date' && warning.includes('before')) return 'El inicio debe ser anterior al fin planificado.'
  return 'Revisa la fecha y completa un valor válido.'
}
export function explainResult (input, result) {
  if (!result) return []
  if (result.status === 'not_calculable') return ['No se pudo evaluar. Corrige los datos indicados; la evaluación se actualizará automáticamente.']
  if (result.details?.metrics) return result.details.metrics.map(metric => `${metric.name || metric.metric_id}: plan ${metric.planned} ${unitLabel(metric.unit)}, real ${metric.actual} ${unitLabel(metric.unit)}. Desviación desfavorable ${metric.adverse_percent == null ? 'no calculable' : `${metric.adverse_percent}%`}.`)
  const reasons = result.risk_reasons || []
  const lines = [`Avance real ${result.completionPercent}% frente a ${input.planned_progress_percent}% planificado: ${result.schedule_variance_percent} puntos porcentuales de brecha.`]
  if (reasons.includes('budget_overrun')) lines.push(`Presupuesto consumido ${result.budgetUsedPercent}% con avance real ${result.completionPercent}%.`)
  if (reasons.includes('critical_milestone_overdue') || reasons.includes('blocked_milestone')) {
    const cut = Date.parse(input.as_of_date)
    for (const milestone of input.milestones || []) {
      if (milestone.status === 'blocked') lines.push(`Hito bloqueado: ${milestone.name}.`)
      else if (milestone.critical && !['completed', 'cancelled'].includes(milestone.status) && Date.parse(milestone.due_date) < cut) lines.push(`Hito crítico vencido: ${milestone.name}, compromiso ${milestone.due_date.slice(0, 10)}.`)
    }
  }
  return lines
}

export function cellError (value, field, evaluated) {
  if (!evaluated || (field === 'weight' && (value === undefined || value === null || value === ''))) return ''
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return 'Completa este dato.'
  if (['planned', 'actual', 'weight'].includes(field) && (!Number.isFinite(Number(value)) || (field === 'weight' && Number(value) < 0))) return 'Introduce un número válido.'
  if (field === 'due_date' && Number.isNaN(Date.parse(value))) return 'Introduce una fecha válida.'
  return ''
}
