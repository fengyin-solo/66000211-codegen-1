<template>
  <div class="flex flex-col gap-4">
    <!-- 导出：勾选内容 + 预览条目数/时间范围 -->
    <div class="bg-gray-900 rounded-xl p-4">
      <h3 class="text-purple-300 font-bold mb-3">导出学习档案</h3>
      <div class="flex flex-wrap gap-4 items-start">
        <div class="flex flex-col gap-2">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" v-model="selection.includeQuiz" :disabled="archive.busy"
              class="accent-purple-500 w-4 h-4">
            收录答题记录（{{ braille.history.length }} 条）
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" v-model="selection.includeEncoding" :disabled="archive.busy"
              class="accent-purple-500 w-4 h-4">
            收录编码结果（{{ braille.encodings.length }} 条）
          </label>
        </div>
        <div class="flex flex-col gap-1 text-sm">
          <span class="text-gray-400">时间范围</span>
          <div class="flex items-center gap-2">
            <input type="date" v-model="selection.start" :max="selection.end" :disabled="archive.busy"
              class="bg-gray-800 rounded px-2 py-1 text-white" />
            <span class="text-gray-500">至</span>
            <input type="date" v-model="selection.end" :min="selection.start" :disabled="archive.busy"
              class="bg-gray-800 rounded px-2 py-1 text-white" />
          </div>
        </div>
        <div class="flex-1 min-w-[220px] bg-gray-800 rounded-lg p-3 text-sm">
          <div class="text-gray-400 mb-1">导出前预览</div>
          <div v-if="previewData.total" class="space-y-1">
            <div>将收录 <span class="text-purple-300 font-bold">{{ previewData.total }}</span> 条
              （答题 {{ previewData.quizCount }} / 编码 {{ previewData.encodingCount }}）</div>
            <div>时间范围：{{ formatDateTime(previewData.earliestTs!) }} ～ {{ formatDateTime(previewData.latestTs!) }}</div>
            <div>归拢到 {{ previewData.monthKeys.length }} 个月份：
              <span v-for="m in previewData.monthKeys" :key="m"
                class="inline-block bg-gray-700 rounded px-2 py-0.5 mr-1 mb-1 text-xs">{{ monthLabel(m) }}</span>
            </div>
          </div>
          <div v-else class="text-gray-500">当前勾选与范围内没有条目</div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3 mt-3">
        <button @click="doExport" :disabled="archive.busy || !previewData.total"
          class="bg-purple-500 px-5 py-2 rounded hover:bg-purple-400 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
          {{ archive.busy && archive.busyAction === 'export' ? '归档写入中…' : '导出并归档' }}
        </button>
        <label class="flex items-center gap-2 text-xs text-gray-400">
          <input type="checkbox" v-model="simulateFailure" class="accent-red-500 w-3.5 h-3.5">
          模拟下一条写入失败（用于体验重试）
        </label>
      </div>

      <div v-if="archive.lastMessage"
        class="mt-3 rounded p-2 text-sm"
        :class="archive.lastResult?.failed ? 'bg-red-950 border border-red-700 text-red-200' : 'bg-gray-800 text-gray-300'">
        <div class="flex flex-wrap items-center gap-3">
          <span>{{ archive.lastMessage }}</span>
          <button v-if="archive.totalFailures" @click="doRetryAll"
            :disabled="archive.busy"
            class="bg-red-700 px-3 py-1 rounded hover:bg-red-600 disabled:opacity-50 text-xs">
            {{ archive.busy && archive.busyAction === 'retry-all' ? '重试中…' : `重试全部未写入（${archive.totalFailures}）` }}
          </button>
        </div>
        <ul v-if="archive.totalFailures" class="mt-2 space-y-0.5 text-xs list-disc list-inside">
          <template v-for="a in archive.archives" :key="a.id">
            <li v-for="f in a.failures" :key="f.entryId" class="text-red-300">
              {{ monthLabel(a.monthKey) }} · {{ f.label }} —— {{ f.reason }}
            </li>
          </template>
        </ul>
      </div>
    </div>

    <!-- 档案列表（本地保存） -->
    <div class="bg-gray-900 rounded-xl p-4">
      <div class="flex justify-between items-center mb-3">
        <h3 class="text-purple-300 font-bold">
          本地档案列表
          <span class="text-xs text-gray-400 font-normal">
            （{{ archive.sortedArchives.length }} 个月份 / {{ archive.totalEntries }} 条，已保存在本机）
          </span>
        </h3>
        <button @click="archive.downloadAll()" :disabled="archive.busy || !archive.archives.length"
          class="bg-green-700 px-3 py-1.5 rounded hover:bg-green-600 disabled:opacity-50 text-xs">
          下载全部档案
        </button>
      </div>

      <div v-if="!archive.sortedArchives.length" class="text-gray-500 text-sm py-6 text-center">
        还没有档案。勾选内容后点击“导出并归档”，档案会按月份归拢并保存在本机。
      </div>

      <div v-else class="space-y-2">
        <div v-for="a in archive.sortedArchives" :key="a.id"
          class="bg-gray-800 rounded-lg p-3"
          :class="expiredIds.has(a.id) ? 'border border-yellow-700' : ''">
          <div class="flex flex-wrap items-center gap-3">
            <button @click="toggleOpen(a.id)" class="text-purple-300 font-bold text-sm hover:underline">
              {{ openIds.has(a.id) ? '▾' : '▸' }} {{ monthLabel(a.monthKey) }}
            </button>
            <span class="text-xs text-gray-400">{{ a.entries.length }} 条</span>
            <span v-if="a.failures.length" class="text-xs text-red-400">{{ a.failures.length }} 条未写入</span>
            <span v-if="archive.archiveStatusOf(a) === 'complete'"
              class="text-xs bg-green-900 text-green-300 rounded px-2 py-0.5">完整</span>
            <span v-else class="text-xs bg-red-900 text-red-300 rounded px-2 py-0.5">不完整</span>
            <span v-if="expiredIds.has(a.id)"
              class="text-xs bg-yellow-900 text-yellow-300 rounded px-2 py-0.5">超过保留期</span>
            <span class="text-xs text-gray-500 ml-auto">更新于 {{ formatDateTime(a.updatedAt) }}</span>
            <button v-if="a.failures.length" @click="doRetryOne(a.id)" :disabled="archive.busy"
              class="bg-red-700 px-2.5 py-1 rounded hover:bg-red-600 disabled:opacity-50 text-xs">
              {{ archive.busy && archive.busyAction === `retry:${a.id}` ? '重试中…' : '重试未写入' }}
            </button>
            <button @click="archive.downloadArchive(a.id)" :disabled="archive.busy"
              class="bg-green-700 px-2.5 py-1 rounded hover:bg-green-600 disabled:opacity-50 text-xs">
              下载
            </button>
          </div>
          <div v-if="openIds.has(a.id)" class="mt-2 space-y-1 max-h-56 overflow-y-auto">
            <div v-for="e in [...a.entries].sort((x, y) => y.ts - x.ts)" :key="e.id"
              class="flex justify-between text-xs bg-gray-900 rounded px-2 py-1"
              :class="e.kind === 'quiz' ? 'border-l-2 border-blue-500' : 'border-l-2 border-purple-500'">
              <span>
                <span class="text-gray-500 mr-2">{{ e.kind === 'quiz' ? '答题' : '编码' }}</span>
                {{ e.label }}
                <template v-if="e.kind === 'quiz'">
                  <span :class="e.quiz!.correct ? 'text-green-400' : 'text-red-400'">
                    {{ e.quiz!.correct ? '✓' : '✗' }}
                  </span>
                </template>
              </span>
              <span class="text-gray-500">{{ formatDateTime(e.ts) }}</span>
            </div>
            <div v-if="!a.entries.length" class="text-xs text-gray-500 py-2 text-center">
              暂无成功写入的条目
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 保留期清理 -->
    <div class="bg-gray-900 rounded-xl p-4">
      <h3 class="text-purple-300 font-bold mb-3">保留期与清理</h3>
      <div class="flex flex-wrap items-center gap-3 text-sm mb-3">
        <label class="flex items-center gap-2">
          保留期
          <input type="number" min="1" max="120" v-model.number="retentionInput"
            @change="applyRetention" :disabled="archive.busy"
            class="w-20 bg-gray-800 rounded px-2 py-1 text-white" />
          个月
        </label>
        <span class="text-gray-500 text-xs">当前月份及之前 {{ archive.retentionMonths }} 个月内的档案保留，更早的到期。</span>
        <button @click="scanExpired" :disabled="archive.busy"
          class="bg-yellow-700 px-3 py-1.5 rounded hover:bg-yellow-600 disabled:opacity-50 text-xs">
          扫描到期档案
        </button>
      </div>

      <!-- 清理确认：先列出将被删掉的条目，等用户确认；取消则原档案仍可读 -->
      <div v-if="confirmCleanup" class="bg-yellow-950 border border-yellow-700 rounded-lg p-3">
        <div class="text-yellow-300 font-bold text-sm mb-2">
          以下 {{ expiredList.length }} 份档案、{{ expiredEntryCount }} 个条目将被永久删除：
        </div>
        <div class="max-h-56 overflow-y-auto space-y-2 text-xs">
          <div v-for="a in expiredList" :key="a.id" class="bg-gray-900 rounded p-2">
            <div class="font-bold text-yellow-200">{{ monthLabel(a.monthKey) }}（{{ a.entries.length }} 条）</div>
            <div v-for="e in a.entries" :key="e.id" class="text-gray-400 pl-2">
              · {{ e.kind === 'quiz' ? '答题' : '编码' }} {{ e.label }} — {{ formatDateTime(e.ts) }}
            </div>
            <div v-if="!a.entries.length" class="text-gray-500 pl-2">·（无成功写入条目）</div>
          </div>
        </div>
        <div class="flex gap-3 mt-3">
          <button @click="doCleanup" :disabled="archive.busy"
            class="bg-red-600 px-4 py-1.5 rounded hover:bg-red-500 disabled:opacity-50 text-sm">
            {{ archive.busy && archive.busyAction === 'cleanup' ? '清理中…' : '确认删除' }}
          </button>
          <button @click="cancelCleanup" :disabled="archive.busy"
            class="bg-gray-700 px-4 py-1.5 rounded hover:bg-gray-600 disabled:opacity-50 text-sm">
            取消（保留档案）
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useBrailleStore } from '../store/braille'
import { useArchiveStore } from '../store/archive'
import type { ArchiveRecord } from '../types'
import { monthLabel, formatDateTime, dateKey, shiftMonthKey, currentMonthKey } from '../utils/time'
import { setFailureSimulation } from '../utils/storage'

