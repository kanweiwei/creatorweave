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

import type { LLMProvider, TokenUsage } from './llm/llm-provider'
import { produce } from 'immer'
import { messagesToChatMessages } from './llm/llm-provider'
import type { ToolContext } from './tools/tool-types'
import type { Message, ToolCall, ToolResult, MessageUsage } from './message-types'
import { createAssistantMessage, createToolMessage } from './message-types'
import { ContextManager } from './context-manager'
import { ToolRegistry } from './tool-registry'
import { getSkillManager } from '@/skills/skill-manager'
import type { SkillMatchContext } from '@/skills/skill-types'
import { getMCPManager } from '@/mcp'
import {
  UNIVERSAL_SYSTEM_PROMPT,
  buildEnhancedSystemPrompt,
  shouldShowToolDiscovery,
  getToolDiscoveryMessage,
} from './prompts/universal-system-prompt'
// Phase 2: Intelligence enhancements
import { getIntelligenceCoordinator } from './intelligence-coordinator'
// Phase 2 P1: Predictive file loading
import { triggerPrefetch } from './prefetch'
import { agentLoopContinue, type AgentTool } from '@mariozechner/pi-agent-core'
import type {
  AgentEvent as PiAgentEvent,
  AgentMessage as PiAgentMessage,
} from '@mariozechner/pi-agent-core'
import type {
  AssistantMessageEvent as PiAssistantMessageEvent,
  Message as PiMessage,
  ToolResultMessage as PiToolResultMessage,
} from '@mariozechner/pi-ai'
import { PiAIProvider } from './llm/pi-ai-provider'

const MAX_ITERATIONS = 20
const DEFAULT_SYSTEM_PROMPT = UNIVERSAL_SYSTEM_PROMPT
const DEFAULT_TOOL_TIMEOUT = 30000

export interface AgentCallbacks {
  /** Called when a new assistant message starts */
  onMessageStart?: () => void
  /** Called when reasoning stream starts (first reasoning_content delta) */
  onReasoningStart?: () => void
  /** Called with streaming reasoning/thinking deltas (GLM-4.7+) */
  onReasoningDelta?: (delta: string) => void
  /** Called when reasoning stream completes (before content/tool_call starts) */
  onReasoningComplete?: (reasoning: string) => void
  /** Called when content stream starts (first content delta) */
  onContentStart?: () => void
  /** Called with streaming content deltas */
  onContentDelta?: (delta: string) => void
  /** Called when content streaming completes (before tool_call starts) */
  onContentComplete?: (content: string) => void
  /** Called when the LLM requests a tool call */
  onToolCallStart?: (toolCall: ToolCall) => void
  /** Called with streaming tool call argument deltas (tool_stream mode) */
  onToolCallDelta?: (index: number, argsDelta: string) => void
  /** Called when a tool execution completes */
  onToolCallComplete?: (toolCall: ToolCall, result: string) => void
  /** Called when messages are updated mid-loop (e.g. after assistant msg or tool result) */
  onMessagesUpdated?: (messages: Message[]) => void
  /** Called when the entire agent loop finishes */
  onComplete?: (messages: Message[]) => void
  /** Called on error */
  onError?: (error: Error) => void
  /**
   * Called when SEP-1306 binary elicitation is detected
   * The agent loop will be paused; caller should handle file upload
   * and resume the agent with the file metadata as a tool result.
   */
  onElicitation?: (elicitation: {
    mode: 'binary'
    message: string
    toolName: string
    args: Record<string, unknown>
    serverId: string
    toolCallId: string
  }) => void
  /** Called when a tool execution times out */
  onToolTimeout?: (toolCall: ToolCall) => void
}

export interface AgentLoopConfig {
  provider: LLMProvider
  toolRegistry: ToolRegistry
  contextManager: ContextManager
  toolContext: ToolContext
  systemPrompt?: string
  maxIterations?: number
  /** Optional session ID for memory tracking */
  sessionId?: string
  /** Callback when loop completes (before onComplete) - for side effects like refresh */
  onLoopComplete?: () => Promise<void>
  /** Tool execution timeout in milliseconds (default: 30000ms) */
  toolExecutionTimeout?: number
}

