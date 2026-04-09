export interface ToolEnvelopeSuccess<T = unknown> {
  ok: true
  tool: string
  version: 2
  data: T
  meta?: Record<string, unknown>
}

export interface ToolEnvelopeError {
  code: string
  message: string
  retryable: boolean
  hint?: string
  details?: Record<string, unknown>
}

export interface ToolEnvelopeFailure {
  ok: false
  tool: string
  version: 2
  error: ToolEnvelopeError
  meta?: Record<string, unknown>
}

export type ToolEnvelopeV2<T = unknown> = ToolEnvelopeSuccess<T> | ToolEnvelopeFailure

export function toolOkJson<T>(
  tool: string,
  data: T,
  meta?: Record<string, unknown>
): string {
  const payload: ToolEnvelopeSuccess<T> = {
    ok: true,
    tool,
    version: 2,
    data,
    ...(meta ? { meta } : {}),
  }
  return JSON.stringify(payload)
}

export function toolErrorJson(
  tool: string,
  code: string,
  message: string,
  options?: {
    retryable?: boolean
    hint?: string
    details?: Record<string, unknown>
    meta?: Record<string, unknown>
  }
): string {
  const payload: ToolEnvelopeFailure = {
    ok: false,
    tool,
    version: 2,
    error: {
      code,
      message,
      retryable: options?.retryable ?? false,
      ...(options?.hint ? { hint: options.hint } : {}),
      ...(options?.details ? { details: options.details } : {}),
    },
    ...(options?.meta ? { meta: options.meta } : {}),
  }
  return JSON.stringify(payload)
}

export function isToolEnvelopeV2(value: unknown): value is ToolEnvelopeV2 {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ToolEnvelopeV2>
  if (candidate.version !== 2) return false
  if (typeof candidate.tool !== 'string') return false
  if (candidate.ok === true) return true
  if (candidate.ok === false) {
    return (
      !!candidate.error &&
      typeof candidate.error === 'object' &&
      typeof (candidate.error as { code?: unknown }).code === 'string' &&
      typeof (candidate.error as { message?: unknown }).message === 'string'
    )
  }
  return false
}
