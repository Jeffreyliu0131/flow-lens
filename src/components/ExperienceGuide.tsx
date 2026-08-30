import {
  ArrowRight,
  Check,
  Circle,
  Flask,
  LockSimple,
  Warning,
} from '@phosphor-icons/react'
import { Button } from '@radix-ui/themes'

export type ExperienceGuideStepState =
  | 'complete'
  | 'current'
  | 'pending'
  | 'blocked'

export interface ExperienceGuideStep {
  readonly id: string
  readonly label: string
  readonly state: ExperienceGuideStepState
}

interface ExperienceGuideProps {
  readonly title: string
  readonly detail: string
  readonly progressText: string
  readonly steps: readonly ExperienceGuideStep[]
  readonly mode: 'synthetic' | 'local'
  readonly nextActionLabel?: string | undefined
  readonly onNextAction?: (() => void) | undefined
  readonly blockerText?: string | undefined
}

const stepIcon = {
  complete: Check,
  current: ArrowRight,
  pending: Circle,
  blocked: LockSimple,
} satisfies Record<ExperienceGuideStepState, typeof Check>

export function ExperienceGuide({
  title,
  detail,
  progressText,
  steps,
  mode,
  nextActionLabel,
  onNextAction,
  blockerText,
}: ExperienceGuideProps) {
  return (
    <section className="experience-guide" aria-labelledby="experience-guide-title">
      <div className="experience-guide-boundary">
        <Flask aria-hidden="true" weight="bold" />
        <div>
          <strong>
            {mode === 'synthetic'
              ? '当前是合成体验，所有数字都是示例'
              : '当前是本地单次原始来源复核，不能完成 3+3'}
          </strong>
          <span>差值只作描述，不能归因于改动，也不能证明效率或用户价值。</span>
        </div>
      </div>

      <div className="experience-guide-task">
        <span className="experience-progress">{progressText}</span>
        <div>
          <h1 id="experience-guide-title" tabIndex={-1}>{title}</h1>
          <p>{detail}</p>
        </div>
        {nextActionLabel && onNextAction ? (
          <Button className="button-primary guide-next-action" onClick={onNextAction}>
            {nextActionLabel}
            <ArrowRight aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <ol className="experience-steps" aria-label="体验进度">
        {steps.map((step) => {
          const Icon = stepIcon[step.state]
          return (
            <li
              key={step.id}
              className={`is-${step.state}`}
              aria-current={step.state === 'current' ? 'step' : undefined}
            >
              <Icon aria-hidden="true" weight="bold" />
              <span>{step.label}</span>
            </li>
          )
        })}
      </ol>

      {blockerText ? (
        <p className="experience-blocker" role="status">
          <Warning aria-hidden="true" weight="bold" />
          {blockerText}
        </p>
      ) : null}
    </section>
  )
}
