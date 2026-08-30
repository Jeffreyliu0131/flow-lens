import type { EventKind, ObservationState, Phase } from '../domain'

export function formatTime(timeMs: number): string {
  const safe = Math.max(0, Math.round(timeMs))
  const minutes = Math.floor(safe / 60_000)
  const seconds = Math.floor((safe % 60_000) / 1_000)
  const milliseconds = safe % 1_000
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

export function formatDuration(timeMs: number): string {
  return `${(timeMs / 1_000).toFixed(2)} 秒`
}

export const eventKindLabel: Readonly<Record<EventKind, string>> = {
  'zone-entry': '进入区域',
  'zone-dwell': '区域停留',
  'zone-revisit': '重复访问',
}

export const eventStateLabel: Readonly<Record<ObservationState, string>> = {
  proposed: '待复核',
  confirmed: '已确认',
  'edited-final': '已修订',
  rejected: '已拒绝',
  uncertain: '不确定',
  'edit-draft': '编辑草稿',
}

export const phaseLabel: Readonly<Record<Phase, string>> = {
  before: '基线',
  after: '改后',
}

export const blockerLabel: Readonly<Record<string, string>> = {
  NOT_FINALIZED: '覆盖尚未最终确认',
  CANDIDATE_INDEPENDENT_SWEEP_MISSING: '缺少独立全程复核',
  UNKNOWN_INTERVALS_PRESENT: '存在未知区间',
  UNREVIEWED_INTERVALS_PRESENT: '存在未复核区间',
  REVIEWED_SCOPE_INCOMPLETE: '复核范围不完整',
  RUN_COVERAGE_MISMATCH: '复核覆盖范围与记录不匹配',
  MISSING_BEFORE_RUNS: '缺少基线记录',
  MISSING_AFTER_RUNS: '缺少改后记录',
  INSUFFICIENT_RUNS_PER_PHASE: '每个阶段至少需要 3 个可比记录',
  MISSING_RUN_METRIC: '至少一个记录没有可用指标',
  INCOMPARABLE_RUN: '存在不可比记录',
  SIGNATURE_MISMATCH: '工作单元签名不同',
  OBSERVABILITY_SHIFT: '前后可见性发生变化',
  GUARDRAIL_NOT_OK: '保护条件尚未确认或已经恶化',
  STALE_METRIC: '指标已经过期',
  COVERAGE_ZONE_REGISTRY_MISMATCH: '区域几何已变化，需要重新确认复核覆盖范围',
  ZONE_REGISTRY_MISMATCH: '区域版本与当前记录不匹配',
  UNKNOWN_ZONE: '观察引用了未知区域',
  INVALID_OBSERVATION_PAYLOAD: '观察 payload 不满足 runtime invariant',
  CROSS_FIXTURE_OBSERVATION: '观察来自另一夹具',
  CROSS_ASSET_OBSERVATION: '观察来自另一 source asset',
  DUPLICATE_RUN_METRIC: '同一记录出现重复指标',
  DUPLICATE_METRIC_ID: '指标 ID 重复',
  METRIC_RUN_MISMATCH: '指标与记录/原始来源不匹配',
  METRIC_PHASE_MISMATCH: '指标阶段不匹配',
  METRIC_SIGNATURE_MISMATCH: '指标工作单元签名不匹配',
  METRIC_OBSERVABILITY_MISMATCH: '指标可见性状态不匹配',
  METRIC_TRACE_INCOMPLETE: '指标缺少完整 trace',
  SYNTHETIC_SOURCE_LABEL_MISMATCH: '独立原始来源与复核标签不一致',
  WORKSPACE_FIXTURE_INTEGRITY_MISMATCH: '夹具、会话、schema 或来源声明不一致',
}

export function labelBlocker(blocker: string): string {
  return blockerLabel[blocker] ?? blocker
}

export function displayObservationId(id: string): string {
  const tail = id.split(':').at(-1) ?? id
  const eventMatch = /^event-(\d+)$/.exec(tail)
  if (eventMatch?.[1]) return `E${eventMatch[1].padStart(2, '0')}`
  if (tail === 'low-confidence') return 'LC01'
  return tail.length <= 8 ? tail : tail.slice(0, 8)
}
