<template>
  <div class="flex flex-col gap-4">
    <!-- 选择与预览 -->
    <div class="bg-gray-900 rounded-xl p-4">
      <h3 class="text-purple-300 font-bold mb-3">整理学习档案</h3>

      <div class="flex flex-wrap items-center gap-4 mb-3">
        <label class="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" :checked="includeQuiz" :disabled="archiveStore.busy"
            @change="includeQuiz = ($event.target as HTMLInputElement).checked" />
          答题记录
        </label>
        <label class="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" :checked="includeEncode" :disabled="archiveStore.busy"
            @change="includeEncode = ($event.target as HTMLInputElement).checked" />
          编码结果
        </label>
        <div class="flex items-center gap-2 text-sm text-gray-300">
          <span>月份</span>
          <input type="month" v-model="fromMonth" :disabled="archiveStore.busy"
            class="bg-gray-800 rounded px-2 py-1 text-white" />
          <span>至</span>
          <input type="month" v-model="toMonth" :disabled="archiveStore.busy"
            class="bg-gray-800 rounded px-2 py-1 text-white" />
        </div>
        <button v-if="fromMonth || toMonth" @click="clearRange" :disabled="archiveStore.busy"
          class="text-xs text-gray-400 hover:underline">清除月份范围</button>
      </div>

      <!-- 导出前预览：条目数与时间范围 -->
      <div class="bg-gray-800 rounded-lg p-3 text-sm">
        <template v-if="selectedEntries.length">
          <div class="flex flex-wrap gap-x-6 gap-y-1">
            <span>将收录 <b class="text-purple-300">{{ selectedEntries.length }}</b> 条
              （答题 {{ selectedKinds.quiz }} · 编码 {{ selectedKinds.encode }}）</span>
            <span>时间范围：{{ formatDateTime(selectedRange[0]) }} ～ {{ formatDateTime(selectedRange[1]) }}</span>
          </div>
          <div class="flex flex-wrap gap-2 mt-2">
            <span v-for="g in selectedGroups" :key="g.month"
              class="text-xs bg-gray-700 rounded-full px-2 py-0.5 text-gray-300">
              {{ formatMonth(g.month) }}：{{ g.entries.length }} 条
            </span>
          </div>
        </template>
        <span v-else class="text-gray-500">当前勾选与时间范围内没有可收录的条目。</span>
      </div>

      <div class="flex gap-2 mt-3">
        <button @click="startExport" :disabled="!canStart"
          class="bg-green-700 px-4 py-2 rounded text-sm hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed">
          {{ archiveStore.busy ? '处理中…' : '导出离线档案' }}
        </button>
        <button @click="startArchive" :disabled="!canStart"
          class="bg-purple-500 px-4 py-2 rounded text-sm hover:bg-purple-400 disabled:opacity-40 disabled:cursor-not-allowed">
          {{ archiveStore.busy ? '处理中…' : '归入月度档案' }}
        </button>
        <label class="ml-auto flex items-center gap-2 text-xs text-gray-500">
          <input type="checkbox" :checked="archiveStore.settings.simulateFailures"
            @change="archiveStore.updateSettings({ simulateFailures: ($event.target as HTMLInputElement).checked })" />
          模拟部分写入失败（测试重试）
        </label>
      </div>
    </div>

    <!-- 进行中 / 结果：按月份单元展示，挡住重复操作 -->
    <div v-if="archiveStore.job" class="bg-gray-900 rounded-xl p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-purple-300 font-bold">
          {{ archiveStore.job.mode === 'export' ? '导出' : '归档' }}进度
        </h3>
        <span class="text-xs text-gray-400">{{ jobSummary }}</span>
      </div>

      <div class="space-y-2">
        <div v-for="item in archiveStore.job.items" :key="item.key"
          class="bg-gray-800 rounded-lg p-3 text-sm"
          :class="{ 'border-l-4 border-red-500': item.status === 'failed',
                    'border-l-4 border-green-500': item.status === 'done' }">
          <div class="flex items-center justify-between">
            <span>{{ item.label }} · {{ item.entryIds.length }} 条</span>
            <span v-if="item.status === 'pending'" class="text-gray-400 text-xs">等待写入…</span>
            <span v-else-if="item.status === 'done'" class="text-green-400 text-xs">已写入</span>
            <span v-else class="text-red-400 text-xs">写入失败：{{ item.error }}</span>
          </div>
          <!-- 失败时列出具体没写进去的条目 -->
          <ul v-if="item.status === 'failed'" class="mt-2 text-xs text-red-300 space-y-0.5">
            <li v-for="e in failedEntries(item)" :key="e.id">· {{ formatDateTime(e.at) }} {{ entrySummary(e) }}</li>
          </ul>
        </div>
      </div>

      <div class="flex gap-2 mt-3">
        <button v-if="archiveStore.job.status === 'partial'" @click="archiveStore.retryFailed()"
          class="bg-yellow-600 px-4 py-2 rounded text-sm hover:bg-yellow-500">
          重试失败项（已写入的不会重复）
        </button>
        <button v-if="archiveStore.job.mode === 'export' && archiveStore.job.status === 'done'"
          @click="archiveStore.finalizeExport()"
          class="bg-green-700 px-4 py-2 rounded text-sm hover:bg-green-600">
          下载离线档案
        </button>
        <span v-if="archiveStore.job.mode === 'archive' && archiveStore.job.status === 'done'"
          class="text-sm text-green-400 self-center">全部条目已归入对应月份档案。</span>
        <button v-if="archiveStore.job.status !== 'running'" @click="archiveStore.dismissJob()"
          class="ml-auto text-sm text-gray-400 hover:underline">关闭</button>
      </div>
    </div>

    <!-- 保留期设置与清理 -->
    <div class="bg-gray-900 rounded-xl p-4">
      <div class="flex flex-wrap items-center gap-3">
        <h3 class="text-purple-300 font-bold">保留期</h3>
        <label class="flex items-center gap-2 text-sm text-gray-300">
          保留近
          <input type="number" min="1" max="120" :value="archiveStore.settings.retentionMonths"
            @change="updateRetention(($event.target as HTMLInputElement).value)"
            class="w-16 bg-gray-800 rounded px-2 py-1 text-white" />
          个月
        </label>
        <button v-if="archiveStore.expired.length" @click="archiveStore.requestCleanup()"
          class="ml-auto bg-red-800 px-4 py-2 rounded text-sm hover:bg-red-700">
          有 {{ archiveStore.expired.length }} 个月的档案超过保留期，查看清理
        </button>
        <span v-else class="ml-auto text-xs text-gray-500">暂无超过保留期的档案</span>
      </div>
    </div>

    <!-- 月度档案列表（本地保存） -->
    <div class="bg-gray-900 rounded-xl p-4">
      <h3 class="text-purple-300 font-bold mb-3">月度档案（本地保存）</h3>
      <p v-if="!archiveStore.archives.length" class="text-sm text-gray-500">还没有归档记录。</p>
      <div v-else class="space-y-2">
        <div v-for="a in archiveStore.archives" :key="a.id" class="bg-gray-800 rounded-lg p-3">
          <div class="flex items-center justify-between">
            <button class="text-sm font-bold text-purple-300 hover:underline"
              @click="toggleMonth(a.id)">
              {{ expanded[a.id] ? '▾' : '▸' }} {{ formatMonth(a.month) }}
            </button>
            <span class="text-xs text-gray-400">
              {{ a.entries.length }} 条 · {{ formatDateTime(a.entries[0]?.at ?? a.updatedAt) }}
              ～ {{ formatDateTime(a.entries[a.entries.length - 1]?.at ?? a.updatedAt) }}
            </span>
          </div>
          <ul v-if="expanded[a.id]" class="mt-2 text-xs text-gray-300 space-y-0.5">
            <li v-for="e in a.entries" :key="e.id"
              :class="e.kind === 'quiz' ? 'text-blue-300' : 'text-teal-300'">
              · {{ formatDateTime(e.at) }} {{ entrySummary(e) }}
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 清理确认弹窗：列出将被删除的条目，取消后档案原封不动 -->
    <div v-if="archiveStore.cleanupPreview"
      class="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div class="bg-gray-900 rounded-xl p-5 max-w-lg w-full max-h-[80vh] flex flex-col gap-3">
        <h3 class="text-red-400 font-bold">确认清理过期档案</h3>
        <p class="text-sm text-gray-400">
          以下 {{ cleanupCount }} 条记录将被永久删除。取消后档案保持不变，仍可正常查看。
        </p>
        <div class="overflow-y-auto space-y-2">
          <div v-for="a in archiveStore.cleanupPreview" :key="a.id" class="bg-gray-800 rounded p-2">
            <div class="text-sm text-purple-300">{{ formatMonth(a.month) }}（{{ a.entries.length }} 条）</div>
            <ul class="text-xs text-gray-400 mt-1 space-y-0.5">
              <li v-for="e in a.entries" :key="e.id">· {{ formatDateTime(e.at) }} {{ entrySummary(e) }}</li>
            </ul>
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <button @click="archiveStore.cancelCleanup()"
            class="px-4 py-2 rounded text-sm bg-gray-700 hover:bg-gray-600">取消</button>
          <button @click="doConfirmCleanup"
            class="px-4 py-2 rounded text-sm bg-red-700 hover:bg-red-600">确认删除 {{ cleanupCount }} 条</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useArchiveStore } from '../store/archive'
