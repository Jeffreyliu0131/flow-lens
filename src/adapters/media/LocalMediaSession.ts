import { err, ok, type DomainResult } from '../../domain/result'

export type MediaSlot = 'before' | 'after'

export interface ObjectUrlApi {
  create(file: File): string
  revoke(url: string): void
}

export interface LocalMediaHandle {
  readonly slot: MediaSlot
  readonly assetId: string
  readonly objectUrl: string
  readonly displayName: string
  readonly mediaType: string
}

export interface LocalMediaSnapshot {
  readonly before?: LocalMediaHandle
  readonly after?: LocalMediaHandle
}

export type AssetIdFactory = (slot: MediaSlot, file: File) => string

function defaultObjectUrlApi(): ObjectUrlApi {
  return {
    create(file) {
      return URL.createObjectURL(file)
    },
    revoke(url) {
      URL.revokeObjectURL(url)
    },
  }
}

let fallbackSequence = 0

function defaultAssetIdFactory(slot: MediaSlot, _file: File): string {
  void _file
  const randomId = globalThis.crypto?.randomUUID?.()
  fallbackSequence += 1
  const suffix = randomId ?? `session-${fallbackSequence}`
  return `local:${slot}:${suffix}`
}

export class LocalMediaSession {
  private readonly handles = new Map<MediaSlot, LocalMediaHandle>()

  constructor(
    private readonly objectUrls: ObjectUrlApi = defaultObjectUrlApi(),
    private readonly createAssetId: AssetIdFactory = defaultAssetIdFactory,
  ) {}

  set(slot: MediaSlot, file: File): DomainResult<LocalMediaHandle> {
    if (!file.type.startsWith('video/')) {
      return err('UNSUPPORTED_MEDIA_TYPE', 'Only local video fixtures are supported', {
        mediaType: file.type || 'unknown',
      })
    }

    let objectUrl: string
    try {
      objectUrl = this.objectUrls.create(file)
    } catch {
      return err('OBJECT_URL_CREATE_FAILED', 'The local video could not be opened')
    }

    const previous = this.handles.get(slot)
    const handle: LocalMediaHandle = {
      slot,
      assetId: this.createAssetId(slot, file),
      objectUrl,
      displayName: file.name,
      mediaType: file.type,
    }
    this.handles.set(slot, handle)
    if (previous !== undefined) this.objectUrls.revoke(previous.objectUrl)
    return ok(handle)
  }

  get(slot: MediaSlot): LocalMediaHandle | undefined {
    return this.handles.get(slot)
  }

  clear(slot: MediaSlot): void {
    const handle = this.handles.get(slot)
    if (handle === undefined) return
    this.objectUrls.revoke(handle.objectUrl)
    this.handles.delete(slot)
  }

  snapshot(): LocalMediaSnapshot {
    const before = this.handles.get('before')
    const after = this.handles.get('after')
    const snapshot: { before?: LocalMediaHandle; after?: LocalMediaHandle } = {}
    if (before !== undefined) snapshot.before = before
    if (after !== undefined) snapshot.after = after
    return snapshot
  }

  clearAll(): void {
    this.clear('before')
    this.clear('after')
  }

  dispose(): void {
    this.clearAll()
  }
}
