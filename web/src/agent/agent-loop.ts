/**
 * Agent Loop - orchestrates the LLM conversation with tool calling.
 *
 * Flow:
 * 1. User message → inject skills and MCP services into system prompt
 * 2. ContextManager trims to token window
 * 3. Call LLM (streaming) with tools
 * 4. If tool_calls → execute tools → append results → loop
 * 5. If stop → return final response
 * 6. Max 20 iterations
 */

import { produce } from 'immer'
import { messagesToChatMessages } from './llm/llm-provider'
import type { ToolContext } from './tools/tool-types'
import type { Message, ToolCall } from './message-types'
import { createAssistantMessage } from './message-types'
import { ContextManager } from './context-manager'
import { ToolRegistry } from './tool-registry'
import { UNIVERSAL_SYSTEM_PROMPT } from './prompts/universal-system-prompt'
import { agentLoopContinue, type AgentTool, type StreamFn } from '@mariozechner/pi-agent-core'
import type { AgentEvent as PiAgentEvent } from '@mariozechner/pi-agent-core'
import type {
  AssistantMessageEvent as PiAssistantMessageEvent,
  ToolResultMessage as PiToolResultMessage,
} from '@mariozechner/pi-ai'
import { streamSimple as piAiStreamSimple } from '@mariozechner/pi-ai'
import { PiAIProvider } from './llm/pi-ai-provider'
import { useSettingsStore } from '@/store/settings.store'
import { type AgentMode } from './agent-mode'
import {
  applyCompressionBaseline,
  createHeuristicSummary,
  getCompressionCutoffTimestamp,
  injectSummaryMessage,
  shouldCallLLMSummary,
  type CompressionBaselineState,
} from './loop/context-compression'
import { buildAgentTools } from './loop/build-agent-tools'
import { buildRuntimeEnhancedPrompt, triggerPrefetchForMessages } from './loop/enhancements'
import { extractTextContent, internalToPiMessages, piToInternalMessage } from './loop/message-mappers'
import {
  buildContextOverflowError,
  ensureLatestToolResultFitsContext,
} from './loop/tool-execution'
import type { AgentCallbacks, AgentLoopConfig, CompressionSummaryMode } from './loop/types'

export type {
  AfterToolCallHookContext,
  AfterToolCallHookResult,
  AgentCallbacks,
  AgentLoopConfig,
  BeforeToolCallHookContext,
  BeforeToolCallHookResult,
  CompressionSummaryMode,
} from './loop/types'

const MAX_ITERATIONS = 20
const DEFAULT_SYSTEM_PROMPT = UNIVERSAL_SYSTEM_PROMPT
const DEFAULT_TOOL_TIMEOUT = 30000
const TOOL_TIMEOUT_EXEMPTIONS = new Set<string>(['run_workflow'])
const SUMMARY_MIN_DROPPED_GROUPS = 2
const SUMMARY_MIN_DROPPED_CONTENT_CHARS = 800
const SUMMARY_MIN_INTERVAL_CONVERT_CALLS = 8
/** After compression, ensure context usage is at or below this ratio of the input budget.
 *  Prevents repeated compression on successive convert calls. */
const COMPRESSION_TARGET_RATIO = 0.7
const CONTEXT_SUMMARY_SYSTEM_PROMPT = `You are compressing an earlier conversation into a dense memory snapshot. Another AI will continue from this summary, so you must preserve:

1. **User's goals and intentions** - what the user was trying to accomplish
2. **Key decisions made** - architectural choices, file changes, tool selections
3. **Important constraints** - requirements, limits, conventions being followed
4. **File paths and locations** - files created/modified/deleted, important references
5. **Tool findings and results** - search results, read file contents, critical outputs
6. **Unresolved tasks** - what still needs to be done, next steps, open questions
7. **Error context** - failures encountered and how they were addressed

Output format:
- Use bullet points for scanability
- Group by topic rather than chronologically
- Preserve specific names, paths, and numbers (don't generalize)
- Keep the most recent and relevant information
- Total output should be dense but complete - prefer specifics over vagaries

Example:
**User Goal**: Implement user authentication with JWT
**Decisions**: Use bcrypt for passwords, JWT with 24h expiry, store refresh tokens in httpOnly cookies
**Files**: src/auth/login.ts (new), src/auth/jwt.ts (new), src/middleware/auth.ts (modified)
**Progress**: Login endpoint complete, registration WIP, refresh token not yet implemented
**Errors**: CORS error on first attempt, resolved by adding credentials: 'include'`
const COMPRESSED_MEMORY_PREFIX = 'Earlier conversation summary:'

