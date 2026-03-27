import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import HardBreak from '@tiptap/extension-hard-break'

export interface AgentMentionCandidate {
  id: string
  name?: string
}

export interface AgentRichInputValue {
  text: string
  mentionedAgentIds: string[]
}

interface AgentRichInputProps {
  ariaLabel?: string
  placeholder: string
  disabled?: boolean
  resetToken?: number
  agents: AgentMentionCandidate[]
  onSubmit: () => void
  onChange: (value: AgentRichInputValue) => void
}

interface MentionContext {
  from: number
  to: number
  query: string
}

function extractMentionContext(editor: Editor): MentionContext | null {
  const { state } = editor
  const caret = state.selection.from
  const lookbehind = state.doc.textBetween(Math.max(0, caret - 80), caret, '\n', '\0')
  const match = /(?:^|\s)@([a-zA-Z0-9_-]*)$/.exec(lookbehind)
  if (!match) return null

  const matched = match[0]
  const atIndex = matched.lastIndexOf('@')
  if (atIndex < 0) return null

  const mentionText = matched.slice(atIndex)
  return {
    from: caret - mentionText.length,
    to: caret,
    query: match[1] ?? '',
  }
}

function extractMentionedAgentIds(text: string, agents: AgentMentionCandidate[]): string[] {
  const canonicalByLower = new Map<string, string>()
  for (const agent of agents) {
    canonicalByLower.set(agent.id.toLowerCase(), agent.id)
  }

  const result: string[] = []
  const seen = new Set<string>()
  const regex = /(?:^|\s)@([a-zA-Z0-9_-]+)/g
  let match: RegExpExecArray | null = null

  while ((match = regex.exec(text)) !== null) {
    const raw = match[1]
    const canonical = canonicalByLower.get(raw.toLowerCase())
    if (!canonical || canonical === 'default' || seen.has(canonical)) continue
    seen.add(canonical)
    result.push(canonical)
  }

  return result
}

