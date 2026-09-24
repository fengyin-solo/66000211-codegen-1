export interface BrailleChar {
  char: string
  dots: number[]  // 1-6 active dots
  unicode: string
}

export type LearnMode = 'charToBraille' | 'brailleToChar' | 'dictation'

/** 答题记录（训练模式每答一题产生一条） */
export interface QuizRecord {
  id: string
  type: 'quiz'
  ts: number
  input: string
  correct: boolean
}

/** 编码结果（翻译模式下用户主动保存的一次文本 → 盲文编码） */
export interface EncodingRecord {
  id: string
  type: 'encoding'
  ts: number
  input: string
  braille: string
  dots: number[][]
}

export type SourceRecord = QuizRecord | EncodingRecord

export type RecordKind = 'quiz' | 'encoding'

/** 写入档案的单条数据（答题记录或编码结果的归档快照） */
export interface ArchiveEntryData {
  id: string
  kind: RecordKind
  ts: number
  label: string
  quiz?: { input: string; correct: boolean }
  encoding?: { input: string; braille: string; dots: number[][] }
}

/** 写入失败的条目，保留原始数据以便重试 */
export interface ArchiveFailure {
  entryId: string
  kind: RecordKind
  ts: number
  label: string
  reason: string
  data: ArchiveEntryData
}

export type ArchiveStatus = 'complete' | 'partial'

/** 按月份归拢的一份档案 */
export interface ArchiveRecord {
  id: string
  monthKey: string // YYYY-MM
  createdAt: number
  updatedAt: number
  entries: ArchiveEntryData[]
  failures: ArchiveFailure[]
}

/** 导出前勾选的内容与时间范围 */
export interface ArchiveSelection {
  includeQuiz: boolean
  includeEncoding: boolean
  start: string // YYYY-MM-DD
  end: string   // YYYY-MM-DD
}

export interface ExportResult {
  empty?: boolean
  aborted?: boolean
  monthKeys?: string[]
  written: number
  failed: number
  skipped: number
}
