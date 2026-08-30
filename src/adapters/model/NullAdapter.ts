import type {
  AdapterInput,
  ModelAdapter,
  ProposalResult,
} from './ModelAdapter'

export class NullAdapter implements ModelAdapter {
  readonly id = 'null-adapter'
  readonly mode = 'null' as const

  async propose(_input: AdapterInput): Promise<ProposalResult> {
    void _input
    return Promise.resolve({
      adapterId: this.id,
      status: 'disabled',
      proposals: [],
      reason: 'MODEL_DISABLED',
    })
  }

  dispose(): void {
    // Deliberately empty. The adapter owns no model or external resource.
  }
}