import type { ArchiveEntry, JobItem } from '../types'
import {
  groupByMonth,
  monthOf,
  formatMonth,
  formatDateTime,
  entrySummary,
} from '../utils/records'

const archiveStore = useArchiveStore()

const includeQuiz = ref(true)
const includeEncode = ref(true)
const fromMonth = ref('')
const toMonth = ref('')
const expanded = reactive<Record<string, boolean>>({})

const selectedKinds = computed(() => {
  const kinds: ('quiz' | 'encode')[] = []
  if (includeQuiz.value) kinds.push('quiz')
  if (includeEncode.value) kinds.push('encode')
  return { quiz: includeQuiz.value, encode: includeEncode.value, list: kinds }
})

function monthStart(value: string): number | undefined {
  if (!value) return undefined
  return new Date(`${value}-01T00:00:00`).getTime()
}

function monthEnd(value: string): number | undefined {
  if (!value) return undefined
  const [y, m] = value.split('-').map(Number)
  return new Date(y, m, 0, 23, 59, 59, 999).getTime() // 该月最后一天
}

const selectedEntries = computed(() =>
  archiveStore.pickEntries(selectedKinds.value.list, monthStart(fromMonth.value), monthEnd(toMonth.value)),
)

const selectedGroups = computed(() =>
  [...groupByMonth(selectedEntries.value)].map(([month, entries]) => ({ month, entries })),
)

