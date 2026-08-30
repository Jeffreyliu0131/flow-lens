import { useState } from 'react'
import { Button, RadioGroup, TextArea } from '@radix-ui/themes'
import {
  ArrowLeft,
  Check,
  Equals,
  Info,
  LockSimple,
  Warning,
  X,
} from '@phosphor-icons/react'
import {
  getActiveDecision,
  getActiveHypothesis,
  type DecisionOutcome,
  type FixtureBundle,
} from '../domain'
import type { DerivedEvidence } from '../app/derive'
import type { DomainSession } from '../domain'
import { formatDuration, labelBlocker, phaseLabel } from '../app/format'

interface ComparePanelProps {
  readonly fixture: FixtureBundle
  readonly session: DomainSession
  readonly derived: DerivedEvidence
  readonly reviewedRunCount?: number | undefined
  readonly totalRunCount?: number | undefined
  readonly onReturnToReview?: (() => void) | undefined
  readonly onHypothesis: (text: string) => boolean
  readonly onDecision: (outcome: DecisionOutcome) => boolean
}

interface EligibilityCheck {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly passed: boolean
}

const blockerGroups = {
  workUnit: ['INCOMPARABLE_RUN', 'SIGNATURE_MISMATCH', 'METRIC_SIGNATURE_MISMATCH'],
  observability: ['OBSERVABILITY_SHIFT', 'METRIC_OBSERVABILITY_MISMATCH'],
  guardrail: ['GUARDRAIL_NOT_OK'],
  source: ['SYNTHETIC_SOURCE_LABEL_MISMATCH'],
} as const

