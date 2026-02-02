/**
 * useKeyboard - 键盘弹起检测 Hook
 * 使用 visualViewport API，降级方案使用 window.resize
 */

import { useState, useEffect } from 'react'

const KEYBOARD_THRESHOLD = 150 // 键盘高度阈值

export function useKeyboard() {
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)

  useEffect(() => {
    // 检测是否支持 visualViewport API
    if (typeof window === 'undefined') {
      return
    }

    if (window.visualViewport) {
      // 使用 visualViewport API (iOS 13+)
      const visualViewport = window.visualViewport

      const handleResize = () => {
        if (!visualViewport) return
        const diff = window.innerHeight - visualViewport.height
        const isVisible = diff > KEYBOARD_THRESHOLD

        setIsKeyboardVisible(isVisible)
        setKeyboardHeight(isVisible ? diff : 0)
      }

      visualViewport.addEventListener('resize', handleResize)
      return () => visualViewport?.removeEventListener('resize', handleResize)
    } else {
      // 降级方案：监听 window resize
      const handleResize = () => {
        const diff = window.screen.height - window.innerHeight
        const isVisible = diff > KEYBOARD_THRESHOLD
        setIsKeyboardVisible(isVisible)
        if (isVisible) {
          setKeyboardHeight(diff)
        } else {
          setKeyboardHeight(0)
        }
      }

      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [])

  return { keyboardHeight, isKeyboardVisible }
}
