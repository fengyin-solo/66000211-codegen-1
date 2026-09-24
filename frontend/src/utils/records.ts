import type {
  ArchiveEntry,
  EncodeRecord,
  QuizRecord,
  RecordKind,
  LearningArchive,
} from '../types'

/** 本地存储的 key（答题、编码、档案清单三处各自独立、带版本） */
const QUIZ_KEY = 'braille.quizRecords.v1'
const ENCODE_KEY = 'braille.encodeRecords.v1'
const ARCHIVE_KEY = 'braille.learningArchives.v1'
const SETTINGS_KEY = 'braille.archiveSettings.v1'

export const MAX_QUIZ_RECORDS = 1000
export const MAX_ENCODE_RECORDS = 500

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 安全读取本地 JSON；读不到或损坏时返回 fallback，不抛错 */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** 写入本地 JSON；配额不足等失败会抛出，由调用方按“单条写入失败”处理 */
export function writeJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export function loadQuizRecords(): QuizRecord[] {
  const list = readJSON<unknown[]>(QUIZ_KEY, [])
  return Array.isArray(list) ? (list as QuizRecord[]) : []
}

export function loadEncodeRecords(): EncodeRecord[] {
  const list = readJSON<unknown[]>(ENCODE_KEY, [])
  return Array.isArray(list) ? (list as EncodeRecord[]) : []
}

export function loadArchives(): LearningArchive[] {
  const list = readJSON<unknown[]>(ARCHIVE_KEY, [])
  return Array.isArray(list) ? (list as LearningArchive[]) : []
}

export function saveQuizRecords(list: QuizRecord[]): void {
  writeJSON(QUIZ_KEY, list.slice(0, MAX_QUIZ_RECORDS))
}

export function saveEncodeRecords(list: EncodeRecord[]): void {
  writeJSON(ENCODE_KEY, list.slice(0, MAX_ENCODE_RECORDS))
}

/** 写入档案清单：单条档案写入失败时由调用方捕获并保留旧清单 */
export function saveArchives(list: LearningArchive[]): void {
  writeJSON(ARCHIVE_KEY, list)
}

export interface ArchiveSettings {
  /** 档案保留月数，超过的月份会被列入清理 */
  retentionMonths: number
  /** 仅用于演示“写入失败可重试”的开关，默认关闭 */
  simulateFailures: boolean
}

export function loadSettings(): ArchiveSettings {
  const s = readJSON<Partial<ArchiveSettings>>(SETTINGS_KEY, {})
  return {
    retentionMonths:
      typeof s.retentionMonths === 'number' && s.retentionMonths >= 1
        ? Math.floor(s.retentionMonths)
        : 6,
    simulateFailures: s.simulateFailures === true,
  }
}

export function saveSettings(s: ArchiveSettings): void {
  writeJSON(SETTINGS_KEY, s)
}

/** 返回时间戳所属月份，格式 YYYY-MM（本地时区） */
export function monthOf(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  return `${y}-${m}`
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-')
  return `${y} 年 ${Number(m)} 月`
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 选择记录时的过滤条件 */
export interface RecordFilter {
  kinds: RecordKind[]
  /** 起始时间（含），不传则不限制 */
  from?: number
  /** 结束时间（含），不传则不限制 */
  to?: number
}

/** 把两类原始记录统一成档案条目，时间从新到旧 */
export function selectEntries(
  quiz: QuizRecord[],
  encodes: EncodeRecord[],
  filter: RecordFilter,
): ArchiveEntry[] {
  const entries: ArchiveEntry[] = []
  if (filter.kinds.includes('quiz')) {
    for (const r of quiz) {
      if (inRange(r.at, filter.from, filter.to)) {
        entries.push({ id: r.id, kind: 'quiz', at: r.at, payload: r })
      }
    }
  }
  if (filter.kinds.includes('encode')) {
    for (const r of encodes) {
      if (inRange(r.at, filter.from, filter.to)) {
        entries.push({ id: r.id, kind: 'encode', at: r.at, payload: r })
      }
    }
  }
  return entries.sort((a, b) => a.at - b.at)
}

function inRange(ts: number, from?: number, to?: number): boolean {
  if (typeof from === 'number' && ts < from) return false
  if (typeof to === 'number' && ts > to) return false
  return true
}

/** 按月归拢条目：月份从新到旧，月内条目时间从旧到新 */
export function groupByMonth(entries: ArchiveEntry[]): Map<string, ArchiveEntry[]> {
  const map = new Map<string, ArchiveEntry[]>()
  for (const e of entries) {
    const m = monthOf(e.at)
    const bucket = map.get(m)
    if (bucket) bucket.push(e)
    else map.set(m, [e])
  }
  return new Map([...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)))
}

/**
 * 保留期对应 的最早保留月份（含）。
 * 以“当前月为第 1 个月”计算：retentionMonths=6 时保留当前月及之前共 6 个月。
 */
export function retentionCutoffMonth(now: number, retentionMonths: number): string {
  const d = new Date(now)
  d.setDate(1)
  d.setMonth(d.getMonth() - (retentionMonths - 1))
  return monthOf(d.getTime())
}

/** 找出超过保留期的档案（月份早于 cutoff），按月份从旧到新 */
export function expiredArchives(
  archives: LearningArchive[],
  now: number,
  retentionMonths: number,
): LearningArchive[] {
  const cutoff = retentionCutoffMonth(now, retentionMonths)
  return archives
    .filter(a => a.month < cutoff)
    .sort((a, b) => (a.month < b.month ? -1 : 1))
}

/** 把条目并入档案清单：相同月份归拢，按条目 id 去重，已有的不重复计入 */
export function mergeIntoArchives(
  archives: LearningArchive[],
  groups: Map<string, ArchiveEntry[]>,
  now: number,
): { next: LearningArchive[]; touchedMonths: Set<string> } {
  const next = archives.map(a => ({ ...a, entries: [...a.entries] }))
  const touchedMonths = new Set<string>()
  for (const [month, entries] of groups) {
    touchedMonths.add(month)
    let archive = next.find(a => a.month === month)
    if (!archive) {
      archive = {
        id: uid(),
        month,
        createdAt: now,
        updatedAt: now,
        entries: [],
      }
      next.push(archive)
    }
    const known = new Set(archive.entries.map(e => e.id))
    for (const e of entries) {
      if (!known.has(e.id)) {
        archive.entries.push(e)
        known.add(e.id)
      }
    }
    archive.entries.sort((a, b) => a.at - b.at)
    archive.updatedAt = now
  }
  next.sort((a, b) => (a.month < b.month ? 1 : -1))
  return { next, touchedMonths }
}

/** 浏览器端下载文本文件 */
export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const a = document.createElement('a')
  const url = URL.createObjectURL(blob)
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 从条目里取一行展示摘要 */
export function entrySummary(e: ArchiveEntry): string {
  if (e.kind === 'quiz') {
    const p = e.payload as QuizRecord
    return `答题 ${p.char}（${p.correct ? '正确' : '错误'}）`
  }
  const p = e.payload as EncodeRecord
  const text = p.text.length > 20 ? `${p.text.slice(0, 20)}…` : p.text
  return `编码 “${text}”`
}
