import type { ChatMessage } from '../llm/llm-provider'
import { createAssistantMessage, type Message } from '../message-types'

export interface CompressionBaselineState {
  summary: string
  cutoffTimestamp: number
}

export interface ShouldCallLLMSummaryInput {
  droppedGroups: number
  droppedContent: string
  convertCallCount: number
  lastSummaryConvertCall: number
  minDroppedGroups: number
  minDroppedContentChars: number
  minIntervalConvertCalls: number
}

export function createHeuristicSummary(
  droppedContent: string,
  maxSummaryTokens: number,
  compressedMemoryPrefix: string
): string {
  const lines = droppedContent
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const userGoals: string[] = []
  const decisions: string[] = []
  const files: string[] = []
  const toolFindings: string[] = []

  for (const line of lines) {
    if (line.startsWith('User:') && userGoals.length < 10) {
      userGoals.push(line.slice(5).trim())
    } else if (line.startsWith('Assistant:') && decisions.length < 10) {
      decisions.push(line.slice(10).trim().slice(0, 500))
    } else if (line.startsWith('Tool result:') && toolFindings.length < 8) {
      toolFindings.push(line.slice(12).trim().slice(0, 400))
    }
  }

  const parts: string[] = [compressedMemoryPrefix]
  if (userGoals.length > 0) {
    parts.push('**User Goal**: ' + userGoals[userGoals.length - 1]) // Most recent goal first
  }
  if (decisions.length > 0) {
    parts.push('**Key Decisions**:')
    decisions.slice(-5).forEach((d) => parts.push(`- ${d}`))
  }
  if (files.length > 0) {
    parts.push('**Files**: ' + files.join(', '))
  }
  if (toolFindings.length > 0) {
    parts.push('**Tool Findings**:')
    toolFindings.slice(-5).forEach((f) => parts.push(`- ${f}`))
  }

  const roughMaxChars = Math.max(200, maxSummaryTokens * 3)
  const combined = parts.join('\n')
  if (combined.length <= roughMaxChars) return combined
  return combined.slice(0, roughMaxChars) + '\n...[truncated]'
}

export function injectSummaryMessage(
  messages: ChatMessage[],
  summary: string,
  compressedMemoryPrefix: string
): ChatMessage[] {
  const summaryMessage: ChatMessage = {
    role: 'assistant',
    content: `${compressedMemoryPrefix}\n${summary}`,
  }

  if (messages[0]?.role === 'system' && messages[1]) {
    return [messages[0], summaryMessage, ...messages.slice(1)]
  }
  return [summaryMessage, ...messages]
}

/**
 * Find cutoff timestamp for rebuilding context after compression.
 * We keep messages from the latest USER message onward.
 * The user's latest message must always be preserved so the agent knows what to do.
 */
export function getCompressionCutoffTimestamp(messages: Message[]): number | null {
  // Find the LAST (most recent) user message to use as the cutoff boundary.
  // We specifically look for 'user' role, not 'tool', because:
  // - Tool results come AFTER the user's message and should be summarizable
  // - The user's latest message must ALWAYS be preserved for the agent to know what to do
  // - Using a tool timestamp as cutoff would exclude the user's message on subsequent turns
  const boundary = [...messages].reverse().find((msg) => msg.role === 'user')
  return typeof boundary?.timestamp === 'number' ? boundary.timestamp : null
}

/**
 * Rebuild model input context from compression baseline:
 * [summary] + [messages at/after cutoff].
 */
export function applyCompressionBaseline(
  messages: Message[],
  baseline: CompressionBaselineState,
  compressedMemoryPrefix: string
): Message[] {
  const retained = messages.filter(
    (msg) => typeof msg.timestamp === 'number' && msg.timestamp >= baseline.cutoffTimestamp
  )

  if (retained.length === 0) {
    return messages
  }

  const summaryMessage = createAssistantMessage(
    `${compressedMemoryPrefix}\n${baseline.summary}`,
    undefined,
    undefined,
    null,
    'context_summary'
  )
  // Ensure summary stays before retained prompt boundary for stable ordering.
  summaryMessage.timestamp = Math.max(0, baseline.cutoffTimestamp - 1)
  return [summaryMessage, ...retained]
}

export function shouldCallLLMSummary(input: ShouldCallLLMSummaryInput): boolean {
  if (input.droppedGroups < input.minDroppedGroups) return false
  if (input.droppedContent.trim().length < input.minDroppedContentChars) return false
  if (input.convertCallCount - input.lastSummaryConvertCall < input.minIntervalConvertCalls) {
    return false
  }
  return true
}
