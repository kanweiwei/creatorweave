/**
 * ChatInput - 底部输入框组件
 * 支持自动扩展、键盘适配、发送/停止切换
 */

import { useState } from 'react'
import { Send, Square, AtSign } from 'lucide-react'
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea'

export interface ChatInputProps {
  onSend: (content: string) => void
  onStop: () => void
  isRunning: boolean
  disabled?: boolean
  onSelectFile?: () => void
  selectedFileCount?: number
  placeholder?: string
}

export function ChatInput({
  onSend,
  onStop,
  isRunning,
  disabled = false,
  onSelectFile,
  selectedFileCount = 0,
  placeholder = '输入消息...',
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const { textareaRef, resize, resetHeight } = useAutoResizeTextarea()

  const handleSend = () => {
    if (input.trim() && !isRunning && !disabled) {
      onSend(input.trim())
      setInput('')
      resetHeight()
    }
  }

  const handleStop = () => onStop()

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (isRunning) {
        handleStop()
      } else {
        handleSend()
      }
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    resize()
  }

  const canSend = input.trim().length > 0 && !isRunning && !disabled

  return (
    <div className="bg-white border-t border-neutral-200 safe-bottom">
      <div className="max-w-3xl mx-auto px-4 py-3">
        <div className="flex items-end gap-2">
          {/* @文件按钮 */}
          {onSelectFile && (
            <button
              onClick={onSelectFile}
              className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-full bg-neutral-100 hover:bg-neutral-200 active:scale-95 transition-all relative disabled:opacity-50"
              disabled={disabled}
              aria-label="选择文件"
            >
              <AtSign className="h-5 w-5 text-neutral-600" />
              {selectedFileCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                  {selectedFileCount}
                </span>
              )}
            </button>
          )}

          {/* 输入框 */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isRunning}
            rows={1}
            className="flex-1 max-h-32 px-4 py-2.5 rounded-2xl border border-neutral-200 bg-neutral-50 text-sm resize-none focus:border-primary-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-300 disabled:opacity-50"
            style={{ minHeight: '40px' }}
            aria-label="消息输入框"
          />

          {/* 发送/停止按钮 */}
          <button
            onClick={isRunning ? handleStop : handleSend}
            disabled={!canSend && !isRunning}
            className={`h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-full transition-all ${
              isRunning
                ? 'bg-red-500 hover:bg-red-600 active:scale-95'
                : canSend
                  ? 'bg-primary-600 hover:bg-primary-700 active:scale-95'
                  : 'bg-gray-300'
            }`}
            aria-label={isRunning ? '停止生成' : '发送消息'}
          >
            {isRunning ? (
              <Square className="h-5 w-5 text-white" />
            ) : (
              <Send className="h-5 w-5 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
