/**
 * SessionBadgeWithStorage - Storage icon with status indicator
 *
 * Simple disk icon with status dot:
 * - 🟢 Green = initialized successfully
 * - 🟡 Yellow = initializing
 * - 🔴 Red = error
 *
 * Click to open storage panel
 * Refactored to use brand components
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  Clock,
  RotateCcw,
  HardDrive,
  Trash2,
  Check,
  Info,
  AlertTriangle,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useSessionStore } from '@/store/session.store'
import { useStorageInfo, type CleanupPreview } from '@/hooks/useStorageInfo'
import { useSQLiteMode } from '@/hooks/useSQLiteMode'
import type { StorageStatus } from '@/opfs/utils/storage-utils'
import { BrandButton, BrandBadge, BrandSelectSeparator } from '@browser-fs-analyzer/ui'
import { cn } from '@/lib/utils'

export interface SessionBadgeWithStorageProps {
  /** Compact mode (show only counts) */
  compact?: boolean
}

/** Storage status to badge variant mapping */
const STORAGE_STATUS_VARIANT: Record<StorageStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  ok: 'success',
  warning: 'warning',
  urgent: 'warning',
  critical: 'error',
}

/** Storage status labels */
const STORAGE_STATUS_LABELS: Record<StorageStatus, string> = {
  ok: '正常',
  warning: '空间不足',
  urgent: '急需清理',
  critical: '严重不足',
}

/** Progress color based on usage percentage */
const getProgressColor = (percent: number): string => {
  if (percent < 70) return 'bg-emerald-500'
  if (percent < 80) return 'bg-amber-500'
  if (percent < 95) return 'bg-orange-500'
  return 'bg-danger'
}

/** Status dot color class */
const getStatusDotColor = (hasError: boolean, isInitialized: boolean, isOPFS: boolean): string => {
  if (hasError) return 'bg-danger'
  if (!isInitialized) return 'bg-amber-500'
  return isOPFS ? 'bg-emerald-500' : ''
}

