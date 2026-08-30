import {
  Check,
  PencilSimple,
  Prohibit,
  Question,
  Warning,
  X,
} from '@phosphor-icons/react'
import type { ObservationState } from '../domain'
import { eventStateLabel } from '../app/format'

const icons = {
  proposed: Warning,
  confirmed: Check,
  'edited-final': PencilSimple,
  rejected: X,
  uncertain: Question,
  'edit-draft': PencilSimple,
} satisfies Record<ObservationState, typeof Check>

export function StatusMark({ state, lowConfidence = false }: { state: ObservationState; lowConfidence?: boolean }) {
  const Icon = lowConfidence && state === 'proposed' ? Prohibit : icons[state]
  const label = lowConfidence && state === 'proposed' ? '低置信候选' : eventStateLabel[state]
  return (
    <span className={`status-mark status-${state}${lowConfidence ? ' is-low-confidence' : ''}`}>
      <Icon aria-hidden="true" weight="bold" />
      {label}
    </span>
  )
}
