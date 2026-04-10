import { messagesToChatMessages, type ChatMessage } from '../llm/llm-provider'
import type { Message } from '../message-types'
import type { ContextManager } from '../context-manager'
import { isToolEnvelopeV2 } from '../tools/tool-envelope'

export interface ContextOverflowPayload {
  maxContextLimit: number
  reserveTokens: number
  inputBudget: number
  historyTokens: number
  toolResultTokens: number
  totalInputTokens: number
}

export interface EnsureLatestToolResultFitsContextInput {
  internalMessages: Message[]
  trimmedMessages: ChatMessage[]
  maxContextTokens: number
  reserveTokens: number
  contextManager: ContextManager
  estimateTokens: (messages: ChatMessage[]) => number
}

export interface TruncateLargeToolResultInput {
  rawResult: string
  toolName: string
  existingTokens: number
  maxContextTokens: number
  reserveTokens: number
  estimateTextTokens: (text: string) => number
}

export interface ExecuteToolWithTimeoutInput {
  toolName: string
  args: Record<string, unknown>
  timeoutMs: number | null
  runAbortSignal?: AbortSignal
  externalAbortSignal?: AbortSignal
  execute: (abortSignal: AbortSignal) => Promise<string>
}

export function coerceToolArgs(params: unknown): Record<string, unknown> {
  if (params == null) return {}
  if (typeof params === 'object' && !Array.isArray(params)) {
    return params as Record<string, unknown>
  }
  throw new Error('invalid_arguments: Tool arguments must be a JSON object')
}

export async function executeToolWithTimeout(input: ExecuteToolWithTimeoutInput): Promise<string> {
  const timeoutController = new AbortController()
  const cleanupListeners: Array<() => void> = []

  const attachAbort = (signal: AbortSignal | undefined) => {
    if (!signal) return
    const onAbort = () => timeoutController.abort()
    signal.addEventListener('abort', onAbort)
    cleanupListeners.push(() => signal.removeEventListener('abort', onAbort))
    if (signal.aborted) timeoutController.abort()
  }

  attachAbort(input.runAbortSignal)
  attachAbort(input.externalAbortSignal)

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let didTimeout = false
  const timeoutPromise =
    typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
      ? new Promise<string>((_, reject) => {
          const timeoutMs = input.timeoutMs as number
          timeoutId = setTimeout(() => {
            didTimeout = true
            reject(new Error(`Tool "${input.toolName}" timed out after ${timeoutMs}ms`))
            timeoutController.abort()
          }, timeoutMs)
        })
      : null

  const abortPromise = new Promise<string>((_, reject) => {
    if (timeoutController.signal.aborted) {
      reject(
        new Error(
          didTimeout
            ? `Tool "${input.toolName}" timed out after ${input.timeoutMs}ms`
            : `Tool "${input.toolName}" was aborted`
        )
      )
      return
    }
    const onAbort = () =>
      reject(
        new Error(
          didTimeout
            ? `Tool "${input.toolName}" timed out after ${input.timeoutMs}ms`
            : `Tool "${input.toolName}" was aborted`
        )
      )
    timeoutController.signal.addEventListener('abort', onAbort, { once: true })
    cleanupListeners.push(() => timeoutController.signal.removeEventListener('abort', onAbort))
  })

  try {
    const racers: Array<Promise<string>> = [input.execute(timeoutController.signal), abortPromise]
    if (timeoutPromise) {
      racers.push(timeoutPromise)
    }
    return await Promise.race(racers)
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    for (const cleanup of cleanupListeners) cleanup()
  }
}

export function buildContextOverflowError(payload: ContextOverflowPayload): Error {
  return new Error(
    JSON.stringify({
      error: 'context_overflow',
      message:
        'Tool result is too large for current model context. Use filters like max_results, glob, or start_line to limit the output size.',
      modelContextLimit: payload.maxContextLimit,
      reserveTokens: payload.reserveTokens,
      inputBudget: payload.inputBudget,
      historyTokens: payload.historyTokens,
      toolResultTokens: payload.toolResultTokens,
      totalInputTokens: payload.totalInputTokens,
      suggestion: 'For search: use max_results parameter. For read: use start_line and line_count parameters.',
    })
  )
}

