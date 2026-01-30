/**
 * ConversationView - pure conversation display and interaction.
 *
 * Extracted from AgentPanel: contains only the message list, streaming indicator,
 * input area, and agent loop logic. No internal sidebar or top bar.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, StopCircle, MessageSquare } from 'lucide-react'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { useSettingsStore } from '@/store/settings.store'
import { MessageBubble } from './MessageBubble'
import { AssistantTurnBubble } from './AssistantTurnBubble'
import { groupMessagesIntoTurns } from './group-messages'
import { createUserMessage } from '@/agent/message-types'
import type { Message, ToolCall } from '@/agent/message-types'
import { AgentLoop } from '@/agent/agent-loop'
import { GLMProvider } from '@/agent/llm/glm-provider'
import { ContextManager } from '@/agent/context-manager'
import { getToolRegistry } from '@/agent/tool-registry'
import { loadApiKey } from '@/security/api-key-store'
import { LLM_PROVIDER_CONFIGS } from '@/agent/providers/types'

interface ConversationViewProps {
  /** Optional initial message to send immediately (from WelcomeScreen) */
  initialMessage?: string | null
  onInitialMessageConsumed?: () => void
}

export function ConversationView({
  initialMessage,
  onInitialMessageConsumed,
}: ConversationViewProps) {
  const [input, setInput] = useState('')
  const [toolResults, setToolResults] = useState<Map<string, string>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const agentLoopRef = useRef<AgentLoop | null>(null)

  const {
    status,
    streamingContent,
    streamingReasoning,
    isReasoningStreaming,
    completedReasoning,
    completedContent,
    streamingToolArgs,
    currentToolCall,
    directoryHandle,
    setStatus,
    appendStreamingContent,
    appendStreamingReasoning,
    resetStreamingContent,
    setCurrentToolCall,
    appendStreamingToolArgs,
    resetStreamingToolArgs,
    setError,
    reset: resetAgent,
    resetStreamingReasoning,
    setReasoningStreaming,
    setCompletedReasoning,
    setContentStreaming,
    setCompletedContent,
  } = useAgentStore()

  // Subscribe directly to conversations and activeConversationId to ensure updates trigger re-renders
  const conversations = useConversationStore((s) => s.conversations)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const activeConversation = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)
    : null
  const createNew = useConversationStore((s) => s.createNew)
  const updateMessages = useConversationStore((s) => s.updateMessages)
  const setActive = useConversationStore((s) => s.setActive)

  const { providerType, modelName, maxTokens, hasApiKey } = useSettingsStore()

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [streamingContent, streamingReasoning, streamingToolArgs, status])

  // Build tool results map from conversation messages
  const buildToolResultsMap = useCallback((messages: Message[]) => {
    const map = new Map<string, string>()
    for (const msg of messages) {
      if (msg.role === 'tool' && msg.toolCallId) {
        map.set(msg.toolCallId, msg.content || '')
      }
    }
    return map
  }, [])

  // Update tool results when conversation changes
  useEffect(() => {
    if (activeConversation) {
      setToolResults(buildToolResultsMap(activeConversation.messages))
    }
  }, [activeConversation, buildToolResultsMap])

  // Handle initial message from WelcomeScreen (one-shot).
  // The conversation is already created by WorkspaceLayout before this component mounts.
  const initialMessageHandled = useRef(false)
  useEffect(() => {
    if (initialMessage && !initialMessageHandled.current && status === 'idle') {
      initialMessageHandled.current = true
      sendMessage(initialMessage)
      onInitialMessageConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage])

  const sendMessage = async (text: string) => {
    if (!text.trim() || status !== 'idle') return

    if (!hasApiKey) {
      setError('API Key 未设置，请先在设置中配置')
      return
    }

    // Use the current active conversation — it must already exist.
    // (WorkspaceLayout creates it before mounting ConversationView,
    //  or user clicks on an existing one from the sidebar.)
    let convId = activeConversationId
    if (!convId) {
      // Fallback: create one if somehow missing
      const conv = createNew(text.slice(0, 30))
      convId = conv.id
      setActive(convId)
    }

    // Add user message
    const userMsg = createUserMessage(text)
    const conv = conversations.find((c) => c.id === convId)
    const currentMessages = conv ? [...conv.messages, userMsg] : [userMsg]
    updateMessages(convId, currentMessages)
    setInput('')
    resetStreamingContent()

    // Setup agent
    try {
      const apiKey = await loadApiKey(providerType)
      if (!apiKey) {
        setError('API Key 未设置，请先在设置中配置')
        return
      }

      const config = LLM_PROVIDER_CONFIGS[providerType]
      const provider = new GLMProvider({
        apiKey,
        baseUrl: config.baseURL,
        model: modelName,
      })

      const contextManager = new ContextManager({
        maxContextTokens: provider.maxContextTokens,
        reserveTokens: maxTokens,
      })

      const toolRegistry = getToolRegistry()

      const agentLoop = new AgentLoop({
        provider,
        toolRegistry,
        contextManager,
        toolContext: {
          directoryHandle: directoryHandle,
        },
        maxIterations: 20,
      })
      agentLoopRef.current = agentLoop

      setStatus('thinking')

      await agentLoop.run(currentMessages, {
        onMessageStart: () => {
          resetStreamingContent()
          resetStreamingReasoning()
          setReasoningStreaming(false)
          setCompletedReasoning('')
          setContentStreaming(false)
          setCompletedContent('')
          setStatus('streaming')
        },
        onReasoningStart: () => {
          setReasoningStreaming(true)
        },
        onReasoningDelta: (delta) => {
          appendStreamingReasoning(delta)
        },
        onReasoningComplete: (reasoning) => {
          setReasoningStreaming(false)
          setCompletedReasoning(reasoning)
        },
        onContentStart: () => {
          setContentStreaming(true)
        },
        onContentDelta: (delta) => {
          appendStreamingContent(delta)
        },
        onContentComplete: (content) => {
          setContentStreaming(false)
          setCompletedContent(content)
          resetStreamingContent()
        },
        onToolCallStart: (tc: ToolCall) => {
          setStatus('tool_calling')
          setCurrentToolCall(tc)
          resetStreamingToolArgs()
        },
        onToolCallDelta: (_index: number, argsDelta: string) => {
          appendStreamingToolArgs(argsDelta)
        },
        onToolCallComplete: (tc: ToolCall, result: string) => {
          setToolResults((prev) => {
            const next = new Map(prev)
            next.set(tc.id, result)
            return next
          })
          setCurrentToolCall(null)
        },
        onMessagesUpdated: (msgs) => {
          // Progressively update conversation so user sees tool calls in real-time
          updateMessages(convId, msgs)
          setToolResults(buildToolResultsMap(msgs))
        },
        onComplete: (msgs) => {
          updateMessages(convId, msgs)
          setToolResults(buildToolResultsMap(msgs))
          // Defer resetAgent to ensure UI has a chance to render the updated messages first
          Promise.resolve().then(() => resetAgent())
        },
        onError: (err) => {
          setError(err.message)
        },
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        resetAgent()
        return
      }
      setError(error instanceof Error ? error.message : String(error))
    }
  }

  const handleSend = () => {
    sendMessage(input)
  }

  const handleCancel = () => {
    agentLoopRef.current?.cancel()
    resetAgent()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isProcessing = status !== 'idle' && status !== 'error'

  // Build streaming state for the last message when processing
  const streamingState = useMemo(() => {
    if (!isProcessing) return undefined
    return {
      reasoning: isReasoningStreaming,
      content: status === 'streaming',
    }
  }, [isProcessing, isReasoningStreaming, status])

  // When processing, we have streaming content/reasoning that should be displayed
  // as part of the current assistant turn
  const streamingContentMessage = useMemo(() => {
    if (!isProcessing) return undefined
    const reasoning = completedReasoning || streamingReasoning
    const content = completedContent || streamingContent
    if (!reasoning && !content) return undefined
    return { reasoning, content }
  }, [isProcessing, completedReasoning, streamingReasoning, completedContent, streamingContent])

  const turns = useMemo(() => {
    // Immer ensures messages reference changes properly
    const messages = activeConversation?.messages || []
    return groupMessagesIntoTurns(messages)
  }, [activeConversation?.messages])

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeConversation?.messages.length === 0 && !isProcessing && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-neutral-400">
              <MessageSquare className="mx-auto mb-2 h-8 w-8" />
              <p className="text-sm">输入消息开始对话</p>
            </div>
          </div>
        )}

        <div className="mx-auto max-w-3xl space-y-4">
          {turns.map((turn, idx) =>
            turn.type === 'user' ? (
              <MessageBubble key={turn.message.id} message={turn.message} />
            ) : (
              <AssistantTurnBubble
                key={turn.messages[0].id}
                turn={turn}
                toolResults={toolResults}
                isProcessing={isProcessing}
                streamingState={
                  // Only pass streaming state to the last assistant turn when processing
                  isProcessing && idx === turns.length - 1 ? streamingState : undefined
                }
                streamingContent={
                  // Pass streaming content to the last assistant turn when processing
                  isProcessing && idx === turns.length - 1 ? streamingContentMessage : undefined
                }
                currentToolCall={
                  // Pass current tool call to the last assistant turn when in tool_calling phase
                  isProcessing && idx === turns.length - 1 && status === 'tool_calling'
                    ? currentToolCall
                    : undefined
                }
                streamingToolArgs={
                  // Pass streaming tool args to the last assistant turn when in tool_calling phase
                  isProcessing && idx === turns.length - 1 && status === 'tool_calling'
                    ? streamingToolArgs
                    : undefined
                }
              />
            )
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-neutral-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasApiKey ? '输入消息... (Shift+Enter 换行)' : '请先在设置中配置 API Key'}
            rows={1}
            className="max-h-32 min-h-[38px] flex-1 resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm focus:border-primary-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-300"
            disabled={isProcessing || !hasApiKey}
          />
          {isProcessing ? (
            <button
              type="button"
              onClick={handleCancel}
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-red-500 text-white hover:bg-red-600"
              title="停止"
            >
              <StopCircle className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || !hasApiKey}
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-30"
              title="发送"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
