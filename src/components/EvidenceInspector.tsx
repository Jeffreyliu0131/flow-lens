import { Button } from '@radix-ui/themes'
import {
  ArrowCounterClockwise,
  Check,
  ClockCounterClockwise,
  Info,
  Question,
  Robot,
  X,
} from '@phosphor-icons/react'
import {
  getObservationState,
  type DomainSession,
  type ObservationPayload,
  type RunMetricComputation,
  type RunRecord,
  type SessionCommand,
  type ZoneDefinition,
} from '../domain'
import { displayObservationId, eventKindLabel, formatDuration, formatTime, labelBlocker } from '../app/format'
import { EditObservationDialog } from './EditObservationDialog'
import { StatusMark } from './StatusMark'
import { effectivePayload } from '../app/observationSelectors'
import { nextUiId } from '../app/idFactory'

interface EvidenceInspectorProps {
  readonly run: RunRecord
  readonly session: DomainSession
  readonly zones: readonly ZoneDefinition[]
  readonly selectedObservationId: string | null
  readonly metric?: RunMetricComputation | undefined
  readonly isRecomputing: boolean
  readonly canFinalizeCoverage: boolean
  readonly onSelectObservation: (observationId: string) => void
  readonly onDispatch: (command: SessionCommand, message: string) => boolean
  readonly onEdit: (observationId: string, payload: ObservationPayload) => boolean
  readonly onFinalizeCoverage: () => void
}

function commandMeta(prefix: string) {
  return { id: nextUiId(prefix), actorId: 'local-operator', atMs: Date.now() }
}