export function ensureLatestToolResultFitsContext(input: EnsureLatestToolResultFitsContextInput): ChatMessage[] {
  const latestTool = [...input.internalMessages].reverse().find((msg) => msg.role === 'tool')
  if (!latestTool || !latestTool.toolCallId) return input.trimmedMessages

  const toolStillIncluded = input.trimmedMessages.some(
    (msg) =>
      msg.role === 'tool' &&
      msg.tool_call_id === latestTool.toolCallId &&
      typeof msg.content === 'string' &&
      msg.content === latestTool.content
  )
  if (toolStillIncluded) return input.trimmedMessages

  const allMessages = messagesToChatMessages(input.internalMessages)
  const historyOnlyMessages = messagesToChatMessages(
    input.internalMessages.filter((msg) => msg.id !== latestTool.id)
  )
  const totalInputTokens = input.estimateTokens(allMessages)
  const historyTokens = input.estimateTokens(historyOnlyMessages)
  const toolResultTokens = Math.max(0, totalInputTokens - historyTokens)
  const inputBudget = Math.max(1, input.maxContextTokens - input.reserveTokens)

  // First fallback: degrade the latest tool result to a compact summary message,
  // then retry trimming without summary generation.
  const degradedToolContent = JSON.stringify({
    tool_result_truncated: true,
    toolCallId: latestTool.toolCallId,
    toolName: latestTool.name,
    originalToolTokens: toolResultTokens,
    note: 'too_large',
  })

  const degradedInternalMessages = input.internalMessages.map((msg) =>
    msg.id === latestTool.id ? { ...msg, content: degradedToolContent } : msg
  )
  const retrimmedMessages = input.contextManager.trimMessages(
    messagesToChatMessages(degradedInternalMessages),
    { createSummary: false }
  ).messages

  const degradedToolIncluded = retrimmedMessages.some(
    (msg) =>
      msg.role === 'tool' &&
      msg.tool_call_id === latestTool.toolCallId &&
      typeof msg.content === 'string' &&
      msg.content === degradedToolContent
  )
  if (degradedToolIncluded) {
    return retrimmedMessages
  }

  // If even degraded content cannot fit, fail explicitly.
  throw buildContextOverflowError({
    maxContextLimit: input.maxContextTokens,
    reserveTokens: input.reserveTokens,
    inputBudget,
    historyTokens,
    toolResultTokens,
    totalInputTokens,
  })
}

