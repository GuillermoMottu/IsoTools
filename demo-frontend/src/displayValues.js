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