export class AgentLoop {
  private provider: LLMProvider
  private toolRegistry: ToolRegistry
  private contextManager: ContextManager
  private toolContext: ToolContext
  private maxIterations: number
  private baseSystemPrompt: string
  private abortController: AbortController | null = null
  private sessionId?: string
  private onLoopComplete?: () => Promise<void>
  private toolExecutionTimeout: number

  constructor(config: AgentLoopConfig) {
    this.provider = config.provider
    this.toolRegistry = config.toolRegistry
    this.contextManager = config.contextManager
    this.toolContext = config.toolContext
    this.maxIterations = config.maxIterations || MAX_ITERATIONS
    this.baseSystemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT
    this.sessionId = config.sessionId
    this.onLoopComplete = config.onLoopComplete
    this.toolExecutionTimeout = config.toolExecutionTimeout || DEFAULT_TOOL_TIMEOUT
    this.contextManager.setSystemPrompt(this.baseSystemPrompt)
  }

  /** Update system prompt (e.g. when skills are injected) */
  setSystemPrompt(prompt: string): void {
    this.baseSystemPrompt = prompt
    this.contextManager.setSystemPrompt(prompt)
  }

  /** Inject matching skills and MCP services into the system prompt */
  private async injectEnhancements(messages: Message[]): Promise<void> {
    // Extract user message for scenario detection (use the last user message)
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    const userMessage = lastUserMsg?.content || ''

    // Start with base system prompt, enhanced with scenario detection
    let enhancedPrompt = buildEnhancedSystemPrompt(this.baseSystemPrompt, userMessage)

    // Phase 2: Inject intelligent enhancements (tool recs, project fingerprint, memory)
    try {
      const coordinator = getIntelligenceCoordinator()
      const intelligenceResult = await coordinator.enhanceSystemPrompt(enhancedPrompt, {
        directoryHandle: this.toolContext.directoryHandle || undefined,
        userMessage,
        sessionId: this.sessionId,
      })

      enhancedPrompt = intelligenceResult.systemPrompt
    } catch (error) {
      console.warn('[AgentLoop] Failed to inject intelligence enhancements:', error)
      // Continue without intelligence enhancements
    }

    // Inject MCP services block AND register MCP tools
    try {
      const mcpManager = getMCPManager()
      await mcpManager.initialize()

      // Register MCP tools to ToolRegistry (must happen before getToolDefinitions)
      await this.toolRegistry.registerMCPTools()

      // Use MCPManager's built-in method
      const mcpBlock = mcpManager.getAvailableMCPServicesBlock()
      if (mcpBlock) {
        enhancedPrompt += '\n\n' + mcpBlock
      }
    } catch (error) {
      console.warn('[AgentLoop] Failed to inject MCP services:', error)
    }

    // Extract user message for skill matching
    if (lastUserMsg) {
      const context: SkillMatchContext = {
        userMessage: userMessage,
      }

      const skillManager = getSkillManager()
      const skillsBlock = skillManager.getEnhancedSystemPrompt('', context)
      if (skillsBlock) {
        enhancedPrompt += skillsBlock
      }
    }

    // Tool discovery: if user asks about capabilities, inject discovery message
    if (shouldShowToolDiscovery(userMessage)) {
      const discoveryMsg = getToolDiscoveryMessage(userMessage)
      if (discoveryMsg) {
        enhancedPrompt += '\n\n' + discoveryMsg
      }
    }

    this.contextManager.setSystemPrompt(enhancedPrompt)
  }

  /** Cancel the current agent loop */
  cancel(): void {
    this.abortController?.abort()
  }

  //=============================================================================
  // Phase 2 P1: Predictive File Loading
  //=============================================================================

