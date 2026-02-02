/**
 * useAutoResizeTextarea - 自动调整高度的 Textarea Hook
 * 输入框高度自动扩展（40px - 128px）
 */

import { useRef, useCallback } from 'react'

const MIN_HEIGHT = 40
const MAX_HEIGHT = 128 // 约 4 行

export function useAutoResizeTextarea() {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    const scrollHeight = textarea.scrollHeight
    const newHeight = Math.min(Math.max(scrollHeight, MIN_HEIGHT), MAX_HEIGHT)
    textarea.style.height = `${newHeight}px`
  }, [])

  const resetHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = `${MIN_HEIGHT}px`
  }, [])

  return { textareaRef, resize, resetHeight }
}
