/**
 * Context Manager - manages token window and message truncation.
 * Ensures messages fit within the LLM's context window while
 * preserving tool_call/tool_result pairs.
 *
 * Features:
 * - Token budget management
 * - Tool call/tool_result pair preservation
 * - Message summarization for long conversations
 * - Smart truncation with preserve important content
 */

import type { ChatMessage } from './llm/llm-provider'
import { estimateMessageTokens, estimateStringTokens } from './llm/token-counter'

export interface ContextManagerConfig {
  maxContextTokens: number
  /** Reserve tokens for the response */
  reserveTokens?: number
  /** System prompt (always included) */
  systemPrompt?: string
  /** Enable message summarization for long conversations */
  enableSummarization?: boolean
  /** Maximum number of message groups to keep */
  maxMessageGroups?: number
}

export interface TrimResult {
  messages: ChatMessage[]
  wasTruncated: boolean
  droppedGroups: number
}

/**
 * Summarization options for compressing old messages
 */
export interface SummarizationOptions {
  /** Whether to create summary of dropped messages */
  createSummary: boolean
  /** Summary prompt template */
  summaryPrompt?: string
  /** Maximum tokens for summary */
  maxSummaryTokens?: number
}

export class ContextManager {
  private maxTokens: number
  private reserveTokens: number
  private systemPrompt: string
  private enableSummarization: boolean
  private maxMessageGroups: number

  constructor(config: ContextManagerConfig) {
    this.maxTokens = config.maxContextTokens
    this.reserveTokens = config.reserveTokens ?? 4096
    this.systemPrompt = config.systemPrompt ?? ''
    this.enableSummarization = config.enableSummarization ?? false
    this.maxMessageGroups = config.maxMessageGroups ?? 50
  }