export function ComparePanel({
  fixture,
  session,
  derived,
  reviewedRunCount = fixture.runs.length,
  totalRunCount = fixture.runs.length,
  onReturnToReview,
  onHypothesis,
  onDecision,
}: ComparePanelProps) {
  const hypothesis = getActiveHypothesis(session)
  const historicalDecision = getActiveDecision(session)
  const [draft, setDraft] = useState(hypothesis?.text ?? '')
  const shown = derived.comparison.status === 'shown' && derived.claim !== undefined && derived.error === undefined
  const comparison = shown && derived.comparison.status === 'shown'
    ? derived.comparison.comparison
    : null
  const blockers = derived.comparison.status === 'blocked'
    ? derived.comparison.blockers
    : []
  const experienceReviewComplete = reviewedRunCount === totalRunCount && totalRunCount > 0
  const currentClaimFingerprint = derived.claim?.includedEvidenceFingerprint
  const decision =
    historicalDecision !== undefined &&
    hypothesis?.status === 'locked' &&
    historicalDecision.hypothesisVersionId === hypothesis.id &&
    historicalDecision.claimEvidenceFingerprint === currentClaimFingerprint
      ? historicalDecision
      : undefined
  const hasStaleDecision = historicalDecision !== undefined && decision === undefined
  const sourceScope = fixture.manifest.provenance === 'synthetic'
    ? '全部数字来自合成夹具，只用于检查体验和证据链'
    : '本地来源由用户声明且未验证，当前 1+1 不能形成有效 3+3'
  const runScope = fixture.manifest.provenance === 'synthetic' ? '合成记录' : '本地记录'
  const sourceCheckEvaluated = fixture.manifest.provenance === 'synthetic'

  const eligibility: readonly EligibilityCheck[] = (() => {
    const beforeCount = fixture.runs.filter((run) => run.phase === 'before').length
    const afterCount = fixture.runs.filter((run) => run.phase === 'after').length
    const everyMetricReady = fixture.runs.every(
      (run) => derived.metrics[run.id]?.status === 'computed',
    )
    const lacksBlocker = (group: readonly string[]) =>
      !group.some((blocker) => blockers.includes(blocker))
    return [
      {
        id: 'runs',
        label: '3 次基线 + 3 次改后',
        detail: `当前 ${beforeCount} 次基线、${afterCount} 次改后`,
        passed: beforeCount === 3 && afterCount === 3,
      },
      {
        id: 'coverage',
        label: '每个记录都有可复算指标',
        detail: everyMetricReady ? '确认事件、复核覆盖范围和规则 trace 齐全' : '至少一个记录的复核覆盖范围、区域版本或指标被阻断',
        passed: everyMetricReady,
      },
      {
        id: 'work-unit',
        label: '工作单元可比',
        detail: lacksBlocker(blockerGroups.workUnit) ? 'SKU、材料、起止和完成规则一致' : '工作单元签名或可比性不一致',
        passed: lacksBlocker(blockerGroups.workUnit),
      },
      {
        id: 'observability',
        label: '前后可见性稳定',
        detail: lacksBlocker(blockerGroups.observability) ? '没有可见性变化' : '拍摄可见性变化会制造假差值',
        passed: lacksBlocker(blockerGroups.observability),
      },
      {
        id: 'guardrail',
        label: '保护条件没有恶化或未知',
        detail: lacksBlocker(blockerGroups.guardrail) ? '列出的质量条件均为 ok' : '至少一个质量条件不满足',
        passed: lacksBlocker(blockerGroups.guardrail),
      },
      {
        id: 'source',
        label: '原始来源与复核标签一致',
        detail: !sourceCheckEvaluated
          ? '本地来源未经验证，未执行合成 source detector'
          : lacksBlocker(blockerGroups.source)
            ? '合成原始来源独立检查未发现错配'
            : '原始来源和复核标签不一致',
        passed: sourceCheckEvaluated && lacksBlocker(blockerGroups.source),
      },
    ]
  })()

  const canWriteHypothesis = shown && experienceReviewComplete

  return (
    <section className="compare-panel" aria-labelledby="compare-title">
      <div className="compare-heading">
        <div><p className="panel-label">基线与改后</p><h2 id="compare-title">先检查对比资格，再看描述性差值</h2></div>
        <span>{sourceScope}</span>
      </div>

      <section className="eligibility-section" aria-labelledby="eligibility-title">
        <div className="eligibility-heading">
          <div>
            <h3 id="eligibility-title">对比资格</h3>
            <p>以下条件互不补偿。任一失败都会阻断对比和用户决定。</p>
          </div>
          <span>{eligibility.filter((item) => item.passed).length} / {eligibility.length} 条通过</span>
        </div>
        <ol className="eligibility-list">
          {eligibility.map((item) => (
            <li key={item.id} className={item.passed ? 'is-passed' : 'is-blocked'}>
              {item.passed ? <Check aria-hidden="true" weight="bold" /> : <X aria-hidden="true" weight="bold" />}
              <div><strong>{item.label}</strong><span>{item.detail}</span></div>
            </li>
          ))}
        </ol>
      </section>

      {!experienceReviewComplete ? (
        <div className="experience-review-gate" role="status">
          <Info aria-hidden="true" />
          <div>
            <strong>先完成逐次体验检查</strong>
            <span>你已查看 {reviewedRunCount} / {totalRunCount} 个记录。这个进度不改变规范证据。</span>
          </div>
          {onReturnToReview ? <Button variant="soft" color="gray" onClick={onReturnToReview}><ArrowLeft aria-hidden="true" />返回复核</Button> : null}
        </div>
      ) : null}

      {comparison && experienceReviewComplete ? (
        <div className="comparison-result">
          <div className="claim-boundary is-prominent" role="note">
            <Equals aria-hidden="true" />
            <div>
              <h3>合成差值，不是改善结论</h3>
              <p>在列出的{runScope}、复核覆盖范围与规则版本下观察到差值。归因未建立。</p>
              <ul>
                <li>练习效应与观察效应仍可能存在。</li>
                <li>任务输入、拍摄可见性与工作节奏可能不同。</li>
                <li>没有用户价值、效率、成本或稳定改善结论。</li>
              </ul>
            </div>
          </div>
          <div className="comparison-measures">
            <Measure label="确认次数" before={comparison.presenceCount.before.median} after={comparison.presenceCount.after.median} difference={comparison.presenceCount.signedDifference} unit="次" synthetic={fixture.manifest.provenance === 'synthetic'} />
            <Measure label="确认时长" before={comparison.confirmedDurationMs.before.median / 1_000} after={comparison.confirmedDurationMs.after.median / 1_000} difference={comparison.confirmedDurationMs.signedDifference / 1_000} unit="秒" synthetic={fixture.manifest.provenance === 'synthetic'} />
            <Measure label="区域转换" before={comparison.transitionCount.before.median} after={comparison.transitionCount.after.median} difference={comparison.transitionCount.signedDifference} unit="次" synthetic={fixture.manifest.provenance === 'synthetic'} />
          </div>
          <details className="run-matrix-disclosure">
            <summary>查看 6 个记录的原始描述指标</summary>
            <div className="run-metric-matrix" aria-label="各记录指标">
              {fixture.runs.map((run) => {
                const metric = derived.metrics[run.id]
                return (
                  <article key={run.id} className={metric?.status === 'computed' ? '' : 'is-blocked'}>
                    <header><span>{phaseLabel[run.phase]} {run.order}</span><strong>{run.label}</strong></header>
                    {metric?.status === 'computed' ? (
                      <dl>
                        <div><dt>次数</dt><dd>{metric.metric.presenceCount}</dd></div>
                        <div><dt>时长</dt><dd>{formatDuration(metric.metric.confirmedDurationMs)}</dd></div>
                        <div><dt>转换</dt><dd>{metric.metric.transitionCount}</dd></div>
                      </dl>
                    ) : <p>{metric?.blockers.map(labelBlocker).join('；') || '暂无可用指标'}</p>}
                  </article>
                )
              })}
            </div>
          </details>
          <details className="included-evidence">
            <summary>查看 {comparison.includedMetrics.length} 个 exact metric trace</summary>
            <div>
              {comparison.includedMetrics.map((metric) => (
                <code key={metric.metricId}>{metric.runId} / {metric.metricId} / coverage {metric.coverageVersion} / rule {metric.ruleVersion} / zone {metric.zoneGeometryFingerprint}</code>
              ))}
            </div>
          </details>
        </div>
      ) : comparison === null ? (
        <div className="comparison-blocked" role="status">
          <Warning aria-hidden="true" />
          <div>
            <h3>对比已阻断</h3>
            <p>这不是负向结果，也不能补算为零。先修复下列证据条件：</p>
            <ul>{blockers.map((blocker) => <li key={blocker}>{labelBlocker(blocker)}</li>)}</ul>
            {derived.comparison.status === 'blocked' && derived.comparison.affectedRunIds.length > 0 ? (
              <p>受影响记录：{derived.comparison.affectedRunIds.join('、')}</p>
            ) : null}
          </div>
          {onReturnToReview ? <Button variant="soft" color="gray" onClick={onReturnToReview}><ArrowLeft aria-hidden="true" />返回复核</Button> : null}
        </div>
      ) : null}

      <div className="hypothesis-grid">
        <section aria-labelledby="hypothesis-title">
          <div className="subsection-heading"><LockSimple aria-hidden="true" /><h3 id="hypothesis-title">写下一项由你提出的可逆改动</h3></div>
          <p>系统不提供“最佳改动”。只写一项能在后续 run 中保留或撤销的变化。</p>
          <TextArea value={draft} onChange={(event) => setDraft(event.currentTarget.value)} aria-label="一项可逆改动" rows={3} disabled={!canWriteHypothesis} />
          <div className="hypothesis-actions">
            <Button className="button-primary" onClick={() => onHypothesis(draft)} disabled={!canWriteHypothesis || !draft.trim()}>锁定这项改动</Button>
            <span>{hypothesis?.status === 'locked' ? '已锁定当前版本' : canWriteHypothesis ? '等待你的输入' : '先完成上方条件'}</span>
          </div>
        </section>

        <section aria-labelledby="decision-title">
          <div className="subsection-heading"><Info aria-hidden="true" /><h3 id="decision-title">根据证据自己决定</h3></div>
          <p>三项选择没有推荐顺序。证据不足也是完整结果。</p>
          {hasStaleDecision ? (
            <p className="stale-decision-note" role="status">
              证据版本已变化。旧决定保留在历史中，请根据当前差值重新选择。
            </p>
          ) : null}
          <RadioGroup.Root
            value={decision?.outcome ?? null}
            onValueChange={(value) => onDecision(value as DecisionOutcome)}
            disabled={!shown || !experienceReviewComplete || hypothesis?.status !== 'locked'}
            className="decision-group"
            aria-label="用户对改动的决定"
          >
            <RadioGroup.Item value="keep">保留改动</RadioGroup.Item>
            <RadioGroup.Item value="revert">撤销改动</RadioGroup.Item>
            <RadioGroup.Item value="uncertain">证据不足，继续复录</RadioGroup.Item>
          </RadioGroup.Root>
          <p>修改已锁定的改动描述会建立新版本并清除旧决定。</p>
          {!shown || !experienceReviewComplete ? <span className="blocked-reason"><LockSimple aria-hidden="true" />证据或体验检查未完成，决定保持阻断</span> : null}
        </section>
      </div>
    </section>
  )
}

function Measure({
  label,
  before,
  after,
  difference,
  unit,
  synthetic,
}: {
  readonly label: string
  readonly before: number
  readonly after: number
  readonly difference: number
  readonly unit: string
  readonly synthetic: boolean
}) {
  const format = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2)
  return (
    <article>
      <span className="measure-source-label">{synthetic ? '合成示例' : '来源未验证'}</span>
      <h3>{label}</h3>
      <div className="measure-row"><span>基线中位数</span><strong>{format(before)} {unit}</strong></div>
      <div className="measure-row"><span>改后中位数</span><strong>{format(after)} {unit}</strong></div>
      <div className="measure-difference"><span>描述性差值（改后 - 基线）</span><strong>{difference > 0 ? '+' : ''}{format(difference)} {unit}</strong></div>
    </article>
  )
}
