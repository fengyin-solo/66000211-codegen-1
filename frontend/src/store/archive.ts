import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  ArchiveEntry,
  JobItem,
  LearningArchive,
  RecordKind,
  ResilientJob,
} from '../types'
import {
  loadArchives,
  saveArchives,
  loadSettings,
  saveSettings,
  selectEntries,
  groupByMonth,
  mergeIntoArchives,
  expiredArchives,
  monthOf,
  formatDateTime,
  uid,
} from '../utils/records'
import type { ArchiveSettings } from '../utils/records'
import { useBrailleStore } from './braille'

/** 每个写入单元之间留出一点间隔，让进度可见（纯前端本地写入本身很快） */
const ITEM_DELAY_MS = 120

export const useArchiveStore = defineStore('archive', () => {
  const braille = useBrailleStore()

  const archives = ref<LearningArchive[]>(loadArchives())
  const settings = ref<ArchiveSettings>(loadSettings())

  /** 进行中或最近一次导出/归档任务；导出失败重试期间保留已完成内容 */
  const job = ref<ResilientJob | null>(null)
  /** 导出任务各单元已生成的内容，按 item.key 存放，失败重来时不重算已完成单元 */
  const exportChunks = new Map<string, string>()

  /** 清理预览：确认前只列出将被删除的条目，不动档案 */
  const cleanupPreview = ref<LearningArchive[] | null>(null)

  const busy = computed(() => job.value?.status === 'running')

  function updateSettings(patch: Partial<ArchiveSettings>) {
    settings.value = { ...settings.value, ...patch }
    saveSettings(settings.value)
  }

  /** 根据勾选项与时间范围选出全部条目 */
  function pickEntries(kinds: RecordKind[], from?: number, to?: number): ArchiveEntry[] {
    return selectEntries(braille.quizRecords, braille.encodeRecords, { kinds, from, to })
  }

  // ---------- 导出 / 归档：可重试任务 ----------

  function startJob(mode: ResilientJob['mode'], entries: ArchiveEntry[]): ResilientJob {
    const groups = groupByMonth(entries)
    const items: JobItem[] = []
    if (mode === 'archive') {
      for (const [month, list] of groups) {
        items.push({
          key: month,
          label: `档案 ${month}`,
          status: 'pending',
          attempts: 0,
          entryIds: list.map(e => e.id),
        })
      }
    } else {
      // 导出也按月切成独立写入单元，某月失败不影响其它月份
      for (const [month, list] of groups) {
        items.push({
          key: month,
          label: `${month} 数据`,
          status: 'pending',
          attempts: 0,
          entryIds: list.map(e => e.id),
        })
      }
    }
    job.value = {
      id: uid(),
      mode,
      startedAt: Date.now(),
      status: 'running',
      items,
    }
    exportChunks.clear()
    runPending()
    return job.value
  }

  async function runPending() {
    if (!job.value) return
    const current = job.value
    for (const item of current.items) {
      if (item.status !== 'pending') continue
      item.attempts++
      await delay(ITEM_DELAY_MS)
      // 任务可能在等待期间被放弃
      if (job.value?.id !== current.id) return
      try {
        if (current.mode === 'archive') await writeArchiveItem(item)
        else await writeExportItem(item)
        item.status = 'done'
      } catch (err) {
        item.status = 'failed'
        item.error = err instanceof Error ? err.message : String(err)
      }
      refreshJobStatus(current)
    }
  }

  /** 只重试失败的单元；已写好的单元与条目保持不动 */
  function retryFailed() {
    if (!job.value || busy.value) return
    for (const item of job.value.items) {
      if (item.status === 'failed') item.status = 'pending'
    }
    job.value.status = 'running'
    runPending()
  }

  function dismissJob() {
    if (busy.value) return
    job.value = null
    exportChunks.clear()
  }

  function refreshJobStatus(current: ResilientJob) {
    const hasPending = current.items.some(i => i.status === 'pending')
    const hasFailed = current.items.some(i => i.status === 'failed')
    // 仍有未处理单元时保持 running，挡住重复操作
    if (hasPending) current.status = 'running'
    else if (hasFailed) current.status = 'partial'
    else current.status = 'done'
    if (current.status === 'running') current.finishedAt = undefined
    else if (!current.finishedAt) current.finishedAt = Date.now()
  }

  /**
   * 归档一个月份单元：先在副本上完成合并并尝试整体写盘，
   * 写盘成功后才替换内存中的档案清单——写失败时旧档案原封不动、可读。
   */
  async function writeArchiveItem(item: JobItem): Promise<void> {
    const entries = entriesForItem(item)
    await delay(0)
    maybeSimulateFailure(item)
    const groups = groupByMonth(entries)
    const { next } = mergeIntoArchives(archives.value, groups, Date.now())
    saveArchives(next) // 抛错（如配额不足）则本单元失败，状态不更新
    archives.value = next
  }

  /** 导出一个月份单元：内容先暂存在内存，全部单元成功后才组装文件下载 */
  async function writeExportItem(item: JobItem): Promise<void> {
    if (exportChunks.has(item.key)) return
    const entries = entriesForItem(item)
    await delay(0)
    maybeSimulateFailure(item)
    let json: string
    try {
      json = JSON.stringify(entries, null, 2)
    } catch (err) {
      throw new Error(`条目无法序列化：${err instanceof Error ? err.message : String(err)}`)
    }
    exportChunks.set(item.key, json)
  }

  function entriesForItem(item: JobItem): ArchiveEntry[] {
    const wanted = new Set(item.entryIds)
    return pickEntries(['quiz', 'encode']).filter(e => wanted.has(e.id) && monthOf(e.at) === item.key)
  }

  function maybeSimulateFailure(item: JobItem) {
    if (!settings.value.simulateFailures) return
    // 确定性地让部分单元在首次写入时失败，便于演示“列出失败条目并重试”；
    // 重试（attempts > 1）放行，保证已写入内容保留、失败项可以补上
    if (item.attempts > 1) return
    const seed = [...item.key].reduce((s, c) => s + c.charCodeAt(0), 0)
    if (seed % 2 === 0) {
      throw new Error('模拟写入失败（演示开关）')
    }
  }

  /** 导出全部成功后组装档案文件并触发下载 */
  function finalizeExport(): void {
    if (!job.value || job.value.mode !== 'export' || busy.value) return
    const allEntries: ArchiveEntry[] = []
    const months: string[] = []
    for (const item of job.value.items) {
      if (item.status !== 'done') return
      months.push(item.key)
      const chunk = exportChunks.get(item.key)
      if (chunk) allEntries.push(...(JSON.parse(chunk) as ArchiveEntry[]))
    }
    if (!allEntries.length) return
    allEntries.sort((a, b) => a.at - b.at)
    const times = allEntries.map(e => e.at)
    const payload = {
      kind: 'braille-learning-profile',
      exportedAt: formatDateTime(Date.now()),
      timeRange: {
        from: formatDateTime(Math.min(...times)),
        to: formatDateTime(Math.max(...times)),
      },
      counts: {
        total: allEntries.length,
        quiz: allEntries.filter(e => e.kind === 'quiz').length,
        encode: allEntries.filter(e => e.kind === 'encode').length,
      },
      months: months.sort(),
      entries: allEntries,
    }
    const filename = `learning-profile-${months.sort().join('_')}.json`
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const a = document.createElement('a')
    const url = URL.createObjectURL(blob)
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // ---------- 保留期清理 ----------

  const expired = computed(() =>
    expiredArchives(archives.value, Date.now(), settings.value.retentionMonths),
  )

  /** 列出将被删除的档案与条目，等待用户确认；取消则什么都不改 */
  function requestCleanup() {
    cleanupPreview.value = expired.value.map(a => ({ ...a, entries: [...a.entries] }))
  }

  function cancelCleanup() {
    cleanupPreview.value = null
  }

  /** 确认清理：删除确认清单中的月份；失败时保留未删部分并返回错误信息 */
  function confirmCleanup(): string | null {
    if (!cleanupPreview.value) return null
    const removeMonths = new Set(cleanupPreview.value.map(a => a.month))
    const next = archives.value.filter(a => !removeMonths.has(a.month))
    try {
      saveArchives(next)
      archives.value = next
      cleanupPreview.value = null
      return null
    } catch (err) {
      cleanupPreview.value = null
      return err instanceof Error ? err.message : String(err)
    }
  }

  function archiveCountOf(month: string): number {
    return archives.value.find(a => a.month === month)?.entries.length ?? 0
  }

  return {
    archives,
    settings,
    job,
    busy,
    cleanupPreview,
    expired,
    updateSettings,
    pickEntries,
    startJob,
    retryFailed,
    dismissJob,
    finalizeExport,
    requestCleanup,
    cancelCleanup,
    confirmCleanup,
    archiveCountOf,
  }
})

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
