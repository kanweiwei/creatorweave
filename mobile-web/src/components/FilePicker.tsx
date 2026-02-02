/**
 * FilePicker - Modal for selecting files with @file syntax support
 */

import { useState, useEffect } from 'react'
import { Search, Clock, X } from 'lucide-react'
import { useRemoteStore } from '../store/remote.store'
import { FileSearch } from './FileSearch'
import { RecentFiles } from './RecentFiles'

interface FilePickerProps {
  open: boolean
  onClose: () => void
}

export function FilePicker({ open, onClose }: FilePickerProps) {
  const [activeTab, setActiveTab] = useState<'search' | 'recent'>('search')
  const { selectedFiles, clearFileSelection, toggleFileSelection, socket } = useRemoteStore()

  // When opening, request current file tree from Host
  useEffect(() => {
    if (open && socket?.connected) {
      console.log('[FilePicker] Requesting file tree from Host')
      socket.emit('message', {
        type: 'file:tree-request',
      })
    }
  }, [open, socket])

  // Don't render if not open
  if (!open) return null

  const handleConfirm = () => {
    onClose()
  }

  const handleRemove = (path: string) => {
    toggleFileSelection(path)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold">选择文件</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Files */}
        {selectedFiles.length > 0 && (
          <div className="p-3 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                已选择 {selectedFiles.length} 个文件
              </span>
              <button
                onClick={clearFileSelection}
                className="text-xs text-red-500 hover:text-red-600"
              >
                清空
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedFiles.map((path: string) => {
                const name = path.split('/').pop() || path
                return (
                  <div
                    key={path}
                    className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-sm"
                  >
                    <span className="truncate max-w-[150px]">@{name}</span>
                    <button
                      onClick={() => handleRemove(path)}
                      className="hover:text-blue-600 dark:hover:text-blue-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b dark:border-gray-700">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 border-b-2 transition-colors ${
              activeTab === 'search'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Search className="w-4 h-4" />
            搜索
          </button>
          <button
            onClick={() => setActiveTab('recent')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 border-b-2 transition-colors ${
              activeTab === 'recent'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Clock className="w-4 h-4" />
            最近
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {activeTab === 'search' ? <FileSearch /> : <RecentFiles />}
        </div>

        {/* Footer */}
        <div className="p-4 border-t dark:border-gray-700 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