export const SessionBadgeWithStorage: React.FC<SessionBadgeWithStorageProps> = () => {
  const [open, setOpen] = useState(false)
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false)
  const [cleanupPreview, setCleanupPreview] = useState<CleanupPreview | null>(null)
  const [cleanupScope, setCleanupScope] = useState<'old' | 'all'>('old')
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭 dropdown（与 LanguageSwitcher 相同的模式）
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const {
    activeSessionId,
    sessions,
    initialized,
    error: sessionError,
    switchSession,
    deleteSession,
  } = useSessionStore()
  const {
    storage,
    sessions: storageSessions,
    loading: storageLoading,
    refresh,
    getCleanupPreview,
    executeCleanup,
  } = useStorageInfo()
  const { isOPFS } = useSQLiteMode()

  // Status dot color
  const statusDotColor = getStatusDotColor(!!sessionError, initialized, isOPFS)
  const showStatusDot = Boolean(sessionError || !initialized || isOPFS)

  // Handle session switch
  const handleSwitch = useCallback(
    async (sessionId: string) => {
      try {
        await switchSession(sessionId)
        setOpen(false)
      } catch (error) {
        console.error('[SessionBadgeWithStorage] Failed to switch session:', error)
      }
    },
    [switchSession]
  )

  // Handle session delete
  const handleDelete = useCallback(
    async (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation()

      if (!confirm('确定要删除此会话吗？所有缓存、待同步和撤销记录将被删除。')) {
        return
      }

      try {
        await deleteSession(sessionId)
        toast.success('会话已删除')
        await refresh()
      } catch (error) {
        console.error('[SessionBadgeWithStorage] Failed to delete session:', error)
        toast.error('删除会话失败')
      }
    },
    [deleteSession, refresh]
  )

  // Handle open cleanup dialog
  const handleOpenCleanupDialog = useCallback(
    async (scope: 'old' | 'all') => {
      setCleanupScope(scope)
      setCleanupLoading(true)

      try {
        const preview = await getCleanupPreview(scope, 30)
        if (preview) {
          setCleanupPreview(preview)
          setCleanupDialogOpen(true)
        } else {
          toast.info(scope === 'old' ? '没有 30 天未活跃的会话可清理' : '没有可清理的缓存')
        }
      } catch (error) {
        console.error('[SessionBadgeWithStorage] Failed to get cleanup preview:', error)
        toast.error('获取清理信息失败')
      } finally {
        setCleanupLoading(false)
      }
    },
    [getCleanupPreview]
  )

  // Handle execute cleanup
  const handleExecuteCleanup = useCallback(async () => {
    if (!cleanupPreview) return

    setCleanupLoading(true)

    try {
      const cleaned = await executeCleanup(cleanupScope, 30)
      toast.success(`已清理 ${cleaned} 个会话的文件缓存，释放 ${cleanupPreview.totalSizeFormatted}`)
      setCleanupDialogOpen(false)
      setCleanupPreview(null)
      await refresh()
    } catch (error) {
      console.error('[SessionBadgeWithStorage] Failed to execute cleanup:', error)
      toast.error('清理失败，请重试')
    } finally {
      setCleanupLoading(false)
    }
  }, [cleanupPreview, cleanupScope, executeCleanup, refresh])

  // Get current session info
  const currentSession = sessions.find((s) => s.id === activeSessionId)

  return (
    <div className="relative" ref={containerRef}>
      <BrandButton iconButton variant="ghost" onClick={() => setOpen(!open)} title="存储空间">
        <HardDrive className="h-5 w-5" />
      </BrandButton>
      {/* Status dot: sibling element to avoid overflow clipping */}
      {showStatusDot && (
        <span className={cn('absolute right-0 top-0 h-2 w-2 rounded-full', statusDotColor)} />
      )}

      {open && <SessionDropdown />}

      {/* Cleanup Confirmation Dialog */}
      {cleanupDialogOpen && cleanupPreview && <CleanupDialog />}
    </div>
  )

  function CleanupDialog() {
    if (!cleanupPreview) return null

    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-[60] bg-black/20"
          onClick={() => setCleanupDialogOpen(false)}
        />
        {/* Dialog */}
        <div className="fixed left-1/2 top-1/2 z-[60] w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-200 bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-secondary" />
              <span className="text-sm font-semibold text-secondary">清理文件缓存</span>
            </div>
            <button
              type="button"
              onClick={() => setCleanupDialogOpen(false)}
              className="rounded p-1 text-muted transition-colors hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="px-4 py-3">
            {cleanupPreview.hasUnsavedChanges && (
              <div className="mb-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="text-[10px] text-amber-800">
                  <span className="font-semibold">注意：</span>
                  将丢弃 {cleanupPreview.pendingCount} 个未保存的修改和{' '}
                  {cleanupPreview.undoCount} 条撤销记录
                </div>
              </div>
            )}

            <div className="space-y-2 text-xs text-secondary">
              <div>将清理：</div>
              <div className="ml-4 space-y-1">
                <div>
                  • {cleanupPreview.sessionCount} 个会话
                  {cleanupScope === 'old' && ' (30天未活跃)'}
                </div>
                <div>• 约 {cleanupPreview.totalSizeFormatted} 文件缓存</div>
                <div
                  className={cn(
                    cleanupPreview.hasUnsavedChanges ? 'text-amber-600' : 'text-emerald-600'
                  )}
                >
                  • {cleanupPreview.pendingCount} 个未保存的修改
                </div>
              </div>
            </div>

            {/* Scope Selection */}
            <div className="mt-3 space-y-2">
              <div className="text-[10px] font-medium text-muted uppercase">选择清理范围</div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setCleanupScope('old')}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors',
                    cleanupScope === 'old'
                      ? 'bg-primary-50 text-primary-700'
                      : 'hover:bg-gray-50 text-secondary'
                  )}
                >
                  <div
                    className={cn(
                      'h-3 w-3 rounded-full border',
                      cleanupScope === 'old' ? 'border-primary-500 bg-primary-500' : 'border-gray-300'
                    )}
                  />
                  仅清理旧会话 (30天未活跃)
                </button>
                <button
                  type="button"
                  onClick={() => setCleanupScope('all')}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors',
                    cleanupScope === 'all'
                      ? 'bg-primary-50 text-primary-700'
                      : 'hover:bg-gray-50 text-secondary'
                  )}
                >
                  <div
                    className={cn(
                      'h-3 w-3 rounded-full border',
                      cleanupScope === 'all' ? 'border-primary-500 bg-primary-500' : 'border-gray-300'
                    )}
                  />
                  清理所有会话缓存
                </button>
              </div>
            </div>

            {/* Help text */}
            <div className="mt-3 flex items-start gap-1.5 text-[9px] leading-tight text-muted">
              <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
              <p>对话记录和会话信息不会被删除，下次访问文件时会重新从本地磁盘读取。</p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-2">
            <button
              type="button"
              onClick={() => setCleanupDialogOpen(false)}
              disabled={cleanupLoading}
              className="rounded-md px-3 py-1.5 text-xs text-secondary transition-colors hover:bg-gray-100 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleExecuteCleanup}
              disabled={cleanupLoading}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs text-white transition-colors',
                cleanupPreview.hasUnsavedChanges
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-danger hover:bg-red-600',
                'disabled:opacity-50'
              )}
            >
              {cleanupLoading ? '清理中...' : '确认清理'}
            </button>
          </div>
        </div>
      </>
    )
  }

  function SessionDropdown() {
    return (
      <>
        {/* Dropdown menu - 使用与 LanguageSwitcher 相同的 z-index */}
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
          {/* Header - Current session */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-tertiary text-xs font-medium">当前会话</span>
              {currentSession && (
                <span className="text-xs font-semibold text-primary-600">
                  {currentSession.name}
                </span>
              )}
            </div>
          </div>

          <BrandSelectSeparator />

          {/* Storage overview */}
          <div className="px-4 py-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-secondary">
              <HardDrive className="h-3.5 w-3.5" />
              <span>存储空间 (浏览器配额)</span>
              {storageLoading && <span className="text-muted">加载中...</span>}
            </div>

            {storage && (
              <>
                {/* Progress bar using BrandProgress */}
                <div className="mb-3">
                  <div className="text-tertiary mb-1.5 flex items-center justify-between text-[10px]">
                    <span>
                      {storage.usageFormatted} / {storage.quotaFormatted}
                    </span>
                    <span className="font-medium">{storage.usagePercent.toFixed(1)}%</span>
                  </div>
                  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        getProgressColor(storage.usagePercent)
                      )}
                      style={{ width: `${Math.max(storage.usagePercent, 2)}%` }}
                    />
                  </div>
                </div>

                {/* Status badge and note */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <BrandBadge
                      variant={STORAGE_STATUS_VARIANT[storage.status]}
                      shape="pill"
                      className="!px-1.5 !py-0.5 !text-[10px]"
                    >
                      {STORAGE_STATUS_LABELS[storage.status]}
                    </BrandBadge>
                    <button
                      type="button"
                      onClick={() => refresh(true)}
                      className="text-[10px] text-primary-600 hover:underline"
                      title="计算每个会话的缓存大小（可能较慢）"
                    >
                      刷新
                    </button>
                  </div>
                  {/* Explanatory note */}
                  <div className="flex items-start gap-1.5 text-[9px] leading-tight text-muted">
                    <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                    <p>配额是浏览器允许的上限，不等于实际剩余空间。写入时若超出实际空间会报错。</p>
                  </div>
                </div>
              </>
            )}

            {!storage && !storageLoading && (
              <p className="text-[10px] text-muted">无法获取存储信息</p>
            )}
          </div>

          <BrandSelectSeparator />

          {/* Session list */}
          <div className="custom-scrollbar max-h-60 overflow-y-auto">
            <div className="px-4 py-2">
              <span className="text-xs font-semibold text-secondary">
                所有会话 ({sessions.length})
              </span>
            </div>

            {storageSessions.length === 0 ? (
              <div className="px-4 py-4 text-center text-xs text-muted">暂无会话</div>
            ) : (
              <ul>
                {storageSessions.map((session) => {
                  const isActive = session.id === activeSessionId
                  const hasPending = session.pendingCount > 0
                  const hasUndo = session.undoCount > 0

                  return (
                    <li
                      key={session.id}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 transition-colors',
                        isActive ? 'bg-primary-50' : 'hover:bg-gray-50'
                      )}
                    >
                      {/* Active indicator */}
                      {isActive && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                      {!isActive && <span className="h-4 w-4 shrink-0" />}

                      {/* Session info */}
                      <button
                        type="button"
                        onClick={() => handleSwitch(session.id)}
                        className="flex flex-1 flex-col items-start text-left"
                      >
                        <div className="flex w-full items-center gap-2">
                          <span className="truncate text-xs font-medium text-primary">
                            {session.name}
                          </span>
                          <span className="ml-auto text-[10px] text-muted">
                            {session.cacheSizeFormatted}
                          </span>
                        </div>

                        {/* Status badges */}
                        <div className="mt-0.5 flex items-center gap-2">
                          {hasPending && (
                            <BrandBadge
                              variant="warning"
                              shape="pill"
                              className="!gap-0.5 !px-1.5 !py-0 !text-[10px]"
                            >
                              <Clock className="h-2.5 w-2.5" />
                              {session.pendingCount}
                            </BrandBadge>
                          )}
                          {hasUndo && (
                            <BrandBadge
                              type="tag"
                              color="blue"
                              className="!gap-0.5 !px-1.5 !py-0 !text-[10px]"
                            >
                              <RotateCcw className="h-2.5 w-2.5" />
                              {session.undoCount}
                            </BrandBadge>
                          )}
                          {!hasPending && !hasUndo && (
                            <span className="text-[10px] text-muted">无变更</span>
                          )}
                        </div>
                      </button>

                      {/* Delete button */}
                      {!isActive && (
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, session.id)}
                          className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                          title="删除会话"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <BrandSelectSeparator />

          {/* Footer - Cleanup Action */}
          <div className="px-4 py-2">
            <button
              type="button"
              onClick={() => handleOpenCleanupDialog('old')}
              disabled={cleanupLoading}
              className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs text-secondary transition-colors hover:bg-gray-50 disabled:opacity-50"
              title="清理旧会话的文件缓存，释放存储空间"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {cleanupLoading ? '加载中...' : '清理文件缓存'}
            </button>
            <p className="px-1 pt-1.5 text-[9px] leading-tight text-muted">
              仅清理文件缓存，不影响对话记录和会话信息
            </p>
          </div>
        </div>
      </>
    )
  }
}
