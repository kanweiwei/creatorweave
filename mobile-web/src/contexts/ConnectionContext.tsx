/**
 * ConnectionContext - 管理远程连接状态的 Context
 */

import { createContext, useContext } from 'react'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface ConnectionContextValue {
  connectionState: ConnectionState
  error: string | null
  encryptionError: string | null
  joinSession: (sessionId: string) => Promise<void>
  cancelConnection: () => void
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null)

/**
 * Provider 组件由 App.tsx 中的 ConnectionProvider 内部使用
 * 这里只导出 Context 和 hook
 */
export { ConnectionContext }

/**
 * 获取连接状态的 hook
 * 必须在 ConnectionProvider 内部使用
 */
export function useConnection(): ConnectionContextValue {
  const context = useContext(ConnectionContext)
  if (!context) {
    throw new Error('useConnection must be used within ConnectionProvider')
  }
  return context
}
