// Accept finite numbers and decimal strings; never coerce booleans or containers.
export function isFiniteNumeric (value) {
  return (typeof value === 'number' || (typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) && Number.isFinite(Number(value))
}