  /**
   * Trigger prefetch if new user message is detected
   * This runs in background to load files before the agent needs them
   */
  private async triggerPrefetchIfNeeded(messages: Message[]): Promise<void> {
    // Find the last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUserMsg) return

    // Extract user message content for potential future use in prefetch prediction
    // Currently using recentMessages pattern, but individual message may be used for more targeted prediction
    // Void to avoid unused variable warning
    void (lastUserMsg.content || '')

    // Extract recent messages for context
    const recentMessages: string[] = []
    const recentFiles: string[] = []

    for (const msg of messages.slice(-10)) {
      if (msg.role === 'user') {
        recentMessages.push(msg.content || '')
      }
      // Extract file paths from tool calls
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.function.name === 'file_read') {
            try {
              const args = JSON.parse(tc.function.arguments)
              if (args.path) {
                recentFiles.push(args.path as string)
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    }

    // Get project type from intelligence coordinator
    let projectType = 'typescript'
    try {
      const coordinator = getIntelligenceCoordinator()
      if (this.toolContext.directoryHandle) {
        const detected = await coordinator.quickDetectProjectType(this.toolContext.directoryHandle)
        if (detected) {
          projectType = detected.type
        }
      }
    } catch {
      // Use default type
    }

    // Trigger prefetch in background (don't await)
    triggerPrefetch({
      directoryHandle: this.toolContext.directoryHandle,
      recentMessages,
      recentFiles,
      projectType,
      activeFile: recentFiles[recentFiles.length - 1],
      sessionId: this.sessionId,
    }).catch((error) => {
      console.warn('[AgentLoop] Prefetch failed:', error)
    })
  }

  /** Execute tool with timeout protection to prevent hanging loops */
  private async executeToolWithTimeout(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number
  ): Promise<string> {
    return Promise.race([
      this.toolRegistry.execute(toolName, args, this.toolContext),
      new Promise<string>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  }

  private isPiProvider(provider: LLMProvider): provider is PiAIProvider {
    return provider instanceof PiAIProvider
  }

  private parseToolArgs(args: string): Record<string, unknown> {
    try {
      return JSON.parse(args)
    } catch {
      return {}
    }
  }

  private extractTextContent(content: unknown): string | null {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return null

    const text = content
      .filter((item): item is { type: string; text?: string; thinking?: string } => !!item)
      .map((item) => {
        if (item.type === 'text') return item.text || ''
        if (item.type === 'thinking') return item.thinking || ''
        return ''
      })
      .join('')
    return text || null
  }

  private internalToPiMessages(messages: Message[]): PiMessage[] {
    return messages.flatMap((msg): PiMessage[] => {
      if (msg.role === 'user') {
        return [
          {
            role: 'user',
            content: msg.content || '',
            timestamp: msg.timestamp || Date.now(),
          },
        ]
      }

      if (msg.role === 'assistant') {
        const content: Array<
          | { type: 'text'; text: string }
          | { type: 'thinking'; thinking: string }
          | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }
        > = []

        if (msg.content) {
          content.push({ type: 'text', text: msg.content })
        }
        if (msg.reasoning) {
          content.push({ type: 'thinking', thinking: msg.reasoning })
        }
        for (const toolCall of msg.toolCalls || []) {
          content.push({
            type: 'toolCall',
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: this.parseToolArgs(toolCall.function.arguments),
          })
        }

        return [
          {
            role: 'assistant',
            content,
            api: this.isPiProvider(this.provider) ? this.provider.getModel().api : 'openai-completions',
            provider: this.isPiProvider(this.provider)
              ? this.provider.getModel().provider
              : 'custom',
            model: this.isPiProvider(this.provider) ? this.provider.getModel().id : 'unknown',
            usage: {
              input: msg.usage?.promptTokens ?? 0,
              output: msg.usage?.completionTokens ?? 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: msg.usage?.totalTokens ?? 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: msg.timestamp || Date.now(),
          },
        ]
      }

      if (msg.role === 'tool') {
        return [
          {
            role: 'toolResult',
            toolCallId: msg.toolCallId || '',
            toolName: msg.name || 'tool',
            content: [{ type: 'text', text: msg.content || '' }],
            isError: msg.content?.startsWith('Error:') ?? false,
            timestamp: msg.timestamp || Date.now(),
          },
        ]
      }

      return []
    })
  }

  private piToInternalMessage(message: PiAgentMessage): Message | null {
    const now = Date.now()
    if (typeof message !== 'object' || !message || !('role' in message)) return null

    if (message.role === 'user') {
      return {
        id: `${now}-${Math.random().toString(36).slice(2, 9)}`,
        role: 'user',
        content: this.extractTextContent(message.content),
        timestamp: message.timestamp || now,
      }
    }

    if (message.role === 'assistant') {
      const text = message.content
        .filter((item) => !!item)
        .filter((item) => item.type === 'text')
        .map((item) => ('text' in item ? item.text || '' : ''))
        .join('')
      const reasoning = message.content
        .filter((item) => !!item)
        .filter((item) => item.type === 'thinking')
        .map((item) => ('thinking' in item ? item.thinking || '' : ''))
        .join('')
      const toolCalls: ToolCall[] = message.content
        .filter(
          (item): item is { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> } =>
            item.type === 'toolCall'
        )
        .map((item) => ({
          id: item.id,
          type: 'function',
          function: {
            name: item.name,
            arguments: JSON.stringify(item.arguments || {}),
          },
        }))

      return createAssistantMessage(
        text || null,
        toolCalls.length > 0 ? toolCalls : undefined,
        {
          promptTokens: message.usage?.input || 0,
          completionTokens: message.usage?.output || 0,
          totalTokens: message.usage?.totalTokens || 0,
        },
        reasoning || null
      )
    }

    if (message.role === 'toolResult') {
      const text = this.extractTextContent(message.content) || ''
      return createToolMessage({
        toolCallId: message.toolCallId,
        name: message.toolName,
        content: text,
      })
    }

    return null
  }

  private applyPiAssistantUpdate(event: PiAssistantMessageEvent, callbacks?: AgentCallbacks): void {
    if (event.type === 'thinking_start') callbacks?.onReasoningStart?.()
    if (event.type === 'thinking_delta') callbacks?.onReasoningDelta?.(event.delta)
    if (event.type === 'thinking_end') callbacks?.onReasoningComplete?.(event.content)
    if (event.type === 'text_start') callbacks?.onContentStart?.()
    if (event.type === 'text_delta') callbacks?.onContentDelta?.(event.delta)
    if (event.type === 'text_end') callbacks?.onContentComplete?.(event.content)

    if (event.type === 'toolcall_start') {
      const partial = event.partial.content[event.contentIndex]
      if (partial?.type === 'toolCall') {
        callbacks?.onToolCallStart?.({
          id: partial.id,
          type: 'function',
          function: { name: partial.name, arguments: JSON.stringify(partial.arguments || {}) },
        })
      }
    }
    if (event.type === 'toolcall_delta') {
      callbacks?.onToolCallDelta?.(event.contentIndex, event.delta)
    }
  }

  private async runWithPiAgentCore(
    messages: Message[],
    callbacks?: AgentCallbacks
  ): Promise<Message[]> {
    if (!this.isPiProvider(this.provider)) {
      return messages
    }

    const signal = this.abortController?.signal
    if (!signal) return messages

    let allMessages = messages
    let shouldStopForElicitation = false
    const model = this.provider.getModel()
    const apiKey = this.provider.getApiKey()

    const agentTools: AgentTool[] = this.toolRegistry.getToolDefinitions().map((toolDef) => ({
      name: toolDef.function.name,
      label: toolDef.function.name,
      description: toolDef.function.description || '',
      parameters: toolDef.function.parameters as never,
      execute: async (toolCallId, params) => {
        const args = (params || {}) as Record<string, unknown>
        const toolCall: ToolCall = {
          id: toolCallId,
          type: 'function',
          function: {
            name: toolDef.function.name,
            arguments: JSON.stringify(args),
          },
        }

        try {
          const result = await this.executeToolWithTimeout(
            toolDef.function.name,
            args,
            this.toolExecutionTimeout
          )

          let elicitationData: {
            mode: 'binary'
            message: string
            toolName: string
            args: Record<string, unknown>
            serverId: string
          } | null = null
          try {
            const parsedResult = JSON.parse(result)
            if (parsedResult._elicitation?.mode === 'binary') {
              elicitationData = parsedResult._elicitation
            }
          } catch {
            // non-json tool output
          }

          if (elicitationData && callbacks?.onElicitation) {
            shouldStopForElicitation = true
            callbacks.onElicitation({
              ...elicitationData,
              toolCallId,
            })
            this.abortController?.abort()
          }

          if (toolDef.function.name === 'run_python_code' && result) {
            try {
              const parsedResult = JSON.parse(result)
              if (parsedResult.fileChanges) {
                const { useWorkspaceStore } = await import('@/store/workspace.store')
                useWorkspaceStore.getState().addChanges(parsedResult.fileChanges)
              }
            } catch {
              // ignore non-json outputs
            }
          }

          return {
            content: [{ type: 'text', text: result }],
            details: { raw: result },
          }
        } catch (toolError) {
          if (toolError instanceof Error && toolError.message.includes('timed out')) {
            callbacks?.onToolTimeout?.(toolCall)
          }
          throw toolError
        }
      },
    }))

    const context = {
      systemPrompt: this.contextManager.getConfig().systemPrompt || this.baseSystemPrompt,
      messages: this.internalToPiMessages(messages),
      tools: agentTools,
    }

    const loop = agentLoopContinue(
      context,
      {
        model,
        getApiKey: () => apiKey,
        maxTokens: model.maxTokens,
        convertToLlm: async (agentMessages) => {
          const internalMessages = agentMessages
            .map((m) => this.piToInternalMessage(m))
            .filter((m): m is Message => m !== null)
          const trimmed = this.contextManager.trimMessages(messagesToChatMessages(internalMessages)).messages
          return this.internalToPiMessages(
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
            }))
          )
        },
      },
      signal
    )

    callbacks?.onMessageStart?.()
    for await (const event of loop) {
      const typedEvent = event as PiAgentEvent
      if (typedEvent.type === 'message_update') {
        this.applyPiAssistantUpdate(typedEvent.assistantMessageEvent, callbacks)
      }

      if (typedEvent.type === 'tool_execution_start') {
        callbacks?.onToolCallStart?.({
          id: typedEvent.toolCallId,
          type: 'function',
          function: {
            name: typedEvent.toolName,
            arguments: JSON.stringify(typedEvent.args || {}),
          },
        })
      }

      if (typedEvent.type === 'tool_execution_end') {
        const resultText = this.extractTextContent((typedEvent.result as PiToolResultMessage)?.content) || ''
        callbacks?.onToolCallComplete?.(
          {
            id: typedEvent.toolCallId,
            type: 'function',
            function: {
              name: typedEvent.toolName,
              arguments: '{}',
            },
          },
          resultText
        )
      }

      if (typedEvent.type === 'message_end') {
        const mapped = this.piToInternalMessage(typedEvent.message)
        if (!mapped || mapped.role === 'user') continue
        allMessages = produce(allMessages, (draft) => {
          draft.push(mapped)
        })
        callbacks?.onMessagesUpdated?.(allMessages)
      }
    }

    if (shouldStopForElicitation) {
      callbacks?.onComplete?.(allMessages)
      return allMessages
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
    // Start with input messages (keep as immutable, use concat to add new messages)
    let allMessages = messages

    // Phase 2 P1: Trigger predictive file loading before processing
    await this.triggerPrefetchIfNeeded(messages)

    // Inject matching skills and MCP services into system prompt
    await this.injectEnhancements(messages)

    if (this.isPiProvider(this.provider)) {
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

    try {
      for (let iteration = 0; iteration < this.maxIterations; iteration++) {
        if (signal.aborted) break

        // Convert to chat format and trim to context window
        const chatMessages = messagesToChatMessages(allMessages)
        const trimmedMessages = this.contextManager.trimMessages(chatMessages).messages

        // Stream LLM response
        const tools = this.toolRegistry.getToolDefinitions()
        callbacks?.onMessageStart?.()

        let content = ''
        let reasoning = ''
        const toolCalls: ToolCall[] = []
        // Buffer for accumulating tool call deltas by index
        const toolCallBuffers = new Map<number, { id: string; name: string; arguments: string }>()

        // Phase detection for reasoning lifecycle
        let reasoningPhaseStarted = false
        let contentPhaseStarted = false
        let toolCallsPhaseStarted = false

        let finishReason: string | null = null
        let usage: TokenUsage | undefined

        const stream = this.provider.chatStream(
          {
            messages: trimmedMessages,
            tools: tools.length > 0 ? tools : undefined,
            toolChoice: tools.length > 0 ? 'auto' : undefined,
          },
          signal
        )

        for await (const chunk of stream) {
          if (signal.aborted) break

          const choice = chunk.choices[0]
          if (!choice) continue

          // --- Reasoning phase ---
          const reasoningDelta = choice.delta.reasoning_content ?? choice.delta.reasoning
          if (reasoningDelta) {
            // First reasoning delta → reasoning phase starts
            if (!reasoningPhaseStarted) {
              reasoningPhaseStarted = true
              callbacks?.onReasoningStart?.()
            }
            reasoning += reasoningDelta
            callbacks?.onReasoningDelta?.(reasoningDelta)
          }

          // --- Content phase ---
          if (choice.delta.content) {
            // First content delta → content phase starts
            if (!contentPhaseStarted) {
              contentPhaseStarted = true
              callbacks?.onContentStart?.()
              // Transition: reasoning → content
              if (reasoningPhaseStarted) {
                callbacks?.onReasoningComplete?.(reasoning)
              }
            }
            content += choice.delta.content
            callbacks?.onContentDelta?.(choice.delta.content)
          }

          // --- Tool calls phase ---
          if (choice.delta.tool_calls) {
            // First tool_call delta → tool_calls phase starts
            if (!toolCallsPhaseStarted) {
              toolCallsPhaseStarted = true
              // Transition: reasoning → tool_calls
              if (reasoningPhaseStarted) {
                callbacks?.onReasoningComplete?.(reasoning)
              }
              // Transition: content → tool_calls
              if (contentPhaseStarted) {
                callbacks?.onContentComplete?.(content)
              }
            }
            for (const tcDelta of choice.delta.tool_calls) {
              let buffer = toolCallBuffers.get(tcDelta.index)
              if (!buffer) {
                buffer = { id: '', name: '', arguments: '' }
                toolCallBuffers.set(tcDelta.index, buffer)
              }
              if (tcDelta.id) buffer.id = tcDelta.id
              if (tcDelta.function?.name) {
                const isFirstName = !buffer.name
                buffer.name = tcDelta.function.name
                // Notify UI only once when we first learn the tool name
                if (isFirstName) {
                  callbacks?.onToolCallStart?.({
                    id: buffer.id,
                    type: 'function',
                    function: { name: buffer.name, arguments: '' },
                  })
                }
              }
              if (tcDelta.function?.arguments) {
                buffer.arguments += tcDelta.function.arguments
                callbacks?.onToolCallDelta?.(tcDelta.index, tcDelta.function.arguments)
              }
            }
          }

          if (choice.finish_reason) {
            finishReason = choice.finish_reason
          }

          // Capture usage from the final chunk (when stream_options.include_usage is set)
          if (chunk.usage) {
            usage = chunk.usage
          }
        }

        // Handle edge case: reasoning completed but no content/tool_calls after it
        if (reasoningPhaseStarted && !toolCallsPhaseStarted) {
          callbacks?.onReasoningComplete?.(reasoning)
        }

        // Handle edge case: content completed but no tool_calls after it
        if (contentPhaseStarted && !toolCallsPhaseStarted) {
          callbacks?.onContentComplete?.(content)
        }

        // Build tool calls from buffers
        for (const [, buffer] of Array.from(toolCallBuffers.entries()).sort(([a], [b]) => a - b)) {
          toolCalls.push({
            id: buffer.id,
            type: 'function',
            function: { name: buffer.name, arguments: buffer.arguments },
          })
        }

        // Create assistant message with token usage
        const msgUsage: MessageUsage | undefined = usage
          ? {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            }
          : undefined
        const assistantMsg = createAssistantMessage(
          content || null,
          toolCalls.length > 0 ? toolCalls : undefined,
          msgUsage,
          reasoning || null
        )
        allMessages = produce(allMessages, (draft) => {
          draft.push(assistantMsg)
        })
        callbacks?.onMessagesUpdated?.(allMessages)

        // If no tool calls, we're done
        if (finishReason !== 'tool_calls' || toolCalls.length === 0) {
          break
        }

        // Execute tool calls
        for (const tc of toolCalls) {
          if (signal.aborted) break

          callbacks?.onToolCallStart?.(tc)

          let args: Record<string, unknown>
          try {
            args = JSON.parse(tc.function.arguments)
          } catch {
            args = {}
          }

          try {
            const result = await this.executeToolWithTimeout(
              tc.function.name,
              args,
              this.toolExecutionTimeout
            )

            // SEP-1306: Check for binary elicitation in tool result
            let elicitationData: {
              mode: 'binary'
              message: string
              toolName: string
              args: Record<string, unknown>
              serverId: string
            } | null = null
            try {
              const parsedResult = JSON.parse(result)
              if (parsedResult._elicitation && parsedResult._elicitation.mode === 'binary') {
                elicitationData = parsedResult._elicitation
              }
            } catch {
              // Not JSON, not an elicitation response
            }

            // If elicitation detected, notify callback and exit loop
            if (elicitationData && callbacks?.onElicitation) {
              // Add assistant message with tool call
              const assistantMsg = createAssistantMessage(null, [tc], undefined, null)
              allMessages = produce(allMessages, (draft) => {
                draft.push(assistantMsg)
              })
              callbacks?.onMessagesUpdated?.(allMessages)

              // Call elicitation callback - caller should handle file upload
              // and resume the agent loop with file metadata
              // Include toolCallId so the handler can create proper tool result message
              callbacks.onElicitation({
                ...elicitationData,
                toolCallId: tc.id,
              })
              callbacks?.onComplete?.(allMessages)
              return allMessages
            }

            // Phase 2: Extract file changes from Python tool result
            if (tc.function.name === 'run_python_code' && result) {
              try {
                const parsedResult = JSON.parse(result)
                if (parsedResult.fileChanges) {
                  // Import and use workspace store
                  // Dynamic import to avoid circular dependency
                  const { useWorkspaceStore } = await import('@/store/workspace.store')
                  useWorkspaceStore.getState().addChanges(parsedResult.fileChanges)
                  console.log('[AgentLoop] File changes detected:', parsedResult.fileChanges)
                }
              } catch {
                // Not JSON or no fileChanges field - ignore
              }
            }

            const toolResult: ToolResult = {
              toolCallId: tc.id,
              name: tc.function.name,
              content: result,
            }
            allMessages = produce(allMessages, (draft) => {
              draft.push(createToolMessage(toolResult))
            })
            callbacks?.onMessagesUpdated?.(allMessages)
            callbacks?.onToolCallComplete?.(tc, result)
          } catch (toolError) {
            if (toolError instanceof Error && toolError.message.includes('timed out')) {
              callbacks?.onToolTimeout?.(tc)
            }
            console.error(`[AgentLoop] Tool ${tc.function.name} failed:`, toolError)
            const errorMsg = toolError instanceof Error ? toolError.message : String(toolError)
            const toolResult: ToolResult = {
              toolCallId: tc.id,
              name: tc.function.name,
              content: `Error: ${errorMsg}`,
            }
            allMessages = produce(allMessages, (draft) => {
              draft.push(createToolMessage(toolResult))
            })
            callbacks?.onMessagesUpdated?.(allMessages)
            callbacks?.onToolCallComplete?.(tc, toolResult.content)
          }
        }
      }

      // Call loop complete callback for side effects (e.g., refresh pending changes)
      if (this.onLoopComplete) {
        try {
          await this.onLoopComplete()
        } catch (error) {
          console.warn('[AgentLoop] onLoopComplete callback failed:', error)
        }
      }

      callbacks?.onComplete?.(allMessages)
      return allMessages
    } catch (error) {
      if (signal.aborted) {
        // Cancelled - return what we have
        callbacks?.onComplete?.(allMessages)
        return allMessages
      }
      const err = error instanceof Error ? error : new Error(String(error))
      callbacks?.onError?.(err)
      throw err
    } finally {
      this.abortController = null
    }
  }
}
