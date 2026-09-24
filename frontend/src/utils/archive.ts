import type {
  SourceRecord, QuizRecord, EncodingRecord,
  ArchiveEntryData, ArchiveSelection, ArchiveRecord,
} from '../types'
import { monthKey, startOfDay, endOfDay, shiftMonthKey, currentMonthKey, monthStart } from './time'

function quizToEntry(r: QuizRecord): ArchiveEntryData {
  return {
    id: r.id, kind: 'quiz', ts: r.ts,
    label: `答题「${r.input}」${r.correct ? '正确' : '错误'}`,
    quiz: { input: r.input, correct: r.correct },
  }
}

function encodingToEntry(r: EncodingRecord): ArchiveEntryData {
  return {
    id: r.id, kind: 'encoding', ts: r.ts,
    label: `编码「${r.input.length > 12 ? r.input.slice(0, 12) + '…' : r.input}」`,
    encoding: { input: r.input, braille: r.braille, dots: r.dots },
  }
}

export function recordToEntry(r: SourceRecord): ArchiveEntryData {
  return r.type === 'quiz' ? quizToEntry(r) : encodingToEntry(r)
}

export interface ArchivePreview {
  total: number
  quizCount: number
  encodingCount: number
  earliestTs: number | null
  latestTs: number | null
  monthKeys: string[]
  entries: ArchiveEntryData[]
}

/** 按勾选内容与时间范围筛选，并统计条目数、时间范围、涉及月份（导出前预览用） */
export function buildPreview(
  quiz: QuizRecord[],
  encodings: EncodingRecord[],
  sel: ArchiveSelection,
): ArchivePreview {
  const from = startOfDay(sel.start)
  const to = endOfDay(sel.end)
  const picked: ArchiveEntryData[] = []
  let quizCount = 0
  let encodingCount = 0
  if (sel.includeQuiz) {
    for (const r of quiz) {
      if (r.ts >= from && r.ts <= to) {
        picked.push(quizToEntry(r))
        quizCount++
      }
    }
  }
  if (sel.includeEncoding) {
    for (const r of encodings) {
      if (r.ts >= from && r.ts <= to) {
        picked.push(encodingToEntry(r))
        encodingCount++
      }
    }
  }
  picked.sort((a, b) => a.ts - b.ts)
  const months = new Set(picked.map(e => monthKey(e.ts)))
  return {
    total: picked.length,
    quizCount,
    encodingCount,
    earliestTs: picked.length ? picked[0].ts : null,
    latestTs: picked.length ? picked[picked.length - 1].ts : null,
    monthKeys: [...months].sort(),
    entries: picked,
  }
}

/** 找到某个月份对应的档案；没有则新建 */
export function ensureArchiveForMonth(
  archives: ArchiveRecord[], month: string, now: number,
): { record: ArchiveRecord; created: boolean } {
  const existing = archives.find(a => a.monthKey === month)
  if (existing) return { record: existing, created: false }
  const record: ArchiveRecord = {
    id: `arc-${month}-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    monthKey: month,
    createdAt: now,
    updatedAt: now,
    entries: [],
    failures: [],
  }
  archives.push(record)
  return { record, created: true }
}

/**
 * 超过保留期的月份判断。
 * 保留期 N 个月：当前月及之前 N 个月都保留，再往前的月份到期。
 * 例如 N=6，当前 2026-09，则保留 2026-03 ～ 2026-09，2026-02 及更早到期。
 */
export function isExpiredMonth(month: string, retentionMonths: number, now: number = Date.now()): boolean {
  const cutoff = shiftMonthKey(currentMonthKey(now), -retentionMonths)
  return monthStart(month) < monthStart(cutoff)
}

export function expiredArchives(archives: ArchiveRecord[], retentionMonths: number, now: number = Date.now()): ArchiveRecord[] {
  return archives
    .filter(a => isExpiredMonth(a.monthKey, retentionMonths, now))
    .sort((a, b) => (a.monthKey < b.monthKey ? -1 : 1))
}

export function archiveStatus(a: ArchiveRecord): 'complete' | 'partial' {
  return a.failures.length ? 'partial' : 'complete'
}

/** 离线留存档案的文件内容（JSON，自包含） */
export function serializeArchive(a: ArchiveRecord): string {
  return JSON.stringify({
    app: 'braille-learning-archive',
    version: 1,
    month: a.monthKey,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    entryCount: a.entries.length,
    failedCount: a.failures.length,
    entries: a.entries,
    failures: a.failures,
  }, null, 2)
}

/** 一次导出覆盖多个月份时的合并文件内容 */
export function serializeArchiveBundle(records: ArchiveRecord[]): string {
  return JSON.stringify({
    app: 'braille-learning-archive',
    version: 1,
    exportedAt: Date.now(),
    months: records.map(r => ({
      month: r.monthKey,
      entryCount: r.entries.length,
      failedCount: r.failures.length,
      entries: r.entries,
      failures: r.failures,
    })),
  }, null, 2)
}
