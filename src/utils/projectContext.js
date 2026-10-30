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

// An explicit project registry supplies context; incoming facts retain precedence.
export function resolveProjectContext (input, config = {}) {
  const supplied = projectFields(input)
  const id = supplied.project_id
  if (config.projects === undefined || typeof id !== 'string' || !id.trim()) return { ...input, ...supplied }
  const projects = config.projects
  if (!projects || typeof projects !== 'object' || Array.isArray(projects)) throw new Error('invalid_project_context')
  if (!Object.hasOwn(projects, id)) return { ...input, ...supplied }
  const project = projects[id]
  if (!project || typeof project !== 'object' || Array.isArray(project)) throw new Error('invalid_project_context')
  const context = projectFields(project)
  if (context.project_id !== id) throw new Error('invalid_project_context')
  return { ...input, ...context, ...supplied, ...(project.test === true ? { test: true } : {}) }
}
