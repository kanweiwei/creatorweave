/**
 * FileDiffViewer Component
 *
 * Displays side-by-side diff between OPFS and Native FS versions.
 * Uses Monaco DiffEditor for text comparison.
 */

import React, { Suspense, useEffect, useState } from 'react'
import { type ChangeType, type FileChange } from '@/opfs/types/opfs-types'
import { getActiveWorkspace } from '@/store/workspace.store'
import {
  isImageFile,
  fileExistsInNativeFS,
  readFileFromOPFS,
  readFileFromNativeFS,
  readBinaryFileFromOPFS,
  readBinaryFileFromNativeFS,
} from '@/opfs'

const MonacoDiffEditor = React.lazy(() => import('./MonacoDiffEditor'))

interface FileDiffViewerProps {
  fileChange: FileChange | null
}

type FileContentState = {
  opfs: string | null
  native: string | null
  opfsImageUrl: string | null
  nativeImageUrl: string | null
  showNativePanel: boolean
  loading: boolean
  error: string | null
}

function getImageMimeType(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.ico')) return 'image/x-icon'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  if (lower.endsWith('.avif')) return 'image/avif'
  if (lower.endsWith('.heic')) return 'image/heic'
  if (lower.endsWith('.heif')) return 'image/heif'
  if (lower.endsWith('.tiff') || lower.endsWith('.tif')) return 'image/tiff'
  return 'application/octet-stream'
}

