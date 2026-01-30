/**
 * ReasoningSection - collapsible "thinking process" block shared by
 * MessageBubble, AssistantTurnBubble, and StreamingBubble.
 */

import { useState } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'

interface ReasoningSectionProps {
  reasoning: string
  /** If true, show "思考中..." label instead of "思考过程" */
  streaming?: boolean
}

export function ReasoningSection({ reasoning, streaming }: ReasoningSectionProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-2 border-b border-neutral-100 pb-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600"
      >
        <Brain className="h-3 w-3" />
        <span>{streaming ? '思考中...' : '思考过程'}</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs text-neutral-400">
          {reasoning}
        </div>
      )}
    </div>
  )
}