export function EvidenceInspector({ run, session, zones, selectedObservationId, metric, isRecomputing, canFinalizeCoverage, onSelectObservation, onDispatch, onEdit, onFinalizeCoverage }: EvidenceInspectorProps) {
  const records = Object.values(session.observations)
    .filter((record) => record.candidate.payload.source.runId === run.id)
    .sort((left, right) => effectivePayload(left).source.startMs - effectivePayload(right).source.startMs)
  const selected = selectedObservationId ? session.observations[selectedObservationId] : undefined
  const state = selected ? getObservationState(selected) : null
  const activePayload = selected ? effectivePayload(selected) : undefined
  const priorCanonical = selected?.revisions.filter(
    (revision) => revision.payload !== undefined && (revision.resultingState === 'confirmed' || revision.resultingState === 'edited-final') && revision.id !== selected.activeRevisionId,
  ).at(-1)
  const focusObservation = (observationId: string) => {
    window.setTimeout(() => {
      const row = [...document.querySelectorAll<HTMLButtonElement>('.evidence-list button[data-observation-id]')]
        .find((element) => element.dataset.observationId === observationId)
      row?.focus()
    }, 0)
  }
  const dispatchAndRestoreFocus = (command: SessionCommand, message: string) => {
    const succeeded = onDispatch(command, message)
    if (succeeded && 'observationId' in command) focusObservation(command.observationId)
    return succeeded
  }
  const finalizeCoverageAndRestoreFocus = () => {
    onFinalizeCoverage()
    window.setTimeout(() => {
      const runRow = [...document.querySelectorAll<HTMLButtonElement>('.run-row[data-run-id]')]
        .find((element) => element.dataset.runId === run.id)
      if (runRow !== undefined && runRow.getClientRects().length > 0) {
        runRow.focus()
        return
      }
      document.getElementById('inspector-title')?.focus()
    }, 0)
  }

  return (
    <aside className="panel inspector-panel" aria-labelledby="inspector-title">
      <div className="panel-heading inspector-heading">
        <div><p className="panel-label">观察与指标</p><h2 id="inspector-title" tabIndex={-1}>人工复核</h2></div>
        <span>{records.length} 条观察</span>
      </div>

      <div className="evidence-list" role="list" aria-label="观察列表">
        {records.length === 0 ? (
          <div className="inspector-empty"><p>尚未标注</p><span>这不是完整覆盖下的零事件。请从 timeline 新建观察。</span></div>
        ) : records.map((record) => {
          const recordState = getObservationState(record)
          const payload = effectivePayload(record)
          const zone = zones.find((candidate) => candidate.id === payload.zoneId)
          const lowConfidence = record.candidate.confidence !== undefined && record.candidate.confidence < 0.5
          return (
            <div key={record.candidate.id} role="listitem">
              <button
                type="button"
                data-observation-id={record.candidate.id}
                className={selectedObservationId === record.candidate.id ? 'is-selected' : ''}
                aria-current={selectedObservationId === record.candidate.id ? 'true' : undefined}
                onClick={() => onSelectObservation(record.candidate.id)}
              >
                <span className="evidence-id" title={record.candidate.id}>{displayObservationId(record.candidate.id)}</span>
                <span className="evidence-summary"><strong>{eventKindLabel[payload.eventKind]}</strong><span>{zone?.label ?? payload.zoneId} / {formatTime(payload.source.startMs)}</span></span>
                <StatusMark state={recordState} lowConfidence={lowConfidence} />
              </button>
            </div>
          )
        })}
      </div>

      {selected && state && activePayload ? (
        <section className="selected-evidence" aria-labelledby="selected-evidence-title">
          <div className="selected-evidence-header">
            <h3 id="selected-evidence-title">{eventKindLabel[activePayload.eventKind]}</h3>
            <StatusMark state={state} lowConfidence={selected.candidate.confidence !== undefined && selected.candidate.confidence < 0.5} />
          </div>
          {selected.candidate.confidence !== undefined && selected.candidate.confidence < 0.5 && state === 'proposed' ? (
            <div className="low-confidence-note" role="note"><Question aria-hidden="true" />低置信候选在你明确决定前不会进入指标。</div>
          ) : null}
          <dl className="evidence-facts">
            <div><dt>区域</dt><dd>{zones.find((zone) => zone.id === activePayload.zoneId)?.label ?? activePayload.zoneId}</dd></div>
            <div><dt>原始来源</dt><dd>{formatTime(activePayload.source.startMs)} - {formatTime(activePayload.source.endMs)}</dd></div>
            <div><dt>时长</dt><dd>{formatDuration(activePayload.source.endMs - activePayload.source.startMs)}</dd></div>
          </dl>
          <div className="evidence-actions">
            {state === 'proposed' ? (
              <>
                <Button className="button-primary" onClick={() => dispatchAndRestoreFocus({ type: 'confirm-observation', observationId: selected.candidate.id, ...commandMeta('confirm') }, '观察已由人工确认并进入待重算证据集。')}><Check aria-hidden="true" />确认并纳入指标</Button>
                <Button variant="soft" color="gray" onClick={() => dispatchAndRestoreFocus({ type: 'mark-uncertain', observationId: selected.candidate.id, reason: 'User marked uncertain', ...commandMeta('uncertain') }, '观察已标记不确定并排除在指标外。')}><Question aria-hidden="true" />标为不确定</Button>
                <Button variant="soft" color="gray" onClick={() => dispatchAndRestoreFocus({ type: 'reject-observation', observationId: selected.candidate.id, reason: 'User rejected proposal', ...commandMeta('reject') }, '候选已拒绝，历史保留且不进入指标。')}><X aria-hidden="true" />拒绝候选</Button>
              </>
            ) : null}
            {(state === 'confirmed' || state === 'edited-final') ? <EditObservationDialog record={selected} zones={zones} onSave={(payload) => {
              const succeeded = onEdit(selected.candidate.id, payload)
              if (succeeded) focusObservation(selected.candidate.id)
              return succeeded
            }} /> : null}
            {priorCanonical ? (
              <Button variant="soft" color="gray" onClick={() => dispatchAndRestoreFocus({ type: 'restore-revision', observationId: selected.candidate.id, targetRevisionId: priorCanonical.id, ...commandMeta('restore') }, '已恢复先前值并建立新的 revision。')}>
                <ArrowCounterClockwise aria-hidden="true" />撤销为新版本
              </Button>
            ) : null}
          </div>
          <details className="evidence-details">
            <summary><Info aria-hidden="true" />证据详情与修订记录</summary>
            <div className="adapter-boundary"><Robot aria-hidden="true" /><span>没有模型或自动视觉。候选适配器未启用，完整人工路径可用。</span></div>
            <dl className="evidence-facts is-technical">
              <div><dt>产生方式</dt><dd>{selected.candidate.producer === 'synthetic' ? '合成候选' : '人工创建'}</dd></div>
              <div><dt>当前 revision</dt><dd>{selected.activeRevisionId ?? '尚无最终 revision'}</dd></div>
            </dl>
            <div className="revision-history">
              <h4><ClockCounterClockwise aria-hidden="true" />修订历史（{selected.revisions.length}）</h4>
              <ol>
                {selected.revisions.map((revision) => <li key={revision.id}><span>{revision.action}</span><code>{revision.id}</code></li>)}
              </ol>
            </div>
          </details>
        </section>
      ) : null}

      <MetricSummary metric={metric} isRecomputing={isRecomputing} />
      {canFinalizeCoverage ? (
        <div className="coverage-action">
          <strong>复核覆盖范围还未满足全程指标</strong>
          <span>重新查看此记录后，可以确认 00:00 到结束都已检查。未知区间不能补成零。</span>
          <Button variant="soft" color="gray" onClick={finalizeCoverageAndRestoreFocus}>确认已检查完整原始来源</Button>
          <span>这只表示复核覆盖范围完整，不代表事件绝对正确。</span>
        </div>
      ) : null}
    </aside>
  )
}

function MetricSummary({ metric, isRecomputing }: { readonly metric?: RunMetricComputation | undefined; readonly isRecomputing: boolean }) {
  if (isRecomputing) {
    return <section className="metric-summary is-recomputing" aria-label="可复现的描述性指标" aria-live="polite"><Info aria-hidden="true" /><div><h3>正在重新计算</h3><p>旧指标不会作为当前输出显示。</p></div></section>
  }
  if (metric === undefined || metric.status === 'blocked') {
    return (
      <section className="metric-summary is-blocked" aria-label="可复现的描述性指标">
        <Info aria-hidden="true" />
        <div><h3>证据不足，暂无指标</h3><ul>{metric?.blockers.map((blocker) => <li key={blocker}>{labelBlocker(blocker)}</li>)}</ul></div>
      </section>
    )
  }
  return (
    <section className="metric-summary" aria-label="可复现的描述性指标">
      <div><span>确认次数</span><strong>{metric.metric.presenceCount}</strong></div>
      <div><span>确认时长</span><strong>{formatDuration(metric.metric.confirmedDurationMs)}</strong></div>
      <div><span>区域转换</span><strong>{metric.metric.transitionCount}</strong></div>
      <details className="metric-trace">
        <summary>查看规则与证据版本</summary>
        <p>仅使用最终确认事件。规则 {metric.metric.trace.ruleVersion} / coverage {metric.metric.trace.coverageVersion} / zone {metric.metric.trace.zoneGeometryFingerprint}</p>
      </details>
    </section>
  )
}
