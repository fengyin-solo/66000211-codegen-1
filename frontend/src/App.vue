<template>
  <div class="min-h-screen p-4 flex flex-col gap-4 max-w-6xl mx-auto">
    <h1 class="text-3xl font-bold text-purple-400">盲文翻译与触觉学习器</h1>

    <div class="flex gap-2">
      <button v-for="t in tabs" :key="t.id" @click="activeTab = t.id"
        class="px-4 py-2 rounded text-sm"
        :class="activeTab === t.id ? 'bg-purple-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'">
        {{ t.label }}
      </button>
    </div>

    <!-- Translate -->
    <div v-if="activeTab === 'translate'" class="grid grid-cols-2 gap-4">
      <div class="bg-gray-900 rounded-xl p-4">
        <h3 class="text-purple-300 font-bold mb-2">文本输入</h3>
        <textarea v-model="store.inputText" @input="store.translate()"
          class="w-full h-32 bg-gray-800 rounded p-3 text-white resize-none" placeholder="输入英文文本..." />
        <button @click="doSaveEncoding" :disabled="!store.inputText.trim()"
          class="mt-2 bg-purple-600 px-3 py-1.5 rounded hover:bg-purple-500 disabled:opacity-40 text-xs">
          保存本次编码结果（供档案收录）
        </button>
      </div>
      <div class="bg-gray-900 rounded-xl p-4">
        <h3 class="text-purple-300 font-bold mb-2">盲文输出</h3>
        <div class="text-4xl tracking-wider text-purple-300 h-16">{{ store.brailleUnicode }}</div>
        <div class="flex flex-wrap gap-2 mt-3">
          <BrailleCell v-for="(dots, i) in store.brailleOutput" :key="i" :dots="dots" :size="40" />
        </div>
      </div>
    </div>

    <!-- Learn -->
    <div v-if="activeTab === 'learn'" class="grid grid-cols-2 gap-4">
      <div class="bg-gray-900 rounded-xl p-4 flex flex-col items-center gap-4">
        <h3 class="text-purple-300 font-bold">猜盲文</h3>
        <div v-if="!store.quizChar">
          <button @click="store.generateQuiz()" class="bg-purple-500 px-6 py-3 rounded-lg text-lg hover:bg-purple-400">
            开始训练
          </button>
        </div>
        <div v-else class="flex flex-col items-center gap-3">
          <div class="text-7xl font-bold text-purple-400">{{ store.quizChar }}</div>
          <div class="text-sm text-gray-400">点击下方 6 点阵选择对应盲文</div>
          <div class="grid grid-cols-2 gap-2 p-4 bg-gray-800 rounded-xl">
            <button v-for="d in 6" :key="d" @click="store.toggleDot(d)"
              class="w-14 h-14 rounded-full border-2 transition-all"
              :class="store.selectedDots.includes(d) ? 'bg-purple-500 border-purple-400 scale-110' : 'bg-gray-700 border-gray-600 hover:border-purple-400'">
              <span class="text-xs">{{ d }}</span>
            </button>
          </div>
          <button @click="store.checkQuizAnswer()" class="bg-purple-500 px-6 py-2 rounded hover:bg-purple-400">确认</button>
        </div>
      </div>
      <div class="bg-gray-900 rounded-xl p-4">
        <div class="flex justify-between mb-2">
          <h3 class="text-purple-300 font-bold">统计</h3>
          <button @click="store.resetScore()" class="text-red-400 text-xs hover:underline">重置</button>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center mb-3">
          <div class="bg-gray-800 rounded p-2">
            <div class="text-2xl font-bold text-green-400">{{ store.score.correct }}</div>
            <div class="text-xs text-gray-400">正确</div>
          </div>
          <div class="bg-gray-800 rounded p-2">
            <div class="text-2xl font-bold text-red-400">{{ store.score.total - store.score.correct }}</div>
            <div class="text-xs text-gray-400">错误</div>
          </div>
          <div class="bg-gray-800 rounded p-2">
            <div class="text-2xl font-bold text-purple-400">{{ store.score.total ? Math.round(store.score.correct / store.score.total * 100) : 0 }}%</div>
            <div class="text-xs text-gray-400">正确率</div>
          </div>
        </div>
        <!-- 答题记录：按月份归拢，月份文案与编码、档案两处一致 -->
        <div class="space-y-2 max-h-64 overflow-y-auto">
          <div v-for="g in quizGroups" :key="g.month">
            <div class="text-xs text-purple-300 font-bold sticky top-0 bg-gray-900 py-0.5">
              {{ monthLabel(g.month) }} · {{ g.items.length }} 条
            </div>
            <div class="space-y-1">
              <div v-for="h in g.items.slice(0, 20)" :key="h.id"
                class="flex justify-between bg-gray-800 rounded p-2 text-sm"
                :class="h.correct ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500'">
                <span>{{ h.input }}
                  <span class="text-xs text-gray-500 ml-2">{{ formatDateTime(h.ts) }}</span>
                </span>
                <span>{{ h.correct ? '✓' : '✗' }}</span>
              </div>
            </div>
          </div>
          <div v-if="!store.history.length" class="text-gray-500 text-sm text-center py-4">
            暂无答题记录
          </div>
        </div>
      </div>
    </div>

    <!-- Reference -->
    <div v-if="activeTab === 'ref'" class="bg-gray-900 rounded-xl p-4">
      <h3 class="text-purple-300 font-bold mb-3">盲文速查表</h3>
      <div class="grid grid-cols-6 md:grid-cols-9 gap-3">
        <div v-for="(dots, char) in brailleMap" :key="char" class="flex flex-col items-center">
          <div class="text-xl font-bold text-purple-400">{{ char }}</div>
          <BrailleCell :dots="dots" :size="30" />
          <div class="text-xs text-gray-500">{{ dots.join(',') }}</div>
        </div>
      </div>
    </div>

    <!-- Archive -->
    <ArchivePanel v-if="activeTab === 'archive'" />

    <button @click="doExport" class="bg-green-700 px-4 py-2 rounded self-start hover:bg-green-600 text-sm">
      导出翻译文本
    </button>

    <!-- 编码结果记录：按月份归拢，与答题、档案看到的月份相同 -->
    <div v-if="activeTab === 'translate'" class="bg-gray-900 rounded-xl p-4">
      <h3 class="text-purple-300 font-bold mb-2">已保存的编码结果（{{ store.encodings.length }}）</h3>
      <div class="space-y-2 max-h-64 overflow-y-auto">
        <div v-for="g in encodingGroups" :key="g.month">
          <div class="text-xs text-purple-300 font-bold">{{ monthLabel(g.month) }} · {{ g.items.length }} 条</div>
          <div v-for="e in g.items" :key="e.id"
            class="flex justify-between items-center bg-gray-800 rounded p-2 text-sm border-l-4 border-purple-500">
            <div class="min-w-0">
              <div class="truncate">{{ e.input }}</div>
              <div class="text-purple-300">{{ e.braille }}</div>
              <div class="text-xs text-gray-500">{{ formatDateTime(e.ts) }}</div>
            </div>
            <button @click="store.deleteEncoding(e.id)" class="text-red-400 text-xs hover:underline ml-2 shrink-0">删除</button>
          </div>
        </div>
        <div v-if="!store.encodings.length" class="text-gray-500 text-sm text-center py-3">
          在上方输入文本并点击“保存本次编码结果”，即可被学习档案收录
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useBrailleStore } from './store/braille'
import { BRAILLE_MAP } from './utils/braille'
import { monthLabel, formatDateTime, groupByMonth } from './utils/time'
import BrailleCell from './components/BrailleCell.vue'
import ArchivePanel from './components/ArchivePanel.vue'

const store = useBrailleStore()
const brailleMap = BRAILLE_MAP
const tabs = [
  { id: 'translate', label: '翻译模式' },
  { id: 'learn', label: '训练模式' },
  { id: 'ref', label: '速查表' },
  { id: 'archive', label: '学习档案' },
]
const activeTab = ref('translate')

const quizGroups = computed(() => groupByMonth(store.history))
const encodingGroups = computed(() => groupByMonth(store.encodings))

function doExport() {
  const text = store.exportPDF()
  const blob = new Blob([text], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'braille-output.txt'
  a.click()
}

function doSaveEncoding() {
  store.saveEncoding()
}
</script>
