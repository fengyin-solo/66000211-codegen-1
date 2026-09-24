import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { BRAILLE_MAP, textToBraille, brailleToText, dotsToUnicode } from '../utils/braille'
import type { LearnMode, QuizRecord, EncodingRecord } from '../types'
import { loadJSON, saveJSON } from '../utils/storage'

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export const useBrailleStore = defineStore('braille', () => {
  const inputText = ref('')
  const brailleOutput = ref<number[][]>([])
  const learnMode = ref<LearnMode>('charToBraille')
  const quizChar = ref('')
  const selectedDots = ref<number[]>([])
  const score = ref(loadJSON<{ correct: number; total: number }>('score', { correct: 0, total: 0 }))

  // 答题记录与编码结果都本地保存，供档案导出使用
  const history = ref<QuizRecord[]>(loadJSON<QuizRecord[]>('quizHistory', []))
  const encodings = ref<EncodingRecord[]>(loadJSON<EncodingRecord[]>('encodings', []))

  watch(history, v => saveJSON('quizHistory', v))
  watch(encodings, v => saveJSON('encodings', v))
  watch(score, v => saveJSON('score', v))

  const brailleUnicode = computed(() =>
    brailleOutput.value.map(d => dotsToUnicode(d)).join('')
  )

  function translate() {
    brailleOutput.value = textToBraille(inputText.value)
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
    score.value.total++
    if (correct) score.value.correct++
    history.value.unshift({
      id: uid(),
      type: 'quiz',
      ts: Date.now(),
      input: quizChar.value,
      correct,
    })
    if (navigator.vibrate) navigator.vibrate(correct ? 100 : [100, 50, 100])
    generateQuiz()
  }

  /** 保存当前文本与编码结果，作为一条编码记录进入档案来源 */
  function saveEncoding(): EncodingRecord | null {
    const text = inputText.value.trim()
    if (!text) return null
    const rec: EncodingRecord = {
      id: uid(),
      type: 'encoding',
      ts: Date.now(),
      input: text,
      braille: brailleOutput.value.map(d => dotsToUnicode(d)).join(''),
      dots: brailleOutput.value.map(d => [...d]),
    }
    encodings.value.unshift(rec)
    return rec
  }

  function deleteEncoding(id: string) {
    encodings.value = encodings.value.filter(e => e.id !== id)
  }

  function resetScore() {
    score.value = { correct: 0, total: 0 }
    history.value = []
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
    inputText, brailleOutput, learnMode, quizChar, selectedDots, score, history, encodings,
    brailleUnicode, translate, reverseTranslate, generateQuiz, toggleDot,
    checkQuizAnswer, resetScore, saveEncoding, deleteEncoding, exportPDF
  }
})
