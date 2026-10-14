const fiDate = new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' })
const fiDateTime = new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

export function formatDate(value?: string | null, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : fiDate.format(date)
}

export function formatDateTime(value?: string | null, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : fiDateTime.format(date)
}

export function formatHours(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '0 h'
  return `${value.toLocaleString('fi-FI', { maximumFractionDigits: 2 })} h`
}

export function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function greeting(now = new Date()) {
  const hour = now.getHours()
  if (hour < 11) return 'Hyvää huomenta'
  if (hour < 17) return 'Hyvää päivää'
  return 'Hyvää iltaa'
}

export function isToday(value?: string | null) {
  if (!value) return false
  return value.slice(0, 10) === localDateKey()
}

export function isOverdue(value?: string | null) {
  if (!value) return false
  return value.slice(0, 10) < localDateKey()
}
