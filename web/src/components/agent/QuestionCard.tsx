/**
 * QuestionCard - renders an ask_user_question tool call as an interactive question card.
 *
 * Supports four question types:
 * - yes_no: Two-button confirmation (Yes / No)
 * - single_choice: Radio button list
 * - multi_choice: Checkbox list with submit
 * - free_text: Textarea with submit
 *
 * The card is shown when the tool call is executing (waiting for user input).
 * Once answered, it collapses into a compact answered state.
 */

import { useState, useCallback, type TextareaHTMLAttributes } from 'react'
import { MessageCircleQuestion, CheckCircle2, Clock, FileText } from 'lucide-react'
import { MarkdownContent } from './MarkdownContent'
import { useT } from '@/i18n'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuestionCardProps {
  /** The question text */
  question: string
  /** Question type */
  type: 'yes_no' | 'single_choice' | 'multi_choice' | 'free_text'
  /** Options for single_choice / multi_choice */
  options?: string[]
  /** Default answer for pre-selection */
  defaultAnswer?: string
  /** Additional context */
  context?: {
    affected_files?: string[]
    preview?: string
  }
  /** Whether the question has already been answered (show compact result) */
  answered?: boolean
  /** The answer that was given (for answered state) */
  resultAnswer?: string
  /** Callback when user submits an answer */
  onAnswer?: (answer: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuestionCard({
  question,
  type,
  options,
  defaultAnswer,
  context,
  answered,
  resultAnswer,
  onAnswer,
}: QuestionCardProps) {
  const t = useT()

  // Already answered — show compact result
  if (answered) {
    return (
      <div className="my-1 rounded border border-green-200 bg-green-50 text-sm dark:border-green-800 dark:bg-green-950/30">
        <div className="flex items-center gap-2 px-3 py-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          <span className="text-xs text-green-700 dark:text-green-300">
            {t('questionCard.answered', '已回答')}
          </span>
          {resultAnswer && (
            <span className="ml-1 truncate text-xs text-green-600 dark:text-green-400">
              {resultAnswer}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="my-1 rounded border border-amber-200 bg-amber-50 text-sm dark:border-amber-800 dark:bg-amber-950/30">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-amber-200 px-3 py-2 dark:border-amber-800">
        <MessageCircleQuestion className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
          {t('questionCard.title', 'Agent 提问')}
        </span>
        <Clock className="ml-auto h-3 w-3 text-amber-400 dark:text-amber-500" />
      </div>

      {/* Context: affected files */}
      {context?.affected_files && context.affected_files.length > 0 && (
        <div className="border-b border-amber-200 px-3 py-2 dark:border-amber-800">
          <div className="mb-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <FileText className="h-3 w-3" />
            <span>{t('questionCard.affectedFiles', '相关文件')}</span>
          </div>
          <div className="space-y-0.5">
            {context.affected_files.map((file) => (
              <div key={file} className="truncate font-mono text-xs text-amber-800 dark:text-amber-200">
                {file}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Context: preview */}
      {context?.preview && (
        <div className="border-b border-amber-200 px-3 py-2 dark:border-amber-800">
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-amber-800 dark:text-amber-200">
            {context.preview}
          </pre>
        </div>
      )}

      {/* Question body */}
      <div className="px-3 py-3">
        <div className="mb-3 text-sm text-amber-900 dark:text-amber-100">
          <MarkdownContent content={question} />
        </div>

        {/* Question type-specific input */}
        {type === 'yes_no' && (
          <YesNoInput defaultAnswer={defaultAnswer} onAnswer={onAnswer} />
        )}
        {type === 'single_choice' && (
          <SingleChoiceInput options={options ?? []} defaultAnswer={defaultAnswer} onAnswer={onAnswer} />
        )}
        {type === 'multi_choice' && (
          <MultiChoiceInput options={options ?? []} defaultAnswer={defaultAnswer} onAnswer={onAnswer} />
        )}
        {type === 'free_text' && (
          <FreeTextInput defaultAnswer={defaultAnswer} onAnswer={onAnswer} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components for each question type
// ---------------------------------------------------------------------------

function YesNoInput({
  defaultAnswer,
  onAnswer,
}: {
  defaultAnswer?: string
  onAnswer?: (answer: string) => void
}) {
  const t = useT()
  const handleYes = useCallback(() => onAnswer?.('yes'), [onAnswer])
  const handleNo = useCallback(() => onAnswer?.('no'), [onAnswer])

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={handleYes}
        className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 dark:bg-green-700 dark:hover:bg-green-600"
      >
        {t('questionCard.yes', '确认')}
      </button>
      <button
        type="button"
        onClick={handleNo}
        className="rounded-md bg-neutral-200 px-4 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-1 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
      >
        {t('questionCard.no', '取消')}
      </button>
    </div>
  )
}

function SingleChoiceInput({
  options,
  defaultAnswer,
  onAnswer,
}: {
  options: string[]
  defaultAnswer?: string
  onAnswer?: (answer: string) => void
}) {
  const t = useT()
  const [selected, setSelected] = useState(defaultAnswer ?? '')

  return (
    <div>
      <div className="space-y-1.5">
        {options.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/30"
          >
            <input
              type="radio"
              name="question-option"
              value={option}
              checked={selected === option}
              onChange={() => setSelected(option)}
              className="h-3.5 w-3.5 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm text-amber-900 dark:text-amber-100">{option}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={!selected}
        onClick={() => selected && onAnswer?.(selected)}
        className="mt-2 rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-amber-700 dark:hover:bg-amber-600"
      >
        {t('questionCard.confirm', '确认')}
      </button>
    </div>
  )
}

function MultiChoiceInput({
  options,
  defaultAnswer,
  onAnswer,
}: {
  options: string[]
  defaultAnswer?: string
  onAnswer?: (answer: string) => void
}) {
  const t = useT()
  const defaultSet = defaultAnswer ? new Set(defaultAnswer.split(',')) : new Set<string>()
  const [selected, setSelected] = useState<Set<string>>(defaultSet)

  const toggle = useCallback((option: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(option)) {
        next.delete(option)
      } else {
        next.add(option)
      }
      return next
    })
  }, [])

  const handleSubmit = useCallback(() => {
    if (selected.size > 0) {
      onAnswer?.(Array.from(selected).join(','))
    }
  }, [selected, onAnswer])

  return (
    <div>
      <div className="space-y-1.5">
        {options.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/30"
          >
            <input
              type="checkbox"
              value={option}
              checked={selected.has(option)}
              onChange={() => toggle(option)}
              className="h-3.5 w-3.5 rounded text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm text-amber-900 dark:text-amber-100">{option}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={selected.size === 0}
        onClick={handleSubmit}
        className="mt-2 rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-amber-700 dark:hover:bg-amber-600"
      >
        {t('questionCard.confirm', '确认')}
      </button>
    </div>
  )
}

function FreeTextInput({
  defaultAnswer,
  onAnswer,
}: {
  defaultAnswer?: string
  onAnswer?: (answer: string) => void
}) {
  const t = useT()
  const [text, setText] = useState(defaultAnswer ?? '')
  const handleSubmit = useCallback(() => {
    if (text.trim()) {
      onAnswer?.(text.trim())
    }
  }, [text, onAnswer])

  const handleKeyDown: TextareaHTMLAttributes<HTMLTextAreaElement>['onKeyDown'] = useCallback(
    (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('questionCard.placeholder', '请输入你的回答...')}
        rows={3}
        className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[10px] text-amber-500 dark:text-amber-400">
          {t('questionCard.submitHint', 'Ctrl+Enter 提交')}
        </span>
        <button
          type="button"
          disabled={!text.trim()}
          onClick={handleSubmit}
          className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-amber-700 dark:hover:bg-amber-600"
        >
          {t('questionCard.submit', '提交')}
        </button>
      </div>
    </div>
  )
}
