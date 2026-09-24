import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  ArchiveRecord, ArchiveEntryData, ArchiveFailure,
  ArchiveSelection, ExportResult, QuizRecord, EncodingRecord,
} from '../types'
import { loadJSON, saveJSON } from '../utils/storage'
import { monthKey, monthLabel } from '../utils/time'
import {
  buildPreview, ensureArchiveForMonth, expiredArchives, archiveStatus,
  serializeArchive, serializeArchiveBundle,
} from '../utils/archive'

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

export const useArchiveStore = defineStore('archive', () => {
  // 档案列表本地保存
  const archives = ref<ArchiveRecord[]>(loadJSON<ArchiveRecord[]>('archives', []))
  const retentionMonths = ref<number>(loadJSON<number>('retentionMonths', 6))
  // 进行中标志：挡住重复点击（导出/重试/清理共用）
  const busy = ref(false)
  const busyAction = ref('')
  // 最近一次操作结果，用于提示哪些条目没写进去
  const lastResult = ref<ExportResult | null>(null)
  const lastMessage = ref('')

  const sortedArchives = computed(() =>
    [...archives.value].sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1)),
  )

  const totalEntries = computed(() =>
    archives.value.reduce((sum, a) => sum + a.entries.length, 0))

  const totalFailures = computed(() =>
    archives.value.reduce((sum, a) => sum + a.failures.length, 0))

  function persist() {
    saveJSON('archives', archives.value)
  }

  function setRetention(n: number) {
    retentionMonths.value = n
    saveJSON('retentionMonths', n)
  }

  /** 导出前预览：勾选内容下的条目数、时间范围、涉及月份 */
  function preview(quiz: QuizRecord[], encodings: EncodingRecord[], sel: ArchiveSelection) {
    return buildPreview(quiz, encodings, sel)
  }

  /**
   * 按月份归档：逐条写入，每写一条就持久化。
   * 中途某条失败（如存储不足）只记录该条失败，已写入的条目保留，
   * 调用方可通过 retryFailures 重试未写入的条目。
   */
  async function exportToArchives(
    quiz: QuizRecord[],
    encodings: EncodingRecord[],
    sel: ArchiveSelection,
  ): Promise<ExportResult> {
    if (busy.value) return { aborted: true, written: 0, failed: 0, skipped: 0 }
    const p = buildPreview(quiz, encodings, sel)
    if (!p.total) {
      const empty: ExportResult = { empty: true, written: 0, failed: 0, skipped: 0 }
      lastResult.value = empty
      lastMessage.value = '所选范围内没有可导出的条目'
      return empty
    }

    busy.value = true
    busyAction.value = 'export'
    let written = 0
    let failed = 0
    let skipped = 0

    try {
      // 按月份归拢，逐月建/取档案
      const byMonth = new Map<string, ArchiveEntryData[]>()
      for (const e of p.entries) {
        const m = monthKey(e.ts)
        if (!byMonth.has(m)) byMonth.set(m, [])
        byMonth.get(m)!.push(e)
      }

      for (const month of [...byMonth.keys()].sort()) {
        const { record } = ensureArchiveForMonth(archives.value, month, Date.now())
        for (const entry of byMonth.get(month)!) {
          // 同一条记录重复导出时不重复收录
          if (record.entries.some(e => e.id === entry.id) ||
              record.failures.some(f => f.entryId === entry.id)) {
            skipped++
            continue
          }
          try {
            record.entries.push(entry)
            record.updatedAt = Date.now()
            persist() // 逐条落盘：失败时前面的条目已经保存
            written++
          } catch (err) {
            record.entries.pop()
            const failure: ArchiveFailure = {
              entryId: entry.id,
              kind: entry.kind,
              ts: entry.ts,
              label: entry.label,
              reason: err instanceof Error ? err.message : String(err),
              data: entry,
            }
            record.failures.push(failure)
            record.updatedAt = Date.now()
            try { persist() } catch { /* 失败清单也写不进去时，本次结果里仍有记录 */ }
            failed++
          }
          await tick() // 让出主线程，保证 UI 能显示进度并拦截重复点击
        }
      }

      const result: ExportResult = {
        monthKeys: [...byMonth.keys()].sort(),
        written, failed, skipped,
      }
      lastResult.value = result
      lastMessage.value = failed
        ? `已写入 ${written} 条，${failed} 条未写入，可重试；跳过 ${skipped} 条已存在条目`
        : `归档完成：写入 ${written} 条${skipped ? `，跳过 ${skipped} 条已存在条目` : ''}`
      return result
    } finally {
      busy.value = false
      busyAction.value = ''
    }
  }

  /** 重试指定月份（或全部）档案里没写进去的条目，已写好的部分不动 */
  async function retryFailures(archiveId?: string): Promise<{ retried: number; failed: number }> {
    if (busy.value) return { retried: 0, failed: 0 }
    busy.value = true
    busyAction.value = archiveId ? `retry:${archiveId}` : 'retry-all'
    let retried = 0
    let stillFailed = 0
    try {
      const targets = archiveId
        ? archives.value.filter(a => a.id === archiveId)
        : archives.value
      for (const record of targets) {
        const pending = [...record.failures]
        for (const f of pending) {
          // 源记录可能已被删除：数据保存在 failure.data 里，仍可补写
          if (record.entries.some(e => e.id === f.data.id)) {
            record.failures = record.failures.filter(x => x.entryId !== f.entryId)
            try { persist() } catch { /* ignore */ }
            retried++
            continue
          }
          try {
            record.entries.push(f.data)
            record.failures = record.failures.filter(x => x.entryId !== f.entryId)
            record.updatedAt = Date.now()
            persist()
            retried++
          } catch (err) {
            // 落盘失败：撤回内存里的改动，保留失败条目（更新原因）以便再次重试，已写好的其它条目不动
            record.entries.pop()
            const existing = record.failures.find(x => x.entryId === f.entryId)
            if (existing) existing.reason = err instanceof Error ? err.message : String(err)
            else record.failures.push({ ...f, reason: err instanceof Error ? err.message : String(err) })
            stillFailed++
          }
          await tick()
        }
      }
      lastResult.value = {
        ...(lastResult.value || { written: 0, failed: 0, skipped: 0 }),
        written: retried,
        failed: totalFailures.value,
      }
      lastMessage.value = stillFailed
        ? `重试写入 ${retried} 条，仍有 ${stillFailed} 条未写入`
        : `重试成功，补写 ${retried} 条`
      return { retried, failed: stillFailed }
    } finally {
      busy.value = false
      busyAction.value = ''
    }
  }

  /** 下载单月档案（离线留存） */
  function downloadArchive(id: string) {
    const a = archives.value.find(x => x.id === id)
    if (!a) return
    const blob = new Blob([serializeArchive(a)], { type: 'application/json' })
    triggerDownload(blob, `学习档案-${a.monthKey}.json`)
  }

  /** 下载全部档案的合并文件 */
  function downloadAll() {
    if (!archives.value.length) return
    const blob = new Blob([serializeArchiveBundle(sortedArchives.value)], { type: 'application/json' })
    triggerDownload(blob, `学习档案-全部-${new Date().toISOString().slice(0, 10)}.json`)
  }

  function triggerDownload(blob: Blob, name: string) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  /** 超过保留期的档案，供清理前确认使用（不做任何修改） */
  function listExpired(now: number = Date.now()) {
    return expiredArchives(archives.value, retentionMonths.value, now)
  }

  /**
   * 清理超过保留期的档案。必须由 UI 在列出条目并取得用户确认后调用；
   * 用户取消则不会调用本方法，原档案保持可读。
   */
  async function cleanupExpired(ids: string[]): Promise<number> {
    if (busy.value) return 0
    busy.value = true
    busyAction.value = 'cleanup'
    try {
      const idSet = new Set(ids)
      const before = archives.value.length
      archives.value = archives.value.filter(a => !idSet.has(a.id))
      persist()
      const removed = before - archives.value.length
      lastMessage.value = `已清理 ${removed} 份过期档案`
      return removed
    } finally {
      busy.value = false
      busyAction.value = ''
    }
  }

  return {
    archives, sortedArchives, retentionMonths, busy, busyAction,
    lastResult, lastMessage, totalEntries, totalFailures,
    setRetention, preview, exportToArchives, retryFailures,
    downloadArchive, downloadAll, listExpired, cleanupExpired,
    archiveStatusOf: archiveStatus, monthLabelOf: monthLabel,
  }
})