const selectedRange = computed<[number, number]>(() => {
  const list = selectedEntries.value
  if (!list.length) return [Date.now(), Date.now()]
  return [list[0].at, list[list.length - 1].at]
})

const canStart = computed(
  () => !archiveStore.busy && selectedEntries.value.length > 0 && selectedKinds.value.list.length > 0,
)

function clearRange() {
  fromMonth.value = ''
  toMonth.value = ''
}

function startExport() {
  if (canStart.value) archiveStore.startJob('export', selectedEntries.value)
}

function startArchive() {
  if (canStart.value) archiveStore.startJob('archive', selectedEntries.value)
}

const jobSummary = computed(() => {
  const job = archiveStore.job
  if (!job) return ''
  const done = job.items.filter(i => i.status === 'done').length
  const failed = job.items.filter(i => i.status === 'failed').length
  if (job.status === 'running') return `正在写入… ${done}/${job.items.length}`
  if (job.status === 'partial') return `已写入 ${done} 个月，${failed} 个月失败，可重试`
  return `全部 ${done} 个月写入完成`
})

/** 查某个失败单元对应的条目（来源仍是答题/编码两处的原始记录，月份口径一致） */
function failedEntries(item: JobItem): ArchiveEntry[] {
  const wanted = new Set(item.entryIds)
  return archiveStore
    .pickEntries(['quiz', 'encode'])
    .filter(e => wanted.has(e.id) && monthOf(e.at) === item.key)
}

const cleanupCount = computed(() =>
  (archiveStore.cleanupPreview ?? []).reduce((n, a) => n + a.entries.length, 0),
)

function toggleMonth(id: string) {
  expanded[id] = !expanded[id]
}

function updateRetention(value: string) {
  const n = Math.max(1, Math.min(120, Number(value) || 6))
  archiveStore.updateSettings({ retentionMonths: n })
}

function doConfirmCleanup() {
  const err = archiveStore.confirmCleanup()
  if (err) alert(`清理写入失败，原有档案未改动：${err}`)
}
</script>
