/**
 * ReasoningSection - collapsible "thinking process" block.
 */

import { useState } from 'react'
import { Brain, ChevronDown, ChevronRight, Wrench } from 'lucide-react'

export interface ToolCall {
  toolName: string
  args: string
  toolCallId: string
}

interface ReasoningSectionProps {
  thinking: string
  toolCalls?: ToolCall[]
  status?: 'idle' | 'thinking' | 'tool_calling' | 'error'
}

export function ReasoningSection({ thinking, toolCalls = [], status = 'thinking' }: ReasoningSectionProps) {
  const [open, setOpen] = useState(false)
  const hasContent = thinking.length > 0 || toolCalls.length > 0

  if (!hasContent) return null

  const isStreaming = status === 'thinking' || status === 'tool_calling'

  return (
    <div className="border-l-2 border-neutral-200 pl-3 py-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600"
      >
        <Brain className="h-3 w-3" />
        <span>{isStreaming ? '思考中...' : '思考过程'}</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs text-neutral-500">
          {thinking && (
            <div className="mb-2">{thinking}</div>
          )}
          {toolCalls.map((tool) => (
            <div key={tool.toolCallId} className="flex items-start gap-1 text-neutral-400">
              <Wrench className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">{tool.toolName}</div>
                <div className="text-neutral-500 break-all">{tool.args}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
