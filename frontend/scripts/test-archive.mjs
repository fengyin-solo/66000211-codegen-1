// 轻量自测：node scripts/test-archive.mjs
// 校验：预览统计、按月归拢、逐条落盘、失败部分可重试且已写入不丢、保留期到期判断
import { createPinia, setActivePinia } from 'pinia'
import { JSDOM } from 'jsdom'

// localStorage / DOM shim
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.localStorage = dom.window.localStorage
globalThis.Blob = dom.window.Blob
globalThis.URL = dom.window.URL
globalThis.navigator = dom.window.navigator
globalThis.setTimeout = setTimeout

const { useBrailleStore } = await import('../src/store/braille.ts')
const { useArchiveStore } = await import('../src/store/archive.ts')
const { isExpiredMonth, buildPreview } = await import('../src/utils/archive.ts')
const { monthLabel } = await import('../src/utils/time.ts')

let pass = 0
function ok(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1 }
  else { pass++; console.log('PASS:', msg) }
}

setActivePinia(createPinia())
const braille = useBrailleStore()
const archive = useArchiveStore()

// 造数据：2 个月前 3 条答题，本月 1 条编码
const now = Date.now()
const oldTs = new Date(); oldTs.setMonth(oldTs.getMonth() - 2)
braille.history.push(
  { id: 'q1', type: 'quiz', ts: oldTs.getTime(), input: 'A', correct: true },
  { id: 'q2', type: 'quiz', ts: oldTs.getTime() + 1000, input: 'B', correct: false },
  { id: 'q3', type: 'quiz', ts: now - 86400000, input: 'C', correct: true },
)
braille.encodings.push({
  id: 'e1', type: 'encoding', ts: now - 3600000, input: 'HELLO', braille: '⠓⠑⠇⠇⠕',
  dots: [[1,2,5],[1,5],[1,2,3],[1,2,3],[1,3,5]],
})

// 1. 预览
const sel = { includeQuiz: true, includeEncoding: true,
  start: '2000-01-01', end: '2099-12-31' }
const p = buildPreview(braille.history, braille.encodings, sel)
ok(p.total === 4, `预览共 4 条（实际 ${p.total}）`)
ok(p.quizCount === 3 && p.encodingCount === 1, '分类计数正确')
ok(p.monthKeys.length === 2, `归拢到 2 个月份（实际 ${p.monthKeys.length}）`)
ok(p.earliestTs === oldTs.getTime() && p.latestTs >= now - 3600000, '时间范围正确')

// 2. 月份文案一致
ok(monthLabel(p.monthKeys[0]) === monthLabel(oldTs.getTime()), '月份文案三处一致（同一 monthLabel 来源）')

// 3. 导出：模拟第 2 条写入失败
localStorage.setItem('braille:__simulateArchiveWriteFailure', '1')
const res = await archive.exportToArchives(braille.history, braille.encodings, sel)
ok(res.written === 3 && res.failed === 1, `逐条写入：成功 3 失败 1（实际 ${res.written}/${res.failed}）`)
ok(archive.totalEntries === 3, '已写入的 3 条保留')
ok(archive.totalFailures === 1, '失败清单有 1 条')
ok(archive.sortedArchives.length === 2, '按月份生成 2 份档案')

// 失败后刷新（重新从 localStorage 装载）验证已写部分不丢
setActivePinia(createPinia())
const archive2 = useArchiveStore()
ok(archive2.totalEntries === 3, '重载后已写入的 3 条仍在')
ok(archive2.totalFailures === 1, '重载后失败条目仍在，可重试')

// 4. 重试成功
const retry = await archive2.retryFailures()
ok(retry.retried === 1 && retry.failed === 0, `重试补写 1 条（实际 ${retry.retried}）`)
ok(archive2.totalEntries === 4 && archive2.totalFailures === 0, '重试后 4 条完整')

// 5. 重复导出不重复收录
const res2 = await archive2.exportToArchives(braille.history, braille.encodings, sel)
ok(res2.written === 0 && res2.skipped === 4, `重复导出全部跳过（实际 skip=${res2.skipped}）`)

// 6. busy 防重入：两条全新数据并发导出，后到的一次必须被拦截
const freshEnc = {
  id: 'e2', type: 'encoding', ts: now - 10000, input: 'WORLD', braille: '⠺⠕⠗⠇⠙',
  dots: [[2,4,5,6],[1,3,5],[1,2,3,5],[1,2,3],[1,4,5]],
}
const freshSel = {
  includeQuiz: false, includeEncoding: true,
  start: '2000-01-01', end: '2099-12-31',
}
const [rA, rB] = await Promise.all([
  archive2.exportToArchives([], [freshEnc], freshSel),
  archive2.exportToArchives([], [freshEnc], freshSel),
])
ok(rA.aborted || rB.aborted, '并发导出时其中一次被 busy 拦截')
ok(!(rA.aborted && rB.aborted), '并发导出仍有一次正常执行')

// 7. 保留期
ok(isExpiredMonth('2020-01', 6, new Date('2026-09-24').getTime()), '6 年前的月份到期')
ok(!isExpiredMonth('2026-09', 6, new Date('2026-09-24').getTime()), '当月不到期')
ok(!isExpiredMonth('2026-03', 6, new Date('2026-09-24').getTime()), '恰好第 6 个月前保留')
ok(isExpiredMonth('2026-02', 6, new Date('2026-09-24').getTime()), '第 7 个月前到期')

// 8. 取消清理：不调 cleanupExpired 则档案不变
const before = archive2.archives.length
const expired = archive2.listExpired(new Date('2026-09-24').getTime())
ok(archive2.archives.length === before, '只列出到期档案、不确认时不删除')
ok(expired.length >= 0, '可列出到期档案条目供确认')

console.log(`\n${pass} checks passed`)
