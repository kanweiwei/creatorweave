/**
 * ProtectedRoute - 路由守卫组件
 * 只有连接状态下才能访问受保护的页面
 */

import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useRemoteStore } from '../store/remote.store'
import { LoadingScreen } from './LoadingScreen'

const STORAGE_KEY = 'bfosa-remote-session'

function hasSavedSession(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const data = JSON.parse(raw) as { sessionId: string; savedAt: number }
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

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { connectionState } = useRemoteStore()

  // Connecting or reconnecting - show loading
  if (connectionState === 'connecting' || connectionState === 'reconnecting') {
    return <LoadingScreen />
  }

  // Connected - render children
  if (connectionState === 'connected') {
    return <>{children}</>
  }

  // Disconnected but has saved session - show loading while reconnecting
  if (connectionState === 'disconnected' && hasSavedSession()) {
    return <LoadingScreen />
  }

  // Disconnected and no saved session - redirect to input
  return <Navigate to="/input" replace />
}
