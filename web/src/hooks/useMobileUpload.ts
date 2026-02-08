/**
 * useMobileUpload - Mobile file upload hook
 *
 * Provides file selection with support for:
 * - Native File System API (showOpenFilePicker) on supported browsers
 * - Fallback to input[type="file"] on iOS Safari and other unsupported browsers
 * - Multiple file selection
 * - Progress tracking for uploads
 */

import { useState, useCallback, useRef } from 'react'

//=============================================================================
// Types
//=============================================================================

/**
 * Options for file selection
 */
export interface FileSelectOptions {
  /** MIME types or file extensions to accept */
  accept?: string
  /** Allow selecting multiple files */
  multiple?: boolean
  /** Maximum number of files (0 = unlimited) */
  maxFiles?: number
  /** Maximum file size in bytes (0 = unlimited) */
  maxSize?: number
}

/**
 * Individual file upload state
 */
export interface UploadFile {
  file: File
  id: string
  name: string
  size: number
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'error'
  error?: string
}

/**
 * Upload session state
 */
export interface UploadState {
  files: UploadFile[]
  isUploading: boolean
  totalProgress: number
  completedCount: number
  errorCount: number
}

/**
 * Progress callback for individual file uploads
 */
export interface FileProgressCallback {
  (fileId: string, progress: number): void
}

/**
 * Completion callback for file uploads
 */
export interface FileCompleteCallback {
  (fileId: string, success: boolean, error?: string): void
}

/**
 * Callback for upload completion
 */
export interface UploadCompleteCallback {
  (files: UploadFile[]): void
}

//=============================================================================
// Utility Functions
//=============================================================================

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Validate file against options
 */
function validateFile(file: File, options: FileSelectOptions): string | null {
  if (options.maxFiles && options.maxFiles > 0) {
    return 'File limit reached'
  }

  if (options.maxSize && options.maxSize > 0 && file.size > options.maxSize) {
    return `File too large (max ${formatFileSize(options.maxSize)})`
  }

  return null
}

/**
 * Generate unique file ID
 */
function generateFileId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

//=============================================================================
// File Selection Functions
//=============================================================================

/**
 * Check if File System Access API is supported
 */
export function isFilePickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window
}

/**
 * Check if the browser is iOS Safari
 */
export function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false

  const ua = window.navigator.userAgent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msStream = (window as any).MSStream
  return /iPad|iPhone|iPod/.test(ua) && !msStream && /Safari/.test(ua)
}

/**
 * Check if running on mobile device
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    window.navigator.userAgent
  )
}

/**
 * Select files using native File System Access API
 */
async function selectWithFilePicker(options: FileSelectOptions): Promise<File[]> {
  if (!('showOpenFilePicker' in window)) {
    throw new Error('File System Access API not supported')
  }

  const acceptOptions: Record<string, string[]> = {}

  if (options.accept) {
    // Parse accept string into types and extensions
    const types = options.accept.split(',').map((t) => t.trim())

    for (const type of types) {
      if (type.includes('/')) {
        // MIME type
        if (!acceptOptions[type]) {
          acceptOptions[type] = []
        }
      } else if (type.startsWith('.')) {
        // Extension
        const mimeType = getMimeTypeFromExtension(type.substring(1))
        if (mimeType) {
          if (!acceptOptions[mimeType]) {
            acceptOptions[mimeType] = []
          }
          acceptOptions[mimeType].push(type)
        }
      }
    }
  }

  // Type definitions for File System Access API
  interface FilePickerAcceptType {
    accept: Record<string, string[]>
    description?: string
  }

  interface OpenFilePickerOptions {
    multiple?: boolean
    types?: FilePickerAcceptType[]
  }

  const pickerOptions: OpenFilePickerOptions = {
    multiple: options.multiple ?? true,
  }

  if (Object.keys(acceptOptions).length > 0) {
    pickerOptions.types = Object.entries(acceptOptions).map(([accept, extensions]) => ({
      accept: {
        [accept]: extensions.length > 0 ? extensions : [accept],
      },
      description: options.accept || 'Files',
    }))
  }

  // Use type assertion to access showOpenFilePicker
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filePicker = (window as any).showOpenFilePicker
  const handles = await filePicker(pickerOptions)

  return handles.map((handle: { getFile: () => Promise<File> }) => handle.getFile())
}

