/**
 * RecentFiles - Display recently accessed files
 */

import { Clock, File, Folder } from 'lucide-react'
import { useRemoteStore } from '../store/remote.store'
import type { FileEntry } from '../types/remote'

export function RecentFiles() {
  const { recentFiles, selectedFiles } = useRemoteStore()

  if (recentFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <Clock className="w-12 h-12 mb-3 opacity-50" />
        <p>暂无最近文件</p>
        <p className="text-sm">在 Host 端查看文件后会自动显示在这里</p>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4 text-gray-600 dark:text-gray-400">
        <Clock className="w-4 h-4" />
        <span className="text-sm">最近使用的文件</span>
      </div>

      <div className="space-y-1">
        {recentFiles.map((file: FileEntry) => (
          <FileResultItem
            key={file.path}
            file={file}
            selected={selectedFiles.includes(file.path)}
          />
        ))}
      </div>
    </div>
  )
}

interface FileResultItemProps {
  file: FileEntry
  selected: boolean
}

function FileResultItem({ file, selected }: FileResultItemProps) {
  const { toggleFileSelection } = useRemoteStore()

  return (
    <button
      onClick={() => toggleFileSelection(file.path)}
      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
        selected
          ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent'
      }`}
    >
      {file.type === 'directory' ? (
        <Folder className="w-5 h-5 text-blue-500 flex-shrink-0" />
      ) : (
        <File className="w-5 h-5 text-gray-500 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{file.name}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{file.path}</div>
      </div>
      {selected && (
        <div className="text-blue-500">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 000-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}
    </button>
  )
}
