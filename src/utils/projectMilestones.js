export function completedMilestonePercent (milestones) {
  if (!Array.isArray(milestones) || milestones.some(item => !item || !['pending', 'completed', 'blocked', 'cancelled'].includes(item.status))) return null
  const active = milestones.filter(item => item.status !== 'cancelled')
  if (active.length === 0) return null
  return Math.round(active.filter(item => item.status === 'completed').length / active.length * 10000) / 100
}

export function isMilestoneOverdue (milestone, referenceDate) {
  if (['completed', 'cancelled'].includes(milestone.status)) return false
  const due = /^\d{4}-\d{2}-\d{2}$/.test(milestone.due_date) ? Date.parse(`${milestone.due_date}T23:59:59.999Z`) : Date.parse(milestone.due_date)
  const reference = Date.parse(referenceDate)
  return Number.isFinite(due) && Number.isFinite(reference) && due < reference
}
