import type { CandidateObservation, RunRecord, ZoneDefinition } from '../../domain'

export interface AdapterInput {
  readonly fixtureId: string
  readonly run: RunRecord
  readonly zones: readonly ZoneDefinition[]
}

export interface ProposalResult {
  readonly adapterId: string
  readonly status: 'disabled' | 'completed' | 'failed'
  readonly proposals: readonly CandidateObservation[]
  readonly reason?: string
}

export interface ModelAdapter {
  readonly id: string
  readonly mode: 'null' | 'local-candidate'
  propose(input: AdapterInput): Promise<ProposalResult>
  dispose(): void
}
