// 时间工具：答题、编码、档案三处共用，保证显示的月份完全一致

/** 本地时区的 YYYY-MM-DD */
export function dateKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 月份归拢键，格式 YYYY-MM */
export function monthKey(ts: number): string {
  return dateKey(ts).slice(0, 7)
}

/** 统一的月份显示文案，如 2026年9月 */
export function monthLabel(keyOrTs: number | string): string {
  const key = typeof keyOrTs === 'number' ? monthKey(keyOrTs) : keyOrTs
  const [y, m] = key.split('-')
  return `${y}年${Number(m)}月`
}

/** YYYY-MM 的月份键按时间倒序（最近的月份在前） */
export function sortMonthKeys(keys: string[]): string[] {
  return [...new Set(keys)].sort((a, b) => (a < b ? 1 : -1))
}

export interface MonthGroup<T> {
  month: string
  items: T[]
}

/** 把带时间戳的记录按月份归拢，月份倒序、月内时间倒序 */
export function groupByMonth<T extends { ts: number }>(items: T[]): MonthGroup<T>[] {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const k = monthKey(it.ts)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(it)
  }
  return sortMonthKeys([...map.keys()]).map(month => ({
    month,
    items: map.get(month)!.sort((a, b) => b.ts - a.ts),
  }))
}

/** 完整日期时间，如 2026-09-24 14:03 */
export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  const hh = `${d.getHours()}`.padStart(2, '0')
  const mm = `${d.getMinutes()}`.padStart(2, '0')
  return `${dateKey(ts)} ${hh}:${mm}`
}

/** 一天的起点（本地时区 00:00:00 的毫秒时间戳） */
export function startOfDay(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
}

/** 一天的终点（本地时区 23:59:59.999） */
export function endOfDay(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
}

/** 从某个月份键偏移 n 个月（n 为负表示往前），返回 YYYY-MM */
export function shiftMonthKey(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`
}

/** 当前月份键 */
export function currentMonthKey(now: number = Date.now()): string {
  return monthKey(now)
}

/** 某月第一天 00:00 的时间戳 */
export function monthStart(key: string): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1, 0, 0, 0, 0).getTime()
}
