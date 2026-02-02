/**
 * NavigateToAppropriate - 根据连接状态重定向
 * 连接状态 → /chats，未连接 → /input
 * 连接中 → 显示加载动画
 */

import { Navigate } from 'react-router-dom'
import { useRemoteStore } from '../store/remote.store'
import { LoadingScreen } from './LoadingScreen'

const STORAGE_KEY = 'bfosa-remote-session'

function hasSavedSession(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const data = JSON.parse(raw) as { sessionId: string; savedAt: number }
    // Check if session is too old (24 hours)
    const MAX_SESSION_AGE = 24 * 60 * 60 * 1000
    if (Date.now() - data.savedAt > MAX_SESSION_AGE) {
      localStorage.removeItem(STORAGE_KEY)
      return false
    }
    return true
  } catch {
    return false
  }
}

export function NavigateToAppropriate() {
  const { connectionState } = useRemoteStore()

  // Connecting or reconnecting - show loading
  if (connectionState === 'connecting' || connectionState === 'reconnecting') {
    return <LoadingScreen />
  }

  if (connectionState === 'connected') {
    return <Navigate to="/chats" replace />
  }

  // Disconnected but has saved session - show loading while reconnecting
  if (connectionState === 'disconnected' && hasSavedSession()) {
    return <LoadingScreen />
  }

  return <Navigate to="/input" replace />
}
