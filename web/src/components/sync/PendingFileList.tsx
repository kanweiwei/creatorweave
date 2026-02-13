/**
 * PendingFileList Component - 紧凑待同步文件列表
 *
 * 方案 A: 紧凑内联列表
 * - 单行紧凑显示文件
 * - 支持全选/批量操作
 * - 支持单个文件删除
 * - hover 预览效果
 */

import React, { useState, useCallback } from 'react'
import { type ChangeDetectionResult, type FileChange } from '@/opfs/types/opfs-types'
import { getChangeTypeInfo, formatFileSize, FileIcon } from '@/utils/change-helpers'
import { BrandButton, BrandCheckbox } from '@browser-fs-analyzer/ui'
import { Badge } from '@/components/ui/badge'
import { Download, Trash2, X } from 'lucide-react'

interface PendingFileListProps {
  /** Change detection result from workspace store */
  changes: ChangeDetectionResult
  /** Callback when user selects a file */
  onSelectFile?: (file: FileChange) => void
  /** Currently selected file path */
  selectedPath?: string
  /** Callback when user requests sync */
  onSync?: () => void
  /** Callback when user requests clear all */
  onClear?: () => void
  /** Callback when user removes a single file */
  onRemoveFile?: (path: string) => void
  /** Whether sync operation is in progress */
  isSyncing?: boolean
}

export const PendingFileList: React.FC<PendingFileListProps> = ({
  changes,
  onSelectFile,
  selectedPath,
  onSync,
  onClear,
  onRemoveFile,
  isSyncing = false,
}) => {
  const [selectAll, setSelectAll] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

  // 计算选中的数量
  const selectedCount = selectedItems.size

  // 处理单个文件选择/取消选择
  const handleToggleSelect = useCallback(
    (path: string) => {
      const newSelected = new Set(selectedItems)
      if (newSelected.has(path)) {
        newSelected.delete(path)
      } else {
        newSelected.add(path)
      }
      setSelectedItems(newSelected)
      setSelectAll(newSelected.size === changes.changes.length - 1)
    },
    [selectedItems, changes.changes.length]
  )

  // 处理全选/取消全选
  const handleToggleSelectAll = useCallback(() => {
    const newSelectAll = !selectAll
    setSelectAll(newSelectAll)
    if (newSelectAll) {
      setSelectedItems(new Set(changes.changes.map((c) => c.path)))
    } else {
      setSelectedItems(new Set())
    }
  }, [selectAll, changes.changes])

  // 处理删除单个文件
  const handleRemoveFile = useCallback(
    (path: string, e: React.MouseEvent) => {
      e.stopPropagation() // 防止触发选择
      onRemoveFile?.(path)
    },
    [onRemoveFile]
  )

  // 检查是否有选中项
  const hasSelection = selectedCount > 0

  return (
    <div className="flex flex-col h-full">
      {/* 紧凑标题栏 */}
      <div className="border-subtle flex items-center justify-between border-b bg-elevated px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-primary">待同步文件</span>
          <Badge variant="warning">{changes.changes.length}</Badge>
        </div>
        {hasSelection && (
          <span className="text-xs text-secondary">
            已选 {selectedCount} 项
          </span>
        )}
      </div>

      {/* 紧凑文件列表 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="divide-y divide-subtle/50">
          {changes.changes.map((change, index) => {
            const typeInfo = getChangeTypeInfo(change.type)
            const isSelected = selectedItems.has(change.path) || change.path === selectedPath

            return (
              <div
                key={`${change.path}-${index}`}
                className={`group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-hover ${
                  isSelected ? 'bg-primary-50/50' : ''
                }`}
              >
                {/* 选择框 */}
                <BrandCheckbox
                  checked={isSelected}
                  onCheckedChange={() => handleToggleSelect(change.path)}
                  className="shrink-0"
                />

                {/* 文件图标 */}
                <span className="text-tertiary flex-shrink-0">
                  <FileIcon filename={change.path} className="w-4 h-4" />
                </span>

                {/* 文件名 */}
                <span
                  className="flex-1 text-sm text-primary truncate min-w-0 cursor-pointer"
                  onClick={() => onSelectFile?.(change)}
                  title={change.path}
                >
                  {change.path.split('/').pop() || change.path}
                </span>

                {/* 变更类型徽标 */}
                <Badge className={`${typeInfo.bg} ${typeInfo.color} flex-shrink-0`}>
                  {typeInfo.label}
                </Badge>

                {/* 文件大小 */}
                <span className="text-xs text-tertiary flex-shrink-0 w-16 text-right">
                  {formatFileSize(change.size)}
                </span>

                {/* 删除按钮 */}
                <BrandButton
                  variant="ghost"
                  onClick={(e) => handleRemoveFile(change.path, e as any)}
                  className="shrink-0 text-tertiary hover:text-destructive p-1"
                  title="从列表中移除"
                >
                  <X className="w-3.5 h-3.5" />
                </BrandButton>
              </div>
            )
          })}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="border-subtle flex items-center justify-between border-t bg-elevated px-3 py-2">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
            <BrandCheckbox
              checked={selectAll}
              onCheckedChange={handleToggleSelectAll}
            />
            <span>全选</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <BrandButton
            variant="outline"
            onClick={onClear}
            disabled={isSyncing}
          >
            <Trash2 className="w-4 h-4" />
            清空
          </BrandButton>
          <BrandButton
            variant="primary"
            onClick={onSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                同步中...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                同步全部
              </>
            )}
          </BrandButton>
        </div>
      </div>
    </div>
  )
}
