/**
 * FolderSelector - Folder selector component
 *
 * Features:
 * - Select folder (direct click when no folder selected)
 * - Switch folder (dropdown when folder selected)
 * - Restore folder handle permission
 * - Release folder handle
 * - Copy folder path
 */

import { useState, useRef, useEffect } from 'react'
import { FolderOpen, ChevronDown, Copy, RefreshCw, Loader2, AlertCircle } from 'lucide-react'
import { useAgentStore } from '@/store/agent.store'
import { selectFolderReadWrite } from '@/services/fsAccess.service'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'

type MenuState = 'closed' | 'open' | 'selecting'

// IndexedDB helper to load handle
async function loadHandleFromIndexedDB(): Promise<FileSystemDirectoryHandle | null> {
  const DB_NAME = 'bfosa-dir-handle'
  const STORE_NAME = 'handles'
  const KEY = 'directory'

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(KEY)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
      db.close()
    }
    request.onerror = () => reject(request.error)
  })
}

export function FolderSelector() {
  const t = useT()
  const { directoryHandle, directoryName, setDirectoryHandle, isRestoringHandle } = useAgentStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const [menuState, setMenuState] = useState<MenuState>('closed')
  const [error, setError] = useState<string | null>(null)
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)

  const isMenuOpen = menuState === 'open'
  const isSelecting = menuState === 'selecting'

  // Pre-load handle from IndexedDB on mount (no user activation needed)
  useEffect(() => {
    loadHandleFromIndexedDB()
      .then((handle) => {
        console.log('[FolderSelector] Pre-loaded handle from IndexedDB:', handle?.name)
        if (handle && !directoryHandle) {
          setPendingHandle(handle)
        }
      })
      .catch((err) => {
        console.log('[FolderSelector] No handle in IndexedDB:', err)
      })
  }, [directoryHandle])

  // Click outside to close menu
  useEffect(() => {
    if (!isMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMenuState('closed')
        setError(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])

  // Handle permission restore button click
  const handleRestorePermission = async () => {
    if (!pendingHandle) return

    setIsRestoring(true)
    try {
      console.log('[FolderSelector] Requesting permission for:', pendingHandle.name)
      const result = await pendingHandle.requestPermission({ mode: 'readwrite' })
      console.log('[FolderSelector] Permission result:', result)

      if (result === 'granted') {
        setDirectoryHandle(pendingHandle)
        setPendingHandle(null)
      } else {
        setError('权限被拒绝')
      }
    } catch (err) {
      console.error('[FolderSelector] Permission request error:', err)
      setError(err instanceof Error ? err.message : '权限请求失败')
    } finally {
      setIsRestoring(false)
    }
  }

  const handleToggle = () => {
    if (isSelecting || isRestoring) return

    // If there's a pending handle, don't toggle menu
    // User should click the restore button instead
    if (pendingHandle && !directoryHandle) {
      return
    }

    if (!directoryHandle) {
      handleSelectFolder()
      return
    }

    setMenuState(isMenuOpen ? 'closed' : 'open')
    setError(null)
  }

  const handleSelectFolder = async () => {
    setMenuState('selecting')
    setError(null)

    try {
      const handle = await selectFolderReadWrite()
      setDirectoryHandle(handle)
      setMenuState('closed')
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'User cancelled') {
          setMenuState(directoryHandle ? 'open' : 'closed')
        } else {
          setError(err.message)
          setMenuState(directoryHandle ? 'open' : 'closed')
        }
      }
    }
  }

  const handleRelease = () => {
    setDirectoryHandle(null)
    setPendingHandle(null)
    setMenuState('closed')
    setError(null)
  }

  const handleCopyPath = async () => {
    if (directoryName) {
      await navigator.clipboard.writeText(directoryName)
      setMenuState('closed')
    }
  }

  // Button content
  const renderButtonContent = () => {
    if (isRestoring || isRestoringHandle) {
      return (
        <>
          <Loader2 className="h-[14px] w-[14px] animate-spin text-primary-600" />
          <span className="text-xs font-normal text-secondary">恢复中...</span>
        </>
      )
    }

    if (pendingHandle && !directoryHandle) {
      return (
        <>
          <AlertCircle className="h-[14px] w-[14px] text-warning" />
          <span className="text-xs font-normal text-warning">需要恢复权限</span>
        </>
      )
    }

    if (directoryHandle && directoryName) {
      return (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <FolderOpen className="h-[14px] w-[14px] text-primary-600" />
          <span className="max-w-[120px] truncate text-xs font-normal text-secondary">
            {directoryName}
          </span>
          <ChevronDown
            className={cn('text-tertiary h-3 w-3 transition-transform', isMenuOpen && 'rotate-180')}
          />
        </>
      )
    }

    return (
      <>
        <FolderOpen className="h-[14px] w-[14px]" />
        <span className="text-xs font-normal text-secondary">{t('folderSelector.openFolder')}</span>
      </>
    )
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Restore permission button when there's a pending handle */}
      {pendingHandle && !directoryHandle && (
        <button
          type="button"
          onClick={handleRestorePermission}
          disabled={isRestoring}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md border-2 border-amber-500 bg-amber-50 px-3 py-1',
            'text-xs font-medium text-amber-700',
            'transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500',
            isRestoring && 'cursor-wait opacity-70'
          )}
          title={`恢复文件夹访问权限 (${pendingHandle.name})`}
        >
          <AlertCircle className="h-[14px] w-[14px] text-amber-600" />
          <span>恢复权限</span>
          <span className="text-amber-500">({pendingHandle.name})</span>
        </button>
      )}

      {/* Normal folder selector button when no pending handle */}
      {(!pendingHandle || directoryHandle) && (
        <button
          type="button"
          onClick={handleToggle}
          disabled={isSelecting || isRestoringHandle || isRestoring}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1',
            'text-xs font-normal text-secondary',
            'transition-colors hover:bg-primary-50 focus:outline-none',
            (isSelecting || isRestoringHandle || isRestoring) && 'cursor-wait opacity-70'
          )}
          title={directoryName ? t('folderSelector.switchFolder') : t('folderSelector.openFolder')}
        >
          {renderButtonContent()}
        </button>
      )}

      {/* Dropdown menu */}
      {isMenuOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] whitespace-nowrap rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {/* Switch folder */}
          <button
            type="button"
            onClick={handleSelectFolder}
            disabled={isSelecting || isRestoringHandle}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-sm text-secondary',
              'hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50'
            )}
          >
            <RefreshCw className={cn('h-4 w-4', isSelecting && 'animate-spin')} />
            <span>{t('folderSelector.switchFolder')}</span>
          </button>

          {/* Release handle - only shown when folder is selected */}
          {directoryHandle && (
            <button
              type="button"
              onClick={handleRelease}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger-bg"
            >
              <FolderOpen className="h-4 w-4" />
              <span>{t('folderSelector.releaseHandle')}</span>
            </button>
          )}

          {/* Copy path - only shown when folder is selected */}
          {directoryHandle && directoryName && (
            <button
              type="button"
              onClick={handleCopyPath}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-secondary hover:bg-gray-50"
            >
              <Copy className="h-4 w-4" />
              <span>{t('folderSelector.copyPath')}</span>
            </button>
          )}

          {/* Error message */}
          {error && (
            <div className="mx-2 mt-1 rounded bg-danger-bg px-2 py-1 text-xs text-danger">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
