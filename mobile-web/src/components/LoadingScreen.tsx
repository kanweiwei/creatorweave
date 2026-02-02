/**
 * LoadingScreen - 连接/重连期间的加载动画
 * 显示重连进度和取消按钮
 */

import { X } from 'lucide-react'
import { useRemoteStore } from '../store/remote.store'
import { useConnection } from '../contexts/ConnectionContext'

export function LoadingScreen() {
  const { connectionState, reconnectAttempt, reconnectMaxAttempts } = useRemoteStore()
  const { cancelConnection } = useConnection()

  const isReconnecting = connectionState === 'reconnecting'
  const isConnecting = connectionState === 'connecting' || connectionState === 'reconnecting'
  const showCancelButton = isConnecting
  const showProgress = isReconnecting && reconnectAttempt > 0

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-neutral-50 px-4">
      {/* Loading Spinner */}
      <div className="relative w-16 h-16 mb-6">
        <div className="absolute inset-0 rounded-full border-4 border-primary-200"></div>
        <div className="absolute inset-0 rounded-full border-4 border-t-primary-600 animate-spin"></div>
      </div>

      {/* Loading Text */}
      <h2 className="text-lg font-semibold text-neutral-800 mb-2">
        {isReconnecting ? '正在重连...' : '正在连接...'}
      </h2>
      <p className="text-sm text-neutral-500">
        {isReconnecting
          ? '请稍候，正在恢复会话'
          : '正在建立安全连接'}
      </p>

      {/* Reconnecting Progress */}
      {showProgress && (
        <div className="mt-6 w-full max-w-xs bg-neutral-100 px-4 py-3 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-neutral-600">重连进度</span>
            <span className="text-xs text-neutral-400">
              {Math.min(reconnectAttempt, reconnectMaxAttempts)} / {reconnectMaxAttempts}
            </span>
          </div>
          <div className="w-full bg-neutral-200 rounded-full h-2">
            <div
              className="bg-primary-500 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${(Math.min(reconnectAttempt, reconnectMaxAttempts) / reconnectMaxAttempts) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Cancel Button */}
      {showCancelButton && (
        <button
          onClick={cancelConnection}
          className="mt-4 px-4 py-2 rounded-xl bg-neutral-200 text-neutral-600 hover:bg-neutral-300 transition-colors flex items-center gap-2 text-sm font-medium"
          aria-label="取消连接"
        >
          <X className="w-4 h-4" />
          取消
        </button>
      )}
    </div>
  )
}
