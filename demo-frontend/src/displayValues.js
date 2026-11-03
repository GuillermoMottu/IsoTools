export function datetimeLocal (value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromDatetimeLocal (value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export async function healthResponseIsOnline (response) {
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false
  const body = await response.json().catch(() => null)
  return body?.status === 'ok' && ['isotools', 'isotools-tool'].includes(body.service)
}

// Both bars share one scale and a real zero, including negative amounts.
export function comparisonPlot (planned, actual) {
  if (![planned, actual].every(value => typeof value === 'number' && Number.isFinite(value))) return null
  const minimum = Math.min(0, planned, actual)
  const maximum = Math.max(0, planned, actual)
  const range = maximum - minimum
  if (!Number.isFinite(range)) return null
  const point = value => range ? ((value - minimum) / range) * 100 : 0
  const zero = point(0)
  const bar = value => ({ start: Math.min(zero, point(value)), width: Math.abs(point(value) - zero) })
  return { zero, planned: bar(planned), actual: bar(actual) }
}
