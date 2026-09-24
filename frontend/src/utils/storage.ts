// localStorage 持久化封装。档案列表必须本地保存，刷新后仍然可读。

const PREFIX = 'braille:'

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * 写入一条数据。空间不足等异常会抛出，调用方负责按条目记录失败。
 * 注：__simulateArchiveWriteFailure 仅供测试/演示中途失败路径使用，
 * 在档案面板里勾选“模拟下一条写入失败”即可看到失败与重试流程。
 */
export function saveJSON<T>(key: string, value: T): void {
  if (typeof localStorage !== 'undefined') {
    const flag = localStorage.getItem(PREFIX + '__simulateArchiveWriteFailure')
    if (flag && key === 'archives') {
      localStorage.removeItem(PREFIX + '__simulateArchiveWriteFailure')
      throw new Error('存储写入失败（模拟）：本条未写入')
    }
  }
  localStorage.setItem(PREFIX + key, JSON.stringify(value))
}

export function setFailureSimulation(on: boolean): void {
  if (on) localStorage.setItem(PREFIX + '__simulateArchiveWriteFailure', '1')
  else localStorage.removeItem(PREFIX + '__simulateArchiveWriteFailure')
}