/**
 * Get MIME type from file extension
 */
function getMimeTypeFromExtension(ext: string): string | null {
  const mimeTypes: Record<string, string> = {
    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    csv: 'text/csv',

    // Images
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    ico: 'image/x-icon',

    // Code
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    mjs: 'application/javascript',
    ts: 'application/typescript',
    json: 'application/json',
    xml: 'application/xml',
    yaml: 'text/yaml',
    yml: 'text/yaml',
    md: 'text/markdown',

    // Archives
    zip: 'application/zip',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    '7z': 'application/x-7z-compressed',
    rar: 'application/vnd.rar',

    // Audio
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',

    // Video
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
  }

  return mimeTypes[ext.toLowerCase()] || null
}

/**
 * Fallback file selection using hidden input element
 */
function selectWithInput(options: FileSelectOptions): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = options.multiple ?? true

    if (options.accept) {
      input.accept = options.accept
    }

    // iOS Safari requires these attributes for proper file picking
    input.setAttribute('webkitdirectory', 'false')
    input.setAttribute('mozdirectory', 'false')
    input.setAttribute('msdirectory', 'false')
    input.setAttribute('odirectory', 'false')

    // Style to make invisible but interactable
    Object.assign(input.style, {
      position: 'absolute',
      opacity: '0',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: '0',
    })

    // Append to body, click, then remove
    document.body.appendChild(input)

    const cleanup = () => {
      input.removeEventListener('change', handleChange)
      input.removeEventListener('cancel', handleCancel)
      input.remove()
    }

    const handleChange = () => {
      const files = input.files ? Array.from(input.files) : []
      cleanup()
      resolve(files)
    }

    const handleCancel = () => {
      cleanup()
      resolve([])
    }

    input.addEventListener('change', handleChange)
    input.addEventListener('cancel', handleCancel)

    // Trigger file picker
    input.click()

    // Timeout fallback for browsers that don't fire cancel event
    setTimeout(() => {
      if (input.parentElement) {
        cleanup()
        // If no files selected after timeout, resolve with empty array
        if (!input.files?.length) {
          resolve([])
        }
      }
    }, 10000)
  })
}

//=============================================================================
// Main Hook
//=============================================================================

/**
 * useMobileUpload - Hook for mobile file selection and upload
 *
 * @example
 * ```tsx
 * const {
 *   selectFiles,
 *   uploadFiles,
 *   state,
 *   clearCompleted
 * } = useMobileUpload({
 *   onProgress: (id, progress) => console.log(id, progress),
 *   onComplete: (files) => console.log(files)
 * })
 * ```
 */
export interface UseMobileUploadOptions {
  /** Callback when individual file progress updates */
  onProgress?: FileProgressCallback
  /** Callback when individual file upload completes */
  onFileComplete?: FileCompleteCallback
  /** Callback when all uploads complete */
  onUploadComplete?: UploadCompleteCallback
}

