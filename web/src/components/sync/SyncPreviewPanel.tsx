/**
 * SyncPreviewPanel Component
 *
 * Main control panel for sync preview UI.
 * Orchestrates FileChangeList and FileDiffViewer.
 * Provides sync/cancel actions.
 *
 * Part of Phase 3: Sync Preview UI
 */

import React, { useState, useCallback } from 'react'
import { type FileChange } from '@/opfs/types/opfs-types'
import { useWorkspaceStore, getActiveWorkspace } from '@/store/workspace.store'
import { FileChangeList } from './FileChangeList'
import { FileDiffViewer } from './FileDiffViewer'

/**
 * Empty state when no changes detected
 */
function EmptyState(): React.ReactNode {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-16 px-6">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center mb-6 shadow-sm">
        <svg
          className="w-10 h-10 text-blue-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7h12m0 0l-4-4m4 4l4 4m0 6H4m0 0l4 4m-4-4l-4 4"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-3">准备同步</h2>
      <p className="text-sm text-gray-500 max-w-md leading-relaxed">
        执行 Python 代码后，检测到的文件系统变更将在此处显示。
        您可以预览变更详情，然后选择是否同步到本机文件系统。
      </p>
      <div className="mt-8 grid grid-cols-1 gap-4 max-w-sm">
        <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-medium">
            1
          </div>
          <div className="text-left">
            <h3 className="text-sm font-medium text-gray-900 mb-1">
              执行 Python 代码
            </h3>
            <p className="text-xs text-gray-600">
              在 Agent 对话中执行 Python 文件操作代码
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4 bg-indigo-50 rounded-lg">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-medium">
            2
          </div>
          <div className="text-left">
            <h3 className="text-sm font-medium text-gray-900 mb-1">
              预览文件变更
            </h3>
            <p className="text-xs text-gray-600">
              查看所有修改、新增和删除的文件
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-lg">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-sm font-medium">
            3
          </div>
          <div className="text-left">
            <h3 className="text-sm font-medium text-gray-900 mb-1">
              确认并同步
            </h3>
            <p className="text-xs text-gray-600">
              检查差异后，将变更同步到本机文件系统
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export interface SyncPreviewPanelProps {
  /** Callback when sync is confirmed */
  onSync?: () => void
  /** Callback when sync is cancelled */
  onCancel?: () => void
}

export const SyncPreviewPanel: React.FC<SyncPreviewPanelProps> = ({
  onSync,
  onCancel,
}) => {
  const pendingChanges = useWorkspaceStore((state) => state.pendingChanges)
  const clearChanges = useWorkspaceStore((state) => state.clearChanges)
  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  /**
   * Handle file selection from list
   */
  const handleSelectFile = useCallback((file: FileChange) => {
    setSelectedFile(file)
    setSyncError(null)
  }, [])

  /**
   * Handle sync confirmation
   */
  const handleSync = useCallback(async () => {
    if (!pendingChanges || isSyncing) return

    setIsSyncing(true)
    setSyncError(null)

    try {
      // Get active workspace
      const activeWorkspace = await getActiveWorkspace()
      if (!activeWorkspace) {
        throw new Error('No active workspace')
      }

      // Get Native FS directory handle
      const { workspace } = activeWorkspace
      const nativeDir = await workspace.getNativeDirectoryHandle()
      if (!nativeDir) {
        throw new Error('请先选择项目目录')
      }

      // Sync selected changes to Native FS
      const result = await workspace.syncToNative(
        nativeDir,
        pendingChanges.changes
      )

      // Show sync result
      if (result.failed > 0) {
        setSyncError(`${result.failed} 个文件同步失败`)
      }

      // Clear pending changes after sync
      clearChanges()
      setSelectedFile(null)
      onSync?.()
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : '同步失败')
    } finally {
      setIsSyncing(false)
    }
  }, [pendingChanges, isSyncing, clearChanges, onSync])

  /**
   * Handle cancel
   */
  const handleCancel = useCallback(() => {
    clearChanges()
    setSelectedFile(null)
    setSyncError(null)
    onCancel?.()
  }, [clearChanges, onCancel])

  // Show empty state when no changes
  if (!pendingChanges || pendingChanges.changes.length === 0) {
    return <EmptyState />
  }

  const totalFiles = pendingChanges.changes.length
  const hasChanges = pendingChanges.added > 0 || pendingChanges.modified > 0 || pendingChanges.deleted > 0

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">同步预览</h2>
          <div className="flex items-center gap-2">
            {syncError && (
              <span className="text-xs text-red-600 flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-8-8 0 8 8 0 00016 0 8-8a8 8 0 000-8 8zm3.707-9.293a1 1 0 00-1.414 1.414L9 10.586 7 7H4a1 1 0 000-2 0v4a1 1 0 002 2h5L7.293 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                {syncError}
              </span>
            )}
            <button
              onClick={handleCancel}
              disabled={isSyncing}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              取消
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-6 text-sm">
          <span className="text-gray-600">
            检测到{' '}
            <span className="font-semibold text-gray-900">{totalFiles}</span>{' '}
            个文件变更
          </span>
          <div className="flex items-center gap-3 text-xs">
            {pendingChanges.added > 0 && (
              <span className="flex items-center gap-1 text-green-700">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {pendingChanges.added} 新增
              </span>
            )}
            {pendingChanges.modified > 0 && (
              <span className="flex items-center gap-1 text-blue-700">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {pendingChanges.modified} 修改
              </span>
            )}
            {pendingChanges.deleted > 0 && (
              <span className="flex items-center gap-1 text-red-700">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {pendingChanges.deleted} 删除
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File List Panel */}
        <div className="w-80 flex-shrink-0 border-r border-gray-200">
          <FileChangeList
            changes={pendingChanges}
            onSelectFile={handleSelectFile}
            selectedPath={selectedFile?.path}
          />
        </div>

        {/* Diff Viewer Panel */}
        <div className="flex-1">
          <FileDiffViewer fileChange={selectedFile} />
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {selectedFile ? (
              <span>
                已选择:{' '}
                <span className="font-medium text-gray-900">
                  {selectedFile.path.length > 40
                    ? `...${selectedFile.path.slice(-37)}`
                    : selectedFile.path}
                </span>
              </span>
            ) : (
              <span>请选择文件查看详情</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCancel}
              disabled={isSyncing}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:text-gray-400 disabled:border-gray-200 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
            >
              放弃所有变更
            </button>
            <button
              onClick={handleSync}
              disabled={!hasChanges || isSyncing}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm"
            >
              {isSyncing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  同步中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4 4h.01M5 8h14a1 1 0 110-1 0"
                    />
                  </svg>
                  确认同步到本机
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Export all components from this module
export { FileChangeList, FileDiffViewer }
