export interface DomainError {
  readonly code: string
  readonly message: string
  readonly details?: Readonly<Record<string, string | number | boolean>>
}

export type DomainResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError }

export function ok<T>(value: T): DomainResult<T> {
  return { ok: true, value }
}

export function err(
  code: string,
  message: string,
  details?: Readonly<Record<string, string | number | boolean>>,
): DomainResult<never> {
  return details === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, details } }
}
