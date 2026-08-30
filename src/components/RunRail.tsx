import { CheckCircle, CircleNotch, Prohibit, WarningCircle } from '@phosphor-icons/react'
import type { FixtureBundle, Phase, RunMetricComputation } from '../domain'
import { evaluateCoverage } from '../domain'
import { phaseLabel } from '../app/format'

interface RunRailProps {
  readonly fixture: FixtureBundle
  readonly metrics: Readonly<Record<string, RunMetricComputation>>
  readonly selectedRunId: string
  readonly mode?: 'synthetic' | 'local' | undefined
  readonly reviewedRunIds?: readonly string[] | undefined
  readonly nextRunId?: string | null | undefined
  readonly onSelect: (runId: string) => void
}

export function RunRail({ fixture, metrics, selectedRunId, mode = 'synthetic', reviewedRunIds = [], nextRunId = null, onSelect }: RunRailProps) {
  return (
    <aside className="run-rail" aria-label="复盘记录列表">
      <div className="run-progress-summary">
        <strong>逐次检查</strong>
        <span>{reviewedRunIds.length} / {fixture.runs.length} 已查看</span>
      </div>
      {(['before', 'after'] as const).map((phase) => (
        <RunGroup
          key={phase}
          phase={phase}
          fixture={fixture}
          metrics={metrics}
          selectedRunId={selectedRunId}
          mode={mode}
          reviewedRunIds={reviewedRunIds}
          nextRunId={nextRunId}
          onSelect={onSelect}
        />
      ))}
    </aside>
  )
}

function RunGroup({ phase, fixture, metrics, selectedRunId, mode = 'synthetic', reviewedRunIds = [], nextRunId = null, onSelect }: RunRailProps & { readonly phase: Phase }) {
  const runs = fixture.runs.filter((run) => run.phase === phase)
  return (
    <section className="run-group" aria-labelledby={`run-group-${phase}`}>
      <h2 id={`run-group-${phase}`}>{phaseLabel[phase]}</h2>
      <div className="run-list" role="list">
        {runs.length === 0 ? <p className="compact-empty">尚未载入</p> : null}
        {runs.map((run) => {
          const coverage = fixture.coverages[run.id]
          const coverageEvaluation = coverage ? evaluateCoverage(coverage) : null
          const fullCoverage = coverageEvaluation?.ok === true && coverageEvaluation.value.status === 'full'
          const metric = metrics[run.id]
          const isSelected = selectedRunId === run.id
          const isExperienceReviewed = reviewedRunIds.includes(run.id)
          const isNext = nextRunId === run.id
          const isBlocked = run.comparability === 'incomparable' || run.observability !== 'stable' || metric?.status === 'blocked'
          const Icon = isBlocked ? Prohibit : fullCoverage ? CheckCircle : coverageEvaluation === null ? CircleNotch : WarningCircle
          return (
            <div key={run.id} role="listitem">
              <button
                type="button"
                data-run-id={run.id}
                className={`run-row${isSelected ? ' is-selected' : ''}${isNext ? ' is-next' : ''}`}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => onSelect(run.id)}
              >
                <Icon aria-hidden="true" weight="bold" />
                <span className="run-row-copy">
                  <strong>{run.label.replace('Before', '基线').replace('After', '改后')}</strong>
                  <span>
                    {isBlocked
                      ? '证据条件阻断'
                      : isExperienceReviewed
                        ? '体验已查看'
                        : fullCoverage
                          ? mode === 'synthetic' ? '合成证据已就绪' : '覆盖范围已标记'
                          : '覆盖范围未完成'}
                  </span>
                </span>
                <span className="run-order">{isNext ? '下一项' : String(run.order).padStart(2, '0')}</span>
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