export function AgentRichInput({
  ariaLabel,
  placeholder,
  disabled = false,
  resetToken = 0,
  agents,
  onSubmit,
  onChange,
}: AgentRichInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [mentionContext, setMentionContext] = useState<MentionContext | null>(null)
  const [mentionSelection, setMentionSelection] = useState(0)

  const mentionContextRef = useRef<MentionContext | null>(null)
  const mentionSelectionRef = useRef(0)
  const disabledRef = useRef(disabled)
  const onSubmitRef = useRef(onSubmit)
  const onChangeRef = useRef(onChange)
  const agentsRef = useRef(agents)

  const emitValue = useCallback(
    (editor: Editor) => {
      const text = editor.getText({ blockSeparator: '\n' })
      const mentionedAgentIds = extractMentionedAgentIds(text, agentsRef.current)
      onChangeRef.current({ text, mentionedAgentIds })
    },
    []
  )

  const mentionCandidates = useMemo(() => {
    if (!mentionContext) return []
    const query = mentionContext.query.trim().toLowerCase()
    return agents
      .filter((agent) => agent.id !== 'default')
      .filter((agent) => {
        if (!query) return true
        const haystack = `${agent.id} ${agent.name || ''}`.toLowerCase()
        return haystack.includes(query)
      })
      .slice(0, 8)
  }, [agents, mentionContext])
  const mentionCandidatesRef = useRef<AgentMentionCandidate[]>([])

  useEffect(() => {
    mentionContextRef.current = mentionContext
  }, [mentionContext])

  useEffect(() => {
    mentionSelectionRef.current = mentionSelection
  }, [mentionSelection])

  useEffect(() => {
    mentionCandidatesRef.current = mentionCandidates
  }, [mentionCandidates])

  useEffect(() => {
    disabledRef.current = disabled
  }, [disabled])

  useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    agentsRef.current = agents
  }, [agents])

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [Document, Paragraph, Text, HardBreak],
    editorProps: {
      attributes: {
        'aria-label': ariaLabel || placeholder,
        class:
          'min-h-[22px] max-h-[80px] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 outline-none',
      },
      handleKeyDown: (_view, event) => {
        if (disabledRef.current) return false
        if (event.isComposing) return false

        const currentMentionContext = mentionContextRef.current
        const currentMentionCandidates = mentionCandidatesRef.current

        if (currentMentionContext) {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setMentionSelection((idx) => {
              const max = Math.max(mentionCandidatesRef.current.length - 1, 0)
              return idx >= max ? max : idx + 1
            })
            return true
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setMentionSelection((idx) => Math.max(0, idx - 1))
            return true
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setMentionContext(null)
            return true
          }
          if (event.key === 'Enter' && !event.shiftKey && currentMentionCandidates.length > 0) {
            event.preventDefault()
            const index = Math.min(
              Math.max(mentionSelectionRef.current, 0),
              currentMentionCandidates.length - 1
            )
            const picked = currentMentionCandidates[index]
            if (picked) {
              _view.dispatch(
                _view.state.tr.insertText(
                  `@${picked.id} `,
                  currentMentionContext.from,
                  currentMentionContext.to
                )
              )
              setMentionContext(null)
              setMentionSelection(0)
            }
            return true
          }
        }

        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          onSubmitRef.current()
          return true
        }
        return false
      },
    },
    onCreate: ({ editor: created }) => {
      emitValue(created)
      setMentionContext(extractMentionContext(created))
    },
    onUpdate: ({ editor: updated }) => {
      emitValue(updated)
      setMentionContext(extractMentionContext(updated))
    },
    onSelectionUpdate: ({ editor: updated }) => {
      setMentionContext(extractMentionContext(updated))
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (!editor) return
    editor.commands.clearContent()
    emitValue(editor)
    setMentionContext(null)
    setMentionSelection(0)
  }, [editor, resetToken])

  useEffect(() => {
    if (!mentionCandidates.length) {
      setMentionSelection(0)
      return
    }
    setMentionSelection((idx) =>
      idx < 0 ? 0 : idx >= mentionCandidates.length ? mentionCandidates.length - 1 : idx
    )
  }, [mentionCandidates])

  const commitMention = useCallback(
    (agentId: string) => {
      if (!editor || !mentionContext) return
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: mentionContext.from, to: mentionContext.to },
          `@${agentId} `
        )
        .run()
      setMentionContext(null)
      setMentionSelection(0)
      emitValue(editor)
    },
    [editor, emitValue, mentionContext]
  )

  const isEmpty = editor ? editor.isEmpty : true
  const showMentionSuggestions = !disabled && !!mentionContext

  return (
    <div className="relative">
      <div className="focus-within:border-primary-300 focus-within:ring-primary-300 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-4 pr-14 text-sm text-neutral-900 shadow-sm transition-all focus-within:bg-white focus-within:ring-2 focus-within:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus-within:bg-neutral-800">
        {editor && <EditorContent editor={editor} />}
        {!isFocused && isEmpty && (
          <div className="pointer-events-none absolute left-5 top-4 pr-16 text-sm text-neutral-400 dark:text-neutral-500">
            {placeholder}
          </div>
        )}
      </div>

      {showMentionSuggestions && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {mentionCandidates.length > 0 ? (
            <div className="max-h-56 overflow-y-auto py-1">
              {mentionCandidates.map((candidate, idx) => {
                const selected = idx === mentionSelection
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      commitMention(candidate.id)
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                      selected
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
                        : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <span className="font-medium">@{candidate.id}</span>
                    {candidate.name && candidate.name !== candidate.id && (
                      <span className="truncate pl-3 text-xs text-neutral-500 dark:text-neutral-400">
                        {candidate.name}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400">
              No agents available
            </div>
          )}
        </div>
      )}
    </div>
  )
}