const braille = useBrailleStore()
const archive = useArchiveStore()

// 默认时间范围：最近 3 个月 ～ 今天
const selection = reactive({
  includeQuiz: true,
  includeEncoding: true,
  start: `${shiftMonthKey(currentMonthKey(), -2)}-01`,
  end: dateKey(Date.now()),
})

const simulateFailure = ref(false)
const openIds = ref(new Set<string>())
const retentionInput = ref(archive.retentionMonths)
const confirmCleanup = ref(false)
const expiredList = ref<ArchiveRecord[]>([])

const previewData = computed(() => archive.preview(braille.history, braille.encodings, selection))

const expiredIds = computed(() => {
  const s = new Set<string>()
  for (const a of archive.listExpired()) s.add(a.id)
  return s
})

const expiredEntryCount = computed(() =>
  expiredList.value.reduce((sum, a) => sum + a.entries.length, 0))

function toggleOpen(id: string) {
  if (openIds.value.has(id)) openIds.value.delete(id)
  else openIds.value.add(id)
  openIds.value = new Set(openIds.value)
}

async function doExport() {
  setFailureSimulation(simulateFailure.value)
  simulateFailure.value = false
  const res = await archive.exportToArchives(braille.history, braille.encodings, selection)
  setFailureSimulation(false)
  if (res.monthKeys?.length) {
    for (const m of res.monthKeys) {
      const a = archive.archives.find(x => x.monthKey === m)
      if (a) openIds.value.add(a.id)
    }
    openIds.value = new Set(openIds.value)
  }
}

async function doRetryAll() {
  await archive.retryFailures()
}

async function doRetryOne(id: string) {
  await archive.retryFailures(id)
}

function applyRetention() {
  const n = Math.min(120, Math.max(1, Math.round(retentionInput.value) || 6))
  retentionInput.value = n
  archive.setRetention(n)
  confirmCleanup.value = false
}

function scanExpired() {
  expiredList.value = archive.listExpired()
  confirmCleanup.value = expiredList.value.length > 0
}

async function doCleanup() {
  const ids = expiredList.value.map(a => a.id)
  await archive.cleanupExpired(ids)
  for (const id of ids) openIds.value.delete(id)
  openIds.value = new Set(openIds.value)
  confirmCleanup.value = false
  expiredList.value = []
}

function cancelCleanup() {
  // 取消：不做任何删除，原档案仍然可读
  confirmCleanup.value = false
  expiredList.value = []
}
</script>