export class AgentLoop {
  private provider: PiAIProvider
  private toolRegistry: ToolRegistry
  private contextManager: ContextManager
  private toolContext: ToolContext
  private maxIterations: number
  private baseSystemPrompt: string
  private abortController: AbortController | null = null
  private sessionId?: string
  private onLoopComplete?: () => Promise<void>
  private toolExecutionTimeout: number
  private beforeToolCall?: AgentLoopConfig['beforeToolCall']
  private afterToolCall?: AgentLoopConfig['afterToolCall']
  private convertCallCount = 0
  private lastSummaryConvertCall = Number.NEGATIVE_INFINITY
  private mode: AgentMode

  constructor(config: AgentLoopConfig) {
    this.provider = config.provider
    this.toolRegistry = config.toolRegistry
    this.contextManager = config.contextManager
    this.toolContext = config.toolContext
    if (!this.toolContext.readFileState) {
      this.toolContext.readFileState = new Map()
    }
    this.maxIterations = config.maxIterations || MAX_ITERATIONS
    this.baseSystemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT
    this.sessionId = config.sessionId
    this.onLoopComplete = config.onLoopComplete
    this.toolExecutionTimeout = config.toolExecutionTimeout || DEFAULT_TOOL_TIMEOUT
    this.beforeToolCall = config.beforeToolCall
    this.afterToolCall = config.afterToolCall
    this.mode = config.mode || 'act'
    this.contextManager.setSystemPrompt(this.baseSystemPrompt)
  }

  /** Get current agent mode */
  getMode(): AgentMode {
    return this.mode
  }

  /** Set agent mode */
  setMode(mode: AgentMode): void {
    this.mode = mode
  }

  /** Update system prompt (e.g. when skills are injected) */
  setSystemPrompt(prompt: string): void {
    this.baseSystemPrompt = prompt
    this.contextManager.setSystemPrompt(prompt)
  }

  /** Cancel the current agent loop */
  cancel(): void {
    this.abortController?.abort()
  }

  private async generateContextSummaryWithLLM(
    droppedContent: string,
    maxSummaryTokens: number
  ): Promise<{ summary: string | null; mode: CompressionSummaryMode }> {
    try {
      const response = await this.provider.chat({
        messages: [
          { role: 'system', content: CONTEXT_SUMMARY_SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              'Summarize the following dropped conversation context. Keep it concise and actionable.\n\n' +
              droppedContent,
          },
        ],
        maxTokens: maxSummaryTokens,
        temperature: 0.1,
      })

      const summary = response.choices[0]?.message?.content?.trim()
      return { summary: summary || null, mode: 'llm' }
    } catch (error) {
      console.warn('[AgentLoop] LLM context summary failed, falling back to heuristic summary:', error)
      return {
        summary: createHeuristicSummary(droppedContent, maxSummaryTokens, COMPRESSED_MEMORY_PREFIX),
        mode: 'fallback',
      }
    }
  }