  /** Update system prompt */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt
  }

  /**
   * Trim messages to fit within token budget.
   * Strategy: Keep system prompt + recent messages, remove older ones.
   * Never split tool_call/tool_result pairs.
   *
   * @param messages - Full message history
   * @param options - Optional summarization settings
   * @returns Trimmed messages with metadata about truncation
   */
  trimMessages(messages: ChatMessage[], options?: SummarizationOptions): TrimResult {
    const budget = this.maxTokens - this.reserveTokens

    // System message always included
    const systemMessage: ChatMessage | null = this.systemPrompt
      ? { role: 'system', content: this.systemPrompt }
      : null

    const systemTokens = systemMessage ? estimateMessageTokens(systemMessage) : 0
    let availableTokens = budget - systemTokens

    if (availableTokens <= 0) {
      // System prompt alone exceeds budget - truncate it
      const truncatedPrompt = this.truncateToTokens(this.systemPrompt, budget - 100)
      return {
        messages: [{ role: 'system', content: truncatedPrompt }],
        wasTruncated: true,
        droppedGroups: 0,
      }
    }

    // Group messages: keep tool_calls and their results together
    const groups = this.groupMessages(messages)

    // Fill from newest to oldest
    const selectedGroups: ChatMessage[][] = []
    let usedTokens = 0
    let droppedGroups = 0

    for (let i = groups.length - 1; i >= 0; i--) {
      const group = groups[i]
      const groupTokens = group.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)

      if (usedTokens + groupTokens <= availableTokens) {
        selectedGroups.unshift(group)
        usedTokens += groupTokens
      } else {
        // Can't fit this group - count dropped
        droppedGroups++
      }
    }

    // If summarization is enabled and we dropped groups, create a summary
    let summaryMessage: ChatMessage | null = null
    if (this.enableSummarization && droppedGroups > 0 && options?.createSummary) {
      const droppedContent = this.extractDroppedContent(groups, selectedGroups)
      if (droppedContent.length > 0) {
        const summary = this.createSummary(
          droppedContent,
          options.summaryPrompt,
          options.maxSummaryTokens ?? 500
        )
        if (summary) {
          summaryMessage = {
            role: 'system',
            content: summary,
          }
        }
      }
    }

    // Build final message list
    const result: ChatMessage[] = []
    if (systemMessage) {
      result.push(systemMessage)
    }
    if (summaryMessage) {
      result.push(summaryMessage)
    }
    for (const group of selectedGroups) {
      result.push(...group)
    }

    return {
      messages: result,
      wasTruncated: droppedGroups > 0,
      droppedGroups,
    }
  }

  /**
   * Extract content from dropped groups for summarization
   */
  private extractDroppedContent(
    allGroups: ChatMessage[][],
    selectedGroups: ChatMessage[][]
  ): string {
    // Track selected message indices by counting from the end
    const selectedCount = selectedGroups.flat().length
    const totalCount = allGroups.flat().length
    const droppedCount = totalCount - selectedCount

    if (droppedCount <= 0) {
      return ''
    }

    // Extract key content from the last dropped messages
    const droppedMessages = allGroups.flat().slice(0, droppedCount).slice(-20) // Only summarize last 20 dropped messages

    // Extract key content from dropped messages
    const parts: string[] = []
    for (const msg of droppedMessages) {
      if (msg.role === 'user' && typeof msg.content === 'string') {
        parts.push(`User: ${msg.content.slice(0, 200)}`)
      } else if (msg.role === 'assistant' && typeof msg.content === 'string') {
        parts.push(`Assistant: ${msg.content.slice(0, 300)}`)
      } else if (msg.role === 'tool' && typeof msg.content === 'string') {
        parts.push(`Tool result: ${msg.content.slice(0, 200)}`)
      }
    }

    return parts.join('\n')
  }

  /**
   * Create a summary of dropped messages
   */
  private createSummary(droppedContent: string, customPrompt?: string, maxTokens?: number): string {
    const defaultPrompt = `Summarize the following conversation history concisely. Focus on:
1. Main topics discussed
2. Key decisions made
3. Important context for future conversation

Conversation:
${droppedContent}

Summary:`

    const prompt = customPrompt ?? defaultPrompt
    const estimatedTokens = estimateStringTokens(prompt)
    const targetTokens = maxTokens ?? 500

    if (estimatedTokens > targetTokens) {
      // Truncate the content more aggressively
      return this.truncateToTokens(droppedContent, targetTokens - 50)
    }

    return this.truncateToTokens(prompt, targetTokens)
  }

  /**
   * Group messages so that assistant messages with tool_calls
   * are kept together with their corresponding tool result messages.
   */
  private groupMessages(messages: ChatMessage[]): ChatMessage[][] {
    const groups: ChatMessage[][] = []
    let i = 0

    while (i < messages.length) {
      const msg = messages[i]

      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        // Start a group: assistant with tool_calls + all following tool results
        const group: ChatMessage[] = [msg]
        const toolCallIds = new Set(msg.tool_calls.map((tc) => tc.id))
        i++

        while (i < messages.length && messages[i].role === 'tool') {
          const toolMsg = messages[i]
          if (toolMsg.tool_call_id && toolCallIds.has(toolMsg.tool_call_id)) {
            group.push(toolMsg)
            i++
          } else {
            break
          }
        }

        groups.push(group)
      } else {
        // Single message group
        groups.push([msg])
        i++
      }
    }

    return groups
  }

  /** Truncate a string to approximately the given token count */
  private truncateToTokens(text: string, maxTokens: number): string {
    // Rough estimate: 3 chars per token
    const maxChars = maxTokens * 3
    if (text.length <= maxChars) return text
    return text.slice(0, maxChars) + '\n...[truncated]'
  }

  /** Estimate token count for current context */
  estimateContextTokens(messages: ChatMessage[]): number {
    const systemTokens = this.systemPrompt ? estimateStringTokens(this.systemPrompt) + 4 : 0
    const messageTokens = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
    return systemTokens + messageTokens + 3 // conversation overhead
  }

  /** Get current configuration */
  getConfig(): ContextManagerConfig {
    return {
      maxContextTokens: this.maxTokens,
      reserveTokens: this.reserveTokens,
      systemPrompt: this.systemPrompt,
      enableSummarization: this.enableSummarization,
      maxMessageGroups: this.maxMessageGroups,
    }
  }

  /** Update configuration at runtime */
  updateConfig(config: Partial<ContextManagerConfig>): void {
    if (config.maxContextTokens !== undefined) this.maxTokens = config.maxContextTokens
    if (config.reserveTokens !== undefined) this.reserveTokens = config.reserveTokens
    if (config.systemPrompt !== undefined) this.systemPrompt = config.systemPrompt
    if (config.enableSummarization !== undefined)
      this.enableSummarization = config.enableSummarization
    if (config.maxMessageGroups !== undefined) this.maxMessageGroups = config.maxMessageGroups
  }
}
