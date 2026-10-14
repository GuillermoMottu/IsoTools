export function projectFields (input) {
  const fields = {}
  const keys = [
    ['organization_id', 'organizationId'],
    ['project_id', 'projectId'],
    ['project_name', 'projectName'],
    ['as_of_date', 'asOfDate'],
    ['planned_start_date', 'plannedStartDate'],
    ['planned_end_date', 'plannedEndDate'],
    ['planned_progress_percent', 'plannedProgressPercent'],
    ['actual_progress_percent', 'actualProgressPercent'],
    ['target_type', 'targetType'],
    ['target_ids', 'targetIds']
  ]

  for (const [snakeKey, camelKey] of keys) {
    const value = (input[snakeKey] !== undefined ? input[snakeKey] : input[camelKey])
    if (value !== undefined) {
      fields[snakeKey] = value
      fields[camelKey] = value
    }
  }

  if (input.milestones !== undefined) fields.milestones = input.milestones
  if (input.budget !== undefined) fields.budget = input.budget
  if (input.thresholds !== undefined) fields.thresholds = input.thresholds
  if (input.source !== undefined) fields.source = input.source
  return fields
}