export const FileDiffViewer: React.FC<FileDiffViewerProps> = ({ fileChange }) => {
  const [content, setContent] = useState<FileContentState>({
    opfs: null,
    native: null,
    opfsImageUrl: null,
    nativeImageUrl: null,
    showNativePanel: true,
    loading: false,
    error: null,
  })
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null)

  useEffect(() => {
    if (!fileChange) {
      setContent({
        opfs: null,
        native: null,
        opfsImageUrl: null,
        nativeImageUrl: null,
        showNativePanel: true,
        loading: false,
        error: null,
      })
      return
    }

    const loadContents = async () => {
      setContent((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) {
          throw new Error('未激活的工作区')
        }

        const { workspace, workspaceId } = activeWorkspace
        const filePath = fileChange.path
        const isImage = isImageFile(filePath)
        let showNativePanel = fileChange.type !== 'add'
        let nativeDir: FileSystemDirectoryHandle | null = null

        if (fileChange.type !== 'add') {
          nativeDir = await workspace.getNativeDirectoryHandle()
          if (nativeDir) {
            const exists = await fileExistsInNativeFS(nativeDir, filePath)
            showNativePanel = exists
          }
        }

        if (isImage) {
          let opfsImageUrl: string | null = null
          let nativeImageUrl: string | null = null
          const mimeType = getImageMimeType(filePath)

          try {
            if (fileChange.type !== 'delete') {
              const opfsBase64 = await readBinaryFileFromOPFS(workspaceId, filePath)
              if (opfsBase64) {
                opfsImageUrl = `data:${mimeType};base64,${opfsBase64}`
              }
            }
          } catch (err) {
            console.warn('[FileDiffViewer] Failed to read OPFS image:', err)
          }

          try {
            if (fileChange.type !== 'add' && nativeDir) {
              const nativeBase64 = await readBinaryFileFromNativeFS(nativeDir, filePath)
              if (nativeBase64) {
                nativeImageUrl = `data:${mimeType};base64,${nativeBase64}`
              }
            }
          } catch (err) {
            console.warn('[FileDiffViewer] Failed to read native image:', err)
          }

          setContent({
            opfs: null,
            native: null,
            opfsImageUrl,
            nativeImageUrl,
            showNativePanel,
            loading: false,
            error: null,
          })
        } else {
          let opfsContent: string | null = null
          try {
            if (fileChange.type !== 'delete') {
              opfsContent = await readFileFromOPFS(workspaceId, filePath)
            }
          } catch (err) {
            console.warn('[FileDiffViewer] Failed to read OPFS content:', err)
            opfsContent = null
          }

          let nativeContent: string | null = null
          try {
            if (fileChange.type !== 'add') {
              if (nativeDir) {
                nativeContent = await readFileFromNativeFS(nativeDir, filePath)
              } else if (showNativePanel) {
                nativeContent = '[需要选择项目目录以查看本机文件内容]'
              }
            }
          } catch (err) {
            console.warn('[FileDiffViewer] Failed to read native content:', err)
            nativeContent = '[读取本机文件失败]'
          }

          setContent({
            opfs: opfsContent,
            native: nativeContent,
            opfsImageUrl: null,
            nativeImageUrl: null,
            showNativePanel,
            loading: false,
            error: null,
          })
        }
      } catch (err) {
        setContent({
          opfs: null,
          native: null,
          opfsImageUrl: null,
          nativeImageUrl: null,
          showNativePanel: true,
          loading: false,
          error: err instanceof Error ? err.message : '加载文件失败',
        })
      }
    }

    loadContents()
  }, [fileChange])

  useEffect(() => {
    if (!lightbox) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightbox(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightbox])

  if (!fileChange) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 py-12 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted dark:bg-muted">
          <svg className="h-8 w-8 text-tertiary dark:text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h2l3 3H7a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="mb-2 text-lg font-medium text-primary dark:text-primary-foreground">选择文件查看详情</h3>
        <p className="max-w-sm text-sm text-tertiary dark:text-muted">从左侧列表选择一个文件，查看 OPFS 与本机文件系统的差异</p>
      </div>
    )
  }

  if (content.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          <p className="text-sm text-tertiary dark:text-muted">加载文件内容...</p>
        </div>
      </div>
    )
  }

  if (content.error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/30">
            <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-medium text-primary dark:text-primary-foreground">加载失败</h3>
          <p className="text-sm text-tertiary dark:text-muted">{content.error}</p>
        </div>
      </div>
    )
  }

  const getChangeTypeLabel = (type: ChangeType) => {
    switch (type) {
      case 'add':
        return '新增文件'
      case 'modify':
        return '修改文件'
      case 'delete':
        return '删除文件'
    }
  }

  const getChangeTypeColor = (type: ChangeType) => {
    switch (type) {
      case 'add':
        return 'green'
      case 'modify':
        return 'blue'
      case 'delete':
        return 'red'
    }
  }

  const isImage = isImageFile(fileChange.path)
  const color = getChangeTypeColor(fileChange.type)
  const originalText = content.showNativePanel ? (content.native ?? '') : ''
  const modifiedText = content.opfs ?? ''

  const renderTextDiff = () => {
    if (!content.showNativePanel && content.opfs === null) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-tertiary dark:text-muted">
          {fileChange.type === 'delete' ? '文件已删除（OPFS 中无内容）' : '无法读取 OPFS 内容'}
        </div>
      )
    }

    return (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-tertiary dark:text-muted">
            正在加载 Monaco 编辑器...
          </div>
        }
      >
        <MonacoDiffEditor original={originalText} modified={modifiedText} path={fileChange.path} />
      </Suspense>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border bg-muted px-4 py-3 dark:border-border dark:bg-muted">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full bg-${color}-100 px-2 py-1 text-xs font-medium text-${color}-700`}>
                {getChangeTypeLabel(fileChange.type)}
              </span>
              <span className="text-sm font-medium text-primary dark:text-primary-foreground" title={fileChange.path}>
                {fileChange.path.length > 40 ? `...${fileChange.path.slice(-37)}` : fileChange.path}
              </span>
            </div>
            <p className="mt-1 text-xs text-tertiary dark:text-muted">
              {fileChange.size ? `${(fileChange.size / 1024).toFixed(1)} KB` : '-'}
            </p>
          </div>

        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {isImage ? (
          <>
            <div className={`flex flex-1 flex-col ${content.showNativePanel ? 'border-r border dark:border-border' : ''}`}>
              <div className="border-b border bg-muted px-4 py-2 dark:border-border dark:bg-muted">
                <h4 className="text-sm font-medium text-secondary dark:text-muted">
                  {content.showNativePanel ? '本机文件系统（当前）' : 'OPFS 版本（待同步）'}
                  {!content.showNativePanel && fileChange.type === 'delete' && (
                    <span className="ml-2 text-xs text-red-600">(将被删除)</span>
                  )}
                </h4>
              </div>
              <div className="flex flex-1 items-center justify-center overflow-auto bg-card p-4 dark:bg-card">
                {(content.showNativePanel ? content.nativeImageUrl : content.opfsImageUrl) ? (
                  <button
                    type="button"
                    onClick={() =>
                      setLightbox({
                        src: (content.showNativePanel ? content.nativeImageUrl : content.opfsImageUrl)!,
                        title: content.showNativePanel ? `本机文件系统 - ${fileChange.path}` : `OPFS 版本 - ${fileChange.path}`,
                      })
                    }
                    className="flex h-full w-full items-center justify-center"
                  >
                    <img
                      src={(content.showNativePanel ? content.nativeImageUrl : content.opfsImageUrl)!}
                      alt={content.showNativePanel ? `Native: ${fileChange.path}` : `OPFS: ${fileChange.path}`}
                      className="max-h-full max-w-full rounded border border dark:border-border object-contain"
                      loading="lazy"
                    />
                  </button>
                ) : (
                  <div className="text-sm text-tertiary dark:text-muted">
                    {content.showNativePanel
                      ? '无法读取本机图片'
                      : fileChange.type === 'delete'
                        ? '图片将被删除（OPFS 中无内容）'
                        : '无法读取 OPFS 图片'}
                  </div>
                )}
              </div>
            </div>

            {content.showNativePanel && (
              <div className="flex flex-1 flex-col">
                <div className="border-b border bg-muted px-4 py-2 dark:border-border dark:bg-muted">
                  <h4 className="text-sm font-medium text-secondary dark:text-muted">
                    OPFS 版本（待同步）
                    {fileChange.type === 'delete' && <span className="ml-2 text-xs text-red-600">(将被删除)</span>}
                  </h4>
                </div>
                <div className="flex flex-1 items-center justify-center overflow-auto bg-card p-4 dark:bg-card">
                  {content.opfsImageUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({
                          src: content.opfsImageUrl!,
                          title: `OPFS 版本 - ${fileChange.path}`,
                        })
                      }
                      className="flex h-full w-full items-center justify-center"
                    >
                      <img
                        src={content.opfsImageUrl}
                        alt={`OPFS: ${fileChange.path}`}
                        className="max-h-full max-w-full rounded border border dark:border-border object-contain"
                        loading="lazy"
                      />
                    </button>
                  ) : (
                    <div className="text-sm text-tertiary dark:text-muted">
                      {fileChange.type === 'delete' ? '图片将被删除（OPFS 中无内容）' : '无法读取 OPFS 图片'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 overflow-hidden bg-card dark:bg-card">{renderTextDiff()}</div>
        )}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80" onClick={() => setLightbox(null)} role="presentation">
          <div className="flex items-center justify-between bg-black/40 px-4 py-3 text-white">
            <div className="truncate pr-3 text-sm">{lightbox.title}</div>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-card/10"
            >
              关闭
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center p-6" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.title} className="max-h-full max-w-full object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}