  private applyPiAssistantUpdate(
    event: PiAssistantMessageEvent,
    callbacks?: AgentCallbacks,
    onToolCallStart?: (toolCall: ToolCall) => void,
    toolCallIdByIndex?: Map<number, string>
  ): void {
    if (event.type === 'thinking_start') callbacks?.onReasoningStart?.()
    if (event.type === 'thinking_delta') callbacks?.onReasoningDelta?.(event.delta)
    if (event.type === 'thinking_end') callbacks?.onReasoningComplete?.(event.content)
    if (event.type === 'text_start') callbacks?.onContentStart?.()
    if (event.type === 'text_delta') callbacks?.onContentDelta?.(event.delta)
    if (event.type === 'text_end') callbacks?.onContentComplete?.(event.content)

    if (event.type === 'toolcall_start') {
      const partial = event.partial.content[event.contentIndex]
      if (partial?.type === 'toolCall') {
        toolCallIdByIndex?.set(event.contentIndex, partial.id)
        onToolCallStart?.({
          id: partial.id,
          type: 'function',
          function: { name: partial.name, arguments: JSON.stringify(partial.arguments || {}) },
        })
      }
    }
    if (event.type === 'toolcall_delta') {
      callbacks?.onToolCallDelta?.(event.contentIndex, event.delta, toolCallIdByIndex?.get(event.contentIndex))
    }
  }

