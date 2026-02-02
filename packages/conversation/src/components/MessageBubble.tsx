/**
 * MessageBubble - renders a single message (user or assistant).
 */

import { User, Bot } from 'lucide-react'
import type { Message } from '../types/conversation'
import { ReasoningSection } from './ReasoningSection'
import { MarkdownContent } from './MarkdownContent'
import { ToolCallDisplay } from './ToolCallDisplay'
import { CopyButton } from './CopyButton'

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  return (n / 1000).toFixed(n < 10000 ? 2 : 1) + 'K'
}

interface StreamingState {
  reasoning?: boolean
  content?: boolean
}

interface MessageBubbleProps {
  message: Message
  streaming?: StreamingState
  showAvatar?: boolean
  reasoningCollapsed?: boolean
  toolResults?: Map<string, string>
}

export function MessageBubble({
  message,
  streaming,
  showAvatar = true,
  reasoningCollapsed = true,
  toolResults,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isStreamingReasoning = streaming?.reasoning ?? false
  const isStreamingContent = streaming?.content ?? false

  // User message rendering
  if (isUser) {
    return (
      <div className="flex flex-row-reverse gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <User className="h-4 w-4" />
        </div>

        <div className="min-w-0 max-w-[80%] text-right">
          <div className="inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm text-white">
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          </div>

          <div className="mt-1 flex items-center justify-end gap-2 text-xs text-neutral-400">
            <span>
              {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <CopyButton content={message.content || ''} />
          </div>
        </div>
      </div>
    )
  }

  // Assistant message rendering
  const hasReasoning = !!(message.reasoning && (!reasoningCollapsed || isStreamingReasoning))
  const hasContent = !!message.content
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0

  return (
    <div className="flex gap-3">
      {showAvatar && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div className="min-w-0 max-w-[80%] space-y-2">
        {hasReasoning && (
          <div className="inline-block rounded-lg bg-white px-4 py-2 text-sm text-neutral-800 shadow-sm ring-1 ring-neutral-200">
            <ReasoningSection reasoning={message.reasoning!} streaming={isStreamingReasoning} />
          </div>
        )}

        {hasContent && (
          <div className="inline-block rounded-lg bg-white px-4 py-2 text-sm text-neutral-800 shadow-sm ring-1 ring-neutral-200">
            <div className="prose-sm max-w-none break-words">
              <MarkdownContent content={message.content!} />
            </div>
            {isStreamingContent && (
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-neutral-400 align-text-bottom" />
            )}
          </div>
        )}

        {hasToolCalls && (
          <div className="space-y-1">
            {message.toolCalls!.map((tc) => (
              <ToolCallDisplay key={tc.id} toolCall={tc} result={toolResults?.get(tc.id)} />
            ))}
          </div>
        )}

        {!isStreamingReasoning && !isStreamingContent && message.usage && (
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span
              title={`输入 ${message.usage.promptTokens} + 输出 ${message.usage.completionTokens} = ${message.usage.totalTokens} tokens`}
            >
              ↑{formatTokens(message.usage.promptTokens)} ↓
              {formatTokens(message.usage.completionTokens)}
            </span>
            {message.content && <CopyButton content={message.content} />}
          </div>
        )}

        {!isStreamingReasoning && !isStreamingContent && !message.usage && message.content && (
          <CopyButton content={message.content} />
        )}
      </div>
    </div>
  )
}
