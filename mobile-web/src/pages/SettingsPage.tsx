/**
 * SettingsPage - 设置页面
 * 显示连接状态、会话管理、关于信息
 */

import { useNavigate } from 'react-router-dom'
import { Lock, Trash2, Info, LogOut } from 'lucide-react'
import { useRemoteStore } from '../store/remote.store'
import { useConversationStore } from '../store/conversation.store'

export function SettingsPage() {
  const navigate = useNavigate()
  const { connectionState, encryptionState, sessionId, hostRootName } = useRemoteStore()
  const { clear: clearConversations } = useConversationStore()

  const handleDisconnect = () => {
    // 断开连接 - 逻辑在 App.tsx 中处理
    navigate('/input')
  }

  const handleClearData = () => {
    if (confirm('确定要清除本地会话数据吗？')) {
      clearConversations()
    }
  }

  const getStatusText = () => {
    switch (connectionState) {
      case 'connected':
        return '已连接'
      case 'connecting':
      case 'reconnecting':
        return '连接中...'
      default:
        return '未连接'
    }
  }

  const getEncryptionText = () => {
    switch (encryptionState) {
      case 'ready':
        return '端到端加密已启用'
      case 'exchanging':
        return '密钥交换中...'
      case 'error':
        return '加密错误'
      default:
        return '未加密'
    }
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* 连接状态 */}
        <section className="bg-white rounded-xl p-4">
          <h2 className="text-sm font-medium text-neutral-600 mb-3">连接状态</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600">状态</span>
              <span className="text-sm font-medium">{getStatusText()}</span>
            </div>
            {hostRootName && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-600 flex items-center gap-1">
                  <Info className="h-4 w-4" />
                  目录
                </span>
                <span className="text-sm font-mono text-neutral-800 truncate max-w-[200px]">
                  {hostRootName}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600 flex items-center gap-1">
                <Lock className="h-4 w-4" />
                加密
              </span>
              <span className="text-sm">{getEncryptionText()}</span>
            </div>
            {sessionId && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-600">Session ID</span>
                <span className="text-xs font-mono text-neutral-400 truncate max-w-[150px]">
                  {sessionId.slice(0, 8)}...
                </span>
              </div>
            )}
          </div>
        </section>

        {/* 会话管理 */}
        <section className="bg-white rounded-xl p-4">
          <h2 className="text-sm font-medium text-neutral-600 mb-3">会话管理</h2>
          <button
            onClick={handleClearData}
            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            <span className="text-sm flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-neutral-400" />
              清除本地会话数据
            </span>
          </button>
        </section>

        {/* 关于 */}
        <section className="bg-white rounded-xl p-4">
          <h2 className="text-sm font-medium text-neutral-600 mb-3">关于</h2>
          <p className="text-sm text-neutral-500">BFOSA Remote v1.0.0</p>
        </section>

        {/* 断开连接 */}
        {connectionState === 'connected' && (
          <button
            onClick={handleDisconnect}
            className="w-full py-3 text-red-600 font-medium bg-white rounded-xl hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            断开连接
          </button>
        )}
      </div>
    </div>
  )
}
