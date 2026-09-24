import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { BRAILLE_MAP, textToBraille, brailleToText, dotsToUnicode } from '../utils/braille'
import type { LearnMode, EncodeRecord, QuizRecord } from '../types'
import {
  loadQuizRecords,
  loadEncodeRecords,
  saveQuizRecords,
  saveEncodeRecords,
  uid,
} from '../utils/records'

export const useBrailleStore = defineStore('braille', () => {
  const inputText = ref('')
  const brailleOutput = ref<number[][]>([])
  const learnMode = ref<LearnMode>('charToBraille')
  const quizChar = ref('')
  const selectedDots = ref<number[]>([])

  // 带时间戳、本地持久化的答题与编码记录（时间从新到旧）
  const quizRecords = ref<QuizRecord[]>(loadQuizRecords())
  const encodeRecords = ref<EncodeRecord[]>(loadEncodeRecords())

  const score = computed(() => ({
    correct: quizRecords.value.filter(r => r.correct).length,
    total: quizRecords.value.length,
  }))

  const brailleUnicode = computed(() =>
    brailleOutput.value.map(d => dotsToUnicode(d)).join('')
  )

  function translate() {
    brailleOutput.value = textToBraille(inputText.value)
    scheduleEncodeRecord()
  }

  function reverseTranslate() {
    // Simple: take selectedDots and find matching char
    return brailleToText(selectedDots.value)
  }

  function generateQuiz() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    quizChar.value = chars[Math.floor(Math.random() * chars.length)]
    selectedDots.value = []
  }

  function toggleDot(dot: number) {
    const idx = selectedDots.value.indexOf(dot)
    if (idx >= 0) selectedDots.value.splice(idx, 1)
    else selectedDots.value.push(dot)
  }

  function checkQuizAnswer() {
    const correct = JSON.stringify([...selectedDots.value].sort()) === JSON.stringify([...(BRAILLE_MAP[quizChar.value] || [])].sort())
    const record: QuizRecord = {
      id: uid(),
      char: quizChar.value,
      dots: [...selectedDots.value],
      correct,
      at: Date.now(),
    }
    quizRecords.value.unshift(record)
    saveQuizRecords(quizRecords.value)
    if (navigator.vibrate) navigator.vibrate(correct ? 100 : [100, 50, 100])
    generateQuiz()
  }

  function resetScore() {
    quizRecords.value = []
    saveQuizRecords(quizRecords.value)
  }

  // 编码结果在输入停顿后落一条记录；短时间内连续输入则合并到上一条
  let encodeTimer: ReturnType<typeof setTimeout> | null = null
  const ENCODE_DEBOUNCE_MS = 800
  const ENCODE_MERGE_MS = 10_000

  function scheduleEncodeRecord() {
    if (encodeTimer) clearTimeout(encodeTimer)
    encodeTimer = setTimeout(commitEncodeRecord, ENCODE_DEBOUNCE_MS)
  }

  function commitEncodeRecord() {
    const text = inputText.value.trim()
    if (!text) return
    const now = Date.now()
    const cells = textToBraille(text)
    const last = encodeRecords.value[0]
    // 同一轮连续输入（10 秒内）合并，避免每个字符都留档
    if (last && now - last.at <= ENCODE_MERGE_MS) {
      last.text = text
      last.cells = cells
      last.at = now
    } else {
      encodeRecords.value.unshift({ id: uid(), text, cells, at: now })
    }
    saveEncodeRecords(encodeRecords.value)
  }

  function exportPDF(): string {
    const lines = inputText.value.toUpperCase().split('')
    let out = '盲文翻译输出\n\n'
    for (const ch of lines) {
      const dots = BRAILLE_MAP[ch] || []
      out += `${ch} → [${dots.join(',')}] ${dotsToUnicode(dots)}\n`
    }
    return out
  }

  return {
    inputText, brailleOutput, learnMode, quizChar, selectedDots,
    quizRecords, encodeRecords, score,
    brailleUnicode, translate, reverseTranslate, generateQuiz, toggleDot,
    checkQuizAnswer, resetScore, exportPDF
  }
})