export function useMobileUpload(options: UseMobileUploadOptions = {}) {
  const [state, setState] = useState<UploadState>({
    files: [],
    isUploading: false,
    totalProgress: 0,
    completedCount: 0,
    errorCount: 0,
  })

  const uploadFunctionRef = useRef<((file: File) => Promise<void>) | null>(null)

  /**
   * Set the upload function to use for file uploads
   */
  const setUploadFunction = useCallback((fn: (file: File) => Promise<void>) => {
    uploadFunctionRef.current = fn
  }, [])

  /**
   * Select files using the appropriate method
   */
  const selectFiles = useCallback(async (fileOptions: FileSelectOptions = {}): Promise<File[]> => {
    let files: File[] = []

    try {
      if (isFilePickerSupported() && !isIOSSafari()) {
        // Use native File System Access API
        files = await selectWithFilePicker(fileOptions)
      } else {
        // Fallback to input[type="file"] for iOS Safari and other browsers
        files = await selectWithInput(fileOptions)
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('File selection failed:', error)
        // Final fallback
        files = await selectWithInput(fileOptions)
      }
    }

    // Validate selected files
    const validatedFiles: File[] = []

    for (const file of files) {
      const validationError = validateFile(file, fileOptions)

      if (validationError) {
        console.warn(`File "${file.name}" skipped: ${validationError}`)
        continue
      }

      validatedFiles.push(file)
    }

    return validatedFiles
  }, [])

  /**
   * Upload a single file with progress tracking
   */
  const uploadFile = useCallback(
    async (file: File): Promise<UploadFile> => {
      const id = generateFileId()

      const uploadFileState: UploadFile = {
        file,
        id,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'pending',
      }

      setState((prev) => ({
        ...prev,
        files: [...prev.files, uploadFileState],
      }))

      if (!uploadFunctionRef.current) {
        uploadFileState.status = 'error'
        uploadFileState.error = 'No upload function configured'
        return uploadFileState
      }

      uploadFileState.status = 'uploading'
      setState((prev) => ({
        ...prev,
        files: prev.files.map((f) => (f.id === id ? uploadFileState : f)),
      }))

      try {
        // Simulated progress for demonstration
        // In real usage, the upload function would call onProgress callbacks
        if (uploadFunctionRef.current.length === 0) {
          // Function doesn't accept progress callback, simulate progress
          const progressInterval = setInterval(() => {
            setState((prev) => {
              const fileState = prev.files.find((f) => f.id === id)
              if (fileState && fileState.progress < 90) {
                const newProgress = Math.min(fileState.progress + 10, 90)
                options.onProgress?.(id, newProgress)
                return {
                  ...prev,
                  files: prev.files.map((f) => (f.id === id ? { ...f, progress: newProgress } : f)),
                }
              }
              return prev
            })
          }, 200)

          await uploadFunctionRef.current(file)

          clearInterval(progressInterval)
        } else {
          // Function accepts progress callback
          await uploadFunctionRef.current(file)
        }

        uploadFileState.progress = 100
        uploadFileState.status = 'completed'

        setState((prev) => {
          const completed = prev.files.filter(
            (f) => f.id === id || f.status === 'completed' || f.status === 'error'
          ).length
          const errors = prev.files.filter((f) =>
            f.id === id ? f.status === 'error' : f.status === 'error'
          ).length

          return {
            ...prev,
            isUploading: false,
            totalProgress: 100,
            completedCount: completed - errors,
            errorCount: errors,
            files: prev.files.map((f) => (f.id === id ? uploadFileState : f)),
          }
        })

        options.onFileComplete?.(id, true)
        return uploadFileState
      } catch (error) {
        uploadFileState.status = 'error'
        uploadFileState.error = error instanceof Error ? error.message : 'Upload failed'

        setState((prev) => {
          const completed = prev.files.filter(
            (f) => f.status === 'completed' || f.status === 'error'
          ).length
          const errors = prev.files.filter((f) => f.status === 'error').length + 1

          return {
            ...prev,
            isUploading: false,
            completedCount: completed - errors + (uploadFileState.status === 'completed' ? 1 : 0),
            errorCount: errors,
            files: prev.files.map((f) => (f.id === id ? uploadFileState : f)),
          }
        })

        options.onFileComplete?.(id, false, uploadFileState.error)
        return uploadFileState
      }
    },
    [options]
  )

  /**
   * Upload multiple files
   */
  const uploadFiles = useCallback(
    async (files: File[], uploadFn?: (file: File) => Promise<void>): Promise<UploadFile[]> => {
      if (files.length === 0) return []

      if (uploadFn) {
        setUploadFunction(uploadFn)
      }

      if (!uploadFunctionRef.current) {
        console.warn('No upload function configured')
        return []
      }

      setState((prev) => ({
        ...prev,
        isUploading: true,
      }))

      const results: UploadFile[] = []

      for (const file of files) {
        const result = await uploadFile(file)
        results.push(result)
      }

      setState((prev) => ({
        ...prev,
        isUploading: false,
        totalProgress: 100,
      }))

      options.onUploadComplete?.(results)
      return results
    },
    [uploadFile, setUploadFunction, options]
  )

  /**
   * Update progress for a specific file
   */
  const updateFileProgress = useCallback(
    (fileId: string, progress: number) => {
      setState((prev) => {
        const fileState = prev.files.find((f) => f.id === fileId)
        if (!fileState) return prev

        const newFileState = { ...fileState, progress }

        // Calculate total progress
        const totalProgress =
          prev.files.reduce((sum, f) => {
            if (f.status === 'completed') return sum + 100
            if (f.status === 'uploading' && f.id === fileId) return sum + progress
            return sum
          }, 0) / (prev.files.filter((f) => f.status !== 'pending').length || 1)

        return {
          ...prev,
          totalProgress,
          files: prev.files.map((f) => (f.id === fileId ? newFileState : f)),
        }
      })

      options.onProgress?.(fileId, progress)
    },
    [options]
  )

  /**
   * Mark a file as completed
   */
  const completeFile = useCallback(
    (fileId: string, success: boolean, error?: string) => {
      setState((prev) => {
        const fileState = prev.files.find((f) => f.id === fileId)
        if (!fileState) return prev

        const newStatus: UploadFile['status'] = success ? 'completed' : 'error'
        const newFileState = {
          ...fileState,
          status: newStatus,
          progress: success ? 100 : fileState.progress,
          error: error,
        }

        const completedCount =
          prev.files.filter((f) => (f.id === fileId ? success : f.status === 'completed')).length +
          (success ? 1 : 0)
        const errorCount =
          prev.files.filter((f) => (f.id === fileId ? !success : f.status === 'error')).length +
          (!success ? 1 : 0)

        return {
          ...prev,
          completedCount,
          errorCount,
          files: prev.files.map((f) => (f.id === fileId ? newFileState : f)),
        }
      })

      options.onFileComplete?.(fileId, success, error)
    },
    [options]
  )

  /**
   * Clear completed files from state
   */
  const clearCompleted = useCallback(() => {
    setState((prev) => ({
      ...prev,
      files: prev.files.filter((f) => f.status !== 'completed'),
      completedCount: 0,
      totalProgress: prev.files.some((f) => f.status === 'uploading') ? prev.totalProgress : 0,
    }))
  }, [])

  /**
   * Clear all files and reset state
   */
  const clearAll = useCallback(() => {
    setState({
      files: [],
      isUploading: false,
      totalProgress: 0,
      completedCount: 0,
      errorCount: 0,
    })
  }, [])

  /**
   * Remove a specific file from the queue
   */
  const removeFile = useCallback((fileId: string) => {
    setState((prev) => ({
      ...prev,
      files: prev.files.filter((f) => f.id !== fileId),
    }))
  }, [])

  /**
   * Retry a failed file upload
   */
  const retryFile = useCallback(
    async (fileId: string) => {
      const fileState = state.files.find((f) => f.id === fileId)
      if (!fileState || fileState.status !== 'error') return

      const newFile: UploadFile = {
        ...fileState,
        status: 'pending',
        progress: 0,
        error: undefined,
      }

      setState((prev) => ({
        ...prev,
        files: prev.files.map((f) => (f.id === fileId ? newFile : f)),
      }))

      await uploadFile(fileState.file)
    },
    [state.files, uploadFile]
  )

  return {
    // State
    files: state.files,
    isUploading: state.isUploading,
    totalProgress: state.totalProgress,
    completedCount: state.completedCount,
    errorCount: state.errorCount,

    // File selection
    selectFiles,

    // Upload control
    uploadFile,
    uploadFiles,
    setUploadFunction,
    updateFileProgress,
    completeFile,

    // State management
    clearCompleted,
    clearAll,
    removeFile,
    retryFile,

    // Utility functions
    isFilePickerSupported,
    isIOSSafari,
    isMobileDevice,
    formatFileSize,
  }
}
