export interface BrailleChar {
  char: string
  dots: number[]  // 1-6 active dots
  unicode: string
}

export type LearnMode = 'charToBraille' | 'brailleToChar' | 'dictation'

/** 学习记录来源：答题（训练模式）或编码（翻译模式） */
export type RecordKind = 'quiz' | 'encode'

/** 一条答题记录 */
export interface QuizRecord {
  id: string
  /** 题目字符 */
  char: string
  /** 用户给出的点阵 */
  dots: number[]
  correct: boolean
  /** 发生时间（毫秒时间戳） */
  at: number
}

/** 一条编码记录（翻译模式中输入文本 -> 盲文） */
export interface EncodeRecord {
  id: string
  text: string
  /** 每个字符对应的点阵 */
  cells: number[][]
  at: number
}

/** 归档内统一存放的条目 */
export interface ArchiveEntry {
  id: string
  kind: RecordKind
  at: number
  payload: QuizRecord | EncodeRecord
}

/** 本地保存的月度档案 */
export interface LearningArchive {
  id: string
  /** 归档归属月份，格式 YYYY-MM */
  month: string
  createdAt: number
  updatedAt: number
  entries: ArchiveEntry[]
}

/** 导出/归档任务中一个可单独重试的写入单元 */
export interface JobItem {
  key: string
  /** 展示名称（如：答题 3 条、档案 2026-08） */
  label: string
  status: 'pending' | 'done' | 'failed'
  /** 已尝试写入的次数 */
  attempts: number
  /** 该单元包含的条目 id */
  entryIds: string[]
  error?: string
}

export type JobMode = 'archive' | 'export'
export type JobStatus = 'running' | 'partial' | 'done'

export interface ResilientJob {
  id: string
  mode: JobMode
  startedAt: number
  finishedAt?: number
  status: JobStatus
  items: JobItem[]
}
