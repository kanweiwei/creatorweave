/**
 * UndoPanel - displays file modification history with undo buttons.
 *
 * Phase 3 Integration:
 * - Shows undo records from OPFS session workspace
 * - Supports both undo and redo operations
 * - Falls back to legacy undo store for backward compatibility
 */

import { Undo2, Redo2, Trash2, FileEdit, FilePlus, FileX } from 'lucide-react'
import { useOPFSStore } from '@/store/opfs.store'
import { useUndoStore } from '@/store/undo.store'
import type { UndoRecord } from '@/opfs/types/opfs-types'
import type { FileModification } from '@/undo/undo-types'

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function ModIcon({
  type,
  undone,
}: {
  type: UndoRecord['type'] | FileModification['type']
  undone?: boolean
}) {
  if (undone) {
    return <Undo2 className="h-3.5 w-3.5 text-neutral-400" />
  }

  switch (type) {
    case 'create':
      return <FilePlus className="h-3.5 w-3.5 text-green-500" />
    case 'modify':
      return <FileEdit className="h-3.5 w-3.5 text-amber-500" />
    case 'delete':
      return <FileX className="h-3.5 w-3.5 text-red-500" />
  }
}

function ModLabel({
  type,
  undone,
}: {
  type: UndoRecord['type'] | FileModification['type']
  undone?: boolean
}) {
  if (undone) {
    return <span className="text-neutral-400">已撤销</span>
  }

  switch (type) {
    case 'create':
      return <span className="text-green-600">创建</span>
    case 'modify':
      return <span className="text-amber-600">修改</span>
    case 'delete':
      return <span className="text-red-600">删除</span>
  }
}

export function UndoPanel() {
  // Get OPFS undo records (new Phase 2 implementation)
  const { getUndoRecords, undo: opfsUndo, redo: opfsRedo } = useOPFSStore()
  const opfsRecords = getUndoRecords()

  // Legacy undo store for backward compatibility
  const {
    modifications: legacyModifications,
    undo: legacyUndo,
    clear: legacyClear,
  } = useUndoStore()

  // Use OPFS records if available, otherwise fall back to legacy
  const useOpfs = opfsRecords.length > 0 || legacyModifications.length === 0
  const records = useOpfs ? opfsRecords : legacyModifications
  const activeCount = records.filter((r) => !r.undone).length

  const handleUndo = async (id: string) => {
    if (useOpfs) {
      await opfsUndo(id)
    } else {
      legacyUndo(id)
    }
  }

  const handleRedo = async (id: string) => {
    if (useOpfs) {
      await opfsRedo(id)
    }
  }

  const handleClear = () => {
    if (!useOpfs) {
      legacyClear()
    }
    // OPFS doesn't support clear - use clearSession instead
  }

  if (records.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-center text-xs text-neutral-400">暂无文件变更记录</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-700">
        <span className="text-xs font-medium text-neutral-600">
          变更记录 ({activeCount}/{records.length})
        </span>
        {!useOpfs && records.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-500"
            title="清除所有记录"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Modification list */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {records.map((record) => {
          const isUndone = 'undone' in record ? record.undone : false

          return (
            <div
              key={record.id}
              className={`flex items-start gap-2 border-b border-neutral-100 px-3 py-2 ${
                isUndone ? 'opacity-50' : ''
              }`}
            >
              <ModIcon type={record.type} undone={isUndone} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <ModLabel type={record.type} undone={isUndone} />
                  <span className="truncate text-xs text-neutral-700" title={record.path}>
                    {record.path.split('/').pop()}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-neutral-400" title={record.path}>
                  {record.path}
                </div>
                <div className="text-[10px] text-neutral-400">{formatTime(record.timestamp)}</div>
              </div>

              {/* Undo/Redo buttons */}
              {!isUndone && (
                <button
                  type="button"
                  onClick={() => handleUndo(record.id)}
                  className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-primary-600"
                  title="撤销此变更"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              )}

              {isUndone && useOpfs && (
                <button
                  type="button"
                  onClick={() => handleRedo(record.id)}
                  className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-primary-600"
                  title="重做此变更"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </button>
              )}

              {isUndone && !useOpfs && (
                <span className="shrink-0 text-[10px] text-neutral-400">已撤销</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