  private async runWithPiAgentCore(
    messages: Message[],
    callbacks?: AgentCallbacks
  ): Promise<Message[]> {
    const signal = this.abortController?.signal
    if (!signal) return messages

    let allMessages = messages
    let shouldStopForElicitation = false
    let assistantMessageCount = 0
    let reachedMaxIterations = false
    let assistantMessageStarted = false
    let compressionBaseline: CompressionBaselineState | null = null
    const emittedToolCallSignatures = new Map<string, string>()
    const toolCallIdByIndex = new Map<number, string>()
    const toolCallArgsById = new Map<string, Record<string, unknown>>()
    const pendingToolCompletions = new Map<string, { toolCall: ToolCall; resultText: string }>()
    const model = this.provider.getModel()
    const apiKey = this.provider.getApiKey()

    const agentTools: AgentTool[] = buildAgentTools({
      toolRegistry: this.toolRegistry,
      mode: this.mode,
      callbacks,
      beforeToolCall: this.beforeToolCall,
      afterToolCall: this.afterToolCall,
      getAllMessages: () => allMessages,
      getAbortSignal: () => this.abortController?.signal,
      getToolContext: () => this.toolContext,
      setToolContext: (context) => {
        this.toolContext = context
      },
      provider: this.provider,
      contextManager: this.contextManager,
      toolExecutionTimeout: this.toolExecutionTimeout,
      toolTimeoutExemptions: TOOL_TIMEOUT_EXEMPTIONS,
      onElicitationDetected: () => {
        shouldStopForElicitation = true
        this.abortController?.abort()
      },
    })

    const context = {
      systemPrompt: this.contextManager.getConfig().systemPrompt || this.baseSystemPrompt,
      messages: internalToPiMessages(messages, model, COMPRESSED_MEMORY_PREFIX),
      tools: agentTools,
    }

    const streamFn = piAiStreamSimple as unknown as StreamFn

    // Read thinking settings from store
    const settingsState = useSettingsStore.getState()
    const reasoning = settingsState.enableThinking ? settingsState.thinkingLevel : undefined

    const loop = agentLoopContinue(
      context,
      {
        model,
        getApiKey: () => apiKey,
        maxTokens: model.maxTokens,
        reasoning,
        convertToLlm: async (agentMessages) => {
          this.convertCallCount++
          const internalMessagesRaw = agentMessages
            .map((m) => piToInternalMessage(m))
            .filter((m): m is Message => m !== null)
          const internalMessages = compressionBaseline
            ? applyCompressionBaseline(internalMessagesRaw, compressionBaseline, COMPRESSED_MEMORY_PREFIX)
            : internalMessagesRaw
          if (compressionBaseline) {
            console.info('[AgentLoop] Using compression baseline', {
              convertCallCount: this.convertCallCount,
              cutoffTimestamp: compressionBaseline.cutoffTimestamp,
              summaryChars: compressionBaseline.summary.length,
              rawMessageCount: internalMessagesRaw.length,
              effectiveMessageCount: internalMessages.length,
            })
          }
          const contextConfig = this.contextManager.getConfig()
          const maxContextTokens =
            contextConfig.maxContextTokens || this.provider.maxContextTokens || 128000
          const reserveTokens = contextConfig.reserveTokens ?? 0
          const inputBudget = Math.max(1, maxContextTokens - reserveTokens)
          const chatMessages = messagesToChatMessages(internalMessages)
          const preTrimTokens = this.provider.estimateTokens(chatMessages)
          const summaryTokenBudget = Math.min(
            2400,
            Math.max(500, Math.floor(maxContextTokens * 0.02))
          )
          const trimmedResult = this.contextManager.trimMessages(chatMessages, {
            createSummary: true,
            maxSummaryTokens: summaryTokenBudget,
            summaryStrategy: 'external',
          })
          let trimmed = trimmedResult.messages
          if (trimmedResult.droppedContent) {
            const droppedContent = trimmedResult.droppedContent
            const droppedGroups = trimmedResult.droppedGroups
            const droppedContentChars = droppedContent.length
            const preTrimUsagePercent = Math.max(0, Math.min(100, (preTrimTokens / inputBudget) * 100))
            const shouldSummarize = shouldCallLLMSummary({
              droppedGroups,
              droppedContent,
              convertCallCount: this.convertCallCount,
              lastSummaryConvertCall: this.lastSummaryConvertCall,
              minDroppedGroups: SUMMARY_MIN_DROPPED_GROUPS,
              minDroppedContentChars: SUMMARY_MIN_DROPPED_CONTENT_CHARS,
              minIntervalConvertCalls: SUMMARY_MIN_INTERVAL_CONVERT_CALLS,
            })
            console.info('[AgentLoop] Context compression triggered', {
              convertCallCount: this.convertCallCount,
              droppedGroups,
              droppedContentChars,
              shouldSummarize,
              preTrimTokens,
              inputBudget,
              reserveTokens,
              modelMaxTokens: maxContextTokens,
              preTrimUsagePercent: Number(preTrimUsagePercent.toFixed(2)),
              triggerThresholdPercent: 85,
              targetPercent: COMPRESSION_TARGET_RATIO * 100,
            })

            if (shouldSummarize) {
              callbacks?.onContextCompressionStart?.({ droppedGroups, droppedContentChars })
              const startedAt = Date.now()
              const { summary, mode } = await this.generateContextSummaryWithLLM(
                droppedContent,
                summaryTokenBudget
              )
              const latencyMs = Date.now() - startedAt
              if (summary) {
                this.lastSummaryConvertCall = this.convertCallCount
                const cutoffTimestamp = getCompressionCutoffTimestamp(internalMessagesRaw)
                if (typeof cutoffTimestamp === 'number') {
                  compressionBaseline = { summary, cutoffTimestamp }
                }
                trimmed = injectSummaryMessage(trimmed, summary, COMPRESSED_MEMORY_PREFIX)
                // First safety pass: summary injection must still fit the context budget.
                trimmed = this.contextManager.trimMessages(trimmed, { createSummary: false }).messages
                // Headroom enforcement: ensure post-compression usage is below the target ratio
                // so that we don't immediately re-trigger compression on the next few turns.
                const cfg = this.contextManager.getConfig()
                const budget = cfg.maxContextTokens - (cfg.reserveTokens ?? 0)
                const targetTokens = Math.floor(budget * COMPRESSION_TARGET_RATIO)
                const postTrimTokens = this.provider.estimateTokens(trimmed)
                if (postTrimTokens > targetTokens) {
                  trimmed = this.contextManager.trimMessagesToTarget(trimmed, targetTokens)
                }
              }
              const postCompressionTokens = this.provider.estimateTokens(trimmed)
              const postCompressionUsagePercent = Math.max(
                0,
                Math.min(100, (postCompressionTokens / inputBudget) * 100)
              )
              console.info('[AgentLoop] Context compression complete', {
                convertCallCount: this.convertCallCount,
                mode,
                droppedGroups,
                droppedContentChars,
                summaryChars: summary?.length || 0,
                compressionBaselineCutoff: compressionBaseline?.cutoffTimestamp ?? null,
                postCompressionTokens,
                inputBudget,
                postCompressionUsagePercent: Number(postCompressionUsagePercent.toFixed(2)),
                targetPercent: COMPRESSION_TARGET_RATIO * 100,
              })
              callbacks?.onContextCompressionComplete?.({
                mode,
                summary,
                droppedGroups,
                droppedContentChars,
                summaryChars: summary?.length || 0,
                latencyMs,
              })

              // Inject the summary into allMessages so it appears in the
              // conversation at the correct position (alongside other
              // assistant/tool messages in the current turn), rather than
              // being appended at the very end after the loop completes.
              if (summary) {
                const summaryMessage = createAssistantMessage(
                  `${COMPRESSED_MEMORY_PREFIX}\n${summary}`,
                  undefined,
                  undefined,
                  null,
                  'context_summary'
                )
                allMessages = produce(allMessages, (draft) => {
                  draft.push(summaryMessage)
                })
                callbacks?.onMessagesUpdated?.(allMessages)
              }
            } else {
              callbacks?.onContextCompressionComplete?.({
                mode: 'skip',
                summary: null,
                droppedGroups,
                droppedContentChars,
                summaryChars: 0,
                latencyMs: 0,
              })
              const postCompressionTokens = this.provider.estimateTokens(trimmed)
              const postCompressionUsagePercent = Math.max(
                0,
                Math.min(100, (postCompressionTokens / inputBudget) * 100)
              )
              console.info('[AgentLoop] Context compression complete', {
                convertCallCount: this.convertCallCount,
                mode: 'skip',
                droppedGroups,
                droppedContentChars,
                summaryChars: 0,
                postCompressionTokens,
                inputBudget,
                postCompressionUsagePercent: Number(postCompressionUsagePercent.toFixed(2)),
                targetPercent: COMPRESSION_TARGET_RATIO * 100,
              })
            }
          }

          // If the latest tool result can't survive compression, fail explicitly
          // instead of silently hiding it from the model.
          trimmed = ensureLatestToolResultFitsContext({
            internalMessages,
            trimmedMessages: trimmed,
            maxContextTokens,
            reserveTokens,
            contextManager: this.contextManager,
            estimateTokens: (messages) => this.provider.estimateTokens(messages),
          })

          const usedTokens = this.provider.estimateTokens(trimmed)
          if (usedTokens > inputBudget) {
            throw buildContextOverflowError({
              maxContextLimit: maxContextTokens,
              reserveTokens,
              inputBudget,
              historyTokens: usedTokens,
              toolResultTokens: 0,
              totalInputTokens: usedTokens,
            })
          }
          // Use the same denominator as ContextManager (input budget, not raw max)
          // so the reported percentage aligns with compression trigger thresholds.
          const usagePercent = Math.max(0, Math.min(100, (usedTokens / Math.max(1, inputBudget)) * 100))
          callbacks?.onContextUsageUpdate?.({
            usedTokens,
            // Report the effective input budget (M - R), not raw model context limit.
            maxTokens: inputBudget,
            reserveTokens,
            usagePercent,
          })

          return internalToPiMessages(
            trimmed.map((msg) => ({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              role: msg.role,
              content: msg.content,
              toolCalls: msg.tool_calls?.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.function.name, arguments: tc.function.arguments },
              })),
              toolCallId: msg.tool_call_id,
              name: msg.name,
              timestamp: Date.now(),
            })),
            model,
            COMPRESSED_MEMORY_PREFIX
          )
        },
      },
      signal,
      streamFn
    )

    const emitToolCallStartIfChanged = (toolCall: ToolCall) => {
      const signature = `${toolCall.function.name}:${toolCall.function.arguments}`
      const previous = emittedToolCallSignatures.get(toolCall.id)
      if (previous === signature) return
      emittedToolCallSignatures.set(toolCall.id, signature)
      callbacks?.onToolCallStart?.(toolCall)
    }

    try {
      for await (const event of loop) {
        const typedEvent = event as PiAgentEvent
        if (typedEvent.type === 'message_start' && typedEvent.message.role === 'assistant') {
          assistantMessageStarted = true
          callbacks?.onMessageStart?.()
        }

        if (typedEvent.type === 'message_update') {
          if (!assistantMessageStarted) {
            assistantMessageStarted = true
            callbacks?.onMessageStart?.()
          }
          this.applyPiAssistantUpdate(
            typedEvent.assistantMessageEvent,
            callbacks,
            (toolCall) => {
              emitToolCallStartIfChanged(toolCall)
            },
            toolCallIdByIndex
          )
        }

        if (typedEvent.type === 'tool_execution_start') {
          const args = (typedEvent.args || {}) as Record<string, unknown>
          toolCallArgsById.set(typedEvent.toolCallId, args)
          emitToolCallStartIfChanged({
            id: typedEvent.toolCallId,
            type: 'function',
            function: {
              name: typedEvent.toolName,
              arguments: JSON.stringify(args),
            },
          })
        }

        if (typedEvent.type === 'tool_execution_end') {
          const resultText = extractTextContent((typedEvent.result as PiToolResultMessage)?.content) || ''
          pendingToolCompletions.set(typedEvent.toolCallId, {
            toolCall: {
              id: typedEvent.toolCallId,
              type: 'function',
              function: {
                name: typedEvent.toolName,
                arguments: JSON.stringify(toolCallArgsById.get(typedEvent.toolCallId) || {}),
              },
            },
            resultText,
          })
        }

        if (typedEvent.type === 'message_end') {
          const mapped = piToInternalMessage(typedEvent.message)
          if (!mapped || mapped.role === 'user') continue
          if (mapped.role === 'assistant') {
            assistantMessageStarted = false
          }
          if (mapped.role === 'assistant') {
            assistantMessageCount++
            if (assistantMessageCount > this.maxIterations) {
              reachedMaxIterations = true
              break
            }
          }
          allMessages = produce(allMessages, (draft) => {
            draft.push(mapped)
          })
          callbacks?.onMessagesUpdated?.(allMessages)
          if (mapped.role === 'tool' && mapped.toolCallId) {
            const pending = pendingToolCompletions.get(mapped.toolCallId)
            if (pending) {
              callbacks?.onToolCallComplete?.(pending.toolCall, pending.resultText)
              pendingToolCompletions.delete(mapped.toolCallId)
            }
          }
        }
      }
    } catch (error) {
      if (signal.aborted) {
        callbacks?.onComplete?.(allMessages)
        return allMessages
      }
      throw error
    }

    for (const pending of pendingToolCompletions.values()) {
      callbacks?.onToolCallComplete?.(pending.toolCall, pending.resultText)
    }

    if (shouldStopForElicitation) {
      callbacks?.onComplete?.(allMessages)
      return allMessages
    }

    if (reachedMaxIterations) {
      callbacks?.onIterationLimitReached?.(this.maxIterations)
    }

    if (this.onLoopComplete) {
      try {
        await this.onLoopComplete()
      } catch (error) {
        console.warn('[AgentLoop] onLoopComplete callback failed:', error)
      }
    }

    callbacks?.onComplete?.(allMessages)
    return allMessages
  }

  /**
   * Run the agent loop with a list of messages.
   * Appends new assistant/tool messages and returns the full updated list.
   */
  async run(messages: Message[], callbacks?: AgentCallbacks): Promise<Message[]> {
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    // Phase 2 P1: Trigger predictive file loading before processing
    await triggerPrefetchForMessages(messages, this.toolContext, this.sessionId)

    // Inject matching skills and MCP services into system prompt
    const enhancedPrompt = await buildRuntimeEnhancedPrompt({
      baseSystemPrompt: this.baseSystemPrompt,
      messages,
      mode: this.mode,
      toolRegistry: this.toolRegistry,
      toolContext: this.toolContext,
      sessionId: this.sessionId,
    })
    this.contextManager.setSystemPrompt(enhancedPrompt)

    try {
      return await this.runWithPiAgentCore(messages, callbacks)
    } catch (error) {
      if (signal.aborted) {
        callbacks?.onComplete?.(messages)
        return messages
      }
      const err = error instanceof Error ? error : new Error(String(error))
      callbacks?.onError?.(err)
      throw err
    } finally {
      this.abortController = null
    }
  }
}