export function truncateLargeToolResult(input: TruncateLargeToolResultInput): string {
  // 计算工具结果的最大可用预算（总预算 - 现有消息 - 预留）
  // 额外留 10% 余量防止估算误差
  const availableForTool = Math.max(
    1000, // 最少给 1000 tokens
    (input.maxContextTokens - input.reserveTokens - input.existingTokens) * 0.9
  )

  // 如果工具结果本身就在预算内，不需要截断
  const estimatedResultTokens = input.estimateTextTokens(input.rawResult)
  if (estimatedResultTokens <= availableForTool) {
    return input.rawResult
  }

  console.warn(
    `[AgentLoop] Tool result too large for context: result=${estimatedResultTokens}, available=${Math.floor(availableForTool)}, tool=${input.toolName}`
  )

  // 尝试解析 JSON 以进行智能截断
  const trimmed = input.rawResult.trim()
  try {
    const parsed = JSON.parse(trimmed) as unknown

    // 特殊处理 search 工具的结果
    const searchPayload =
      input.toolName === 'search' && isToolEnvelopeV2(parsed) && parsed.ok
        ? parsed.data
        : parsed
    if (
      input.toolName === 'search' &&
      searchPayload &&
      typeof searchPayload === 'object' &&
      'results' in searchPayload &&
      'totalMatches' in searchPayload &&
      Array.isArray((searchPayload as { results?: unknown[] }).results)
    ) {
      const searchResult = searchPayload as {
        results: Array<{
          path: string
          line: number
          match: string
          column?: number
          preview?: string
        }>
        totalMatches: number
        scannedFiles?: number
        truncated?: boolean
        message?: string
      }

      // 二分查找最大可容纳的结果数量（包含 0 条结果）
      let left = 0
      let right = Math.min(searchResult.results.length, 200) // 最多 200 条
      let bestCount = 0
      const emptySearchSummary = {
        ...searchResult,
        results: [],
        truncated: true,
        originalTotalMatches: searchResult.totalMatches,
        message: `Found ${searchResult.totalMatches} matches in ${searchResult.scannedFiles || 0} files. Results too large to display. Use filters like glob, path, or reduce search scope.`,
      }
      let bestResult: Record<string, unknown> =
        input.toolName === 'search' && isToolEnvelopeV2(parsed) && parsed.ok
          ? { ...parsed, data: emptySearchSummary }
          : emptySearchSummary

      while (left <= right) {
        const mid = Math.floor((left + right) / 2)
        const testResults = searchResult.results.slice(0, mid).map((hit) => ({
          path: hit.path,
          line: hit.line,
          match: hit.match,
        }))

        const testResult = {
          ...searchResult,
          results: testResults,
          truncated: true,
          originalTotalMatches: searchResult.totalMatches,
          message: `Found ${searchResult.totalMatches} matches in ${searchResult.scannedFiles || 0} files. Showing first ${testResults.length} results.`,
        }

        const candidateResult =
          input.toolName === 'search' && isToolEnvelopeV2(parsed) && parsed.ok
            ? { ...parsed, data: testResult }
            : testResult

        const testTokens = input.estimateTextTokens(JSON.stringify(candidateResult))

        if (testTokens <= availableForTool) {
          bestCount = testResults.length
          bestResult =
            input.toolName === 'search' && isToolEnvelopeV2(parsed) && parsed.ok
              ? { ...parsed, data: testResult }
              : testResult
          left = mid + 1
        } else {
          right = mid - 1
        }
      }

      // 如果一条都放不下，只返回摘要
      if (bestCount === 0) {
        return JSON.stringify(bestResult)
      }

      return JSON.stringify(bestResult)
    }

    // 其他 JSON 结果，简单截断
    const truncateRatio = availableForTool / estimatedResultTokens
    const truncateAt = Math.floor(input.rawResult.length * truncateRatio * 0.8)
    return (
      input.rawResult.slice(0, truncateAt) +
      `\n\n... [Result truncated due to size: ${estimatedResultTokens} tokens, available ${Math.floor(availableForTool)} tokens. Use filters to reduce output.]`
    )
  } catch {
    // 非 JSON 结果，直接截断
    const truncateRatio = availableForTool / estimatedResultTokens
    const truncateAt = Math.floor(input.rawResult.length * truncateRatio * 0.8)
    return (
      input.rawResult.slice(0, truncateAt) +
      `\n\n... [Result truncated due to size: ${estimatedResultTokens} tokens, available ${Math.floor(availableForTool)} tokens. Use filters to reduce output.]`
    )
  }
}

export function normalizeToolResult(
  rawResult: string
): { content: string; details: Record<string, unknown>; isError: boolean } {
  const details: Record<string, unknown> = { raw: rawResult }
  const trimmed = rawResult.trim()
  if (!trimmed) {
    return { content: '', details, isError: false }
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    details.parsed = parsed
    if (isToolEnvelopeV2(parsed)) {
      details.tool = parsed.tool
      details.version = parsed.version
      if (!parsed.ok) {
        details.errorCode = parsed.error.code
        details.error = parsed.error.message
        return {
          content: `Error [${parsed.error.code}]: ${parsed.error.message}`,
          details,
          isError: true,
        }
      }
      return { content: rawResult, details, isError: false }
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      typeof (parsed as { error?: unknown }).error === 'string'
    ) {
      const errorMessage = (parsed as { error: string }).error
      details.error = errorMessage
      return { content: `Error: ${errorMessage}`, details, isError: true }
    }
  } catch {
    // Non-JSON output is a valid tool result.
  }

  const isError = /^error:/i.test(trimmed)
  return {
    content: rawResult,
    details,
    isError,
  }
}
