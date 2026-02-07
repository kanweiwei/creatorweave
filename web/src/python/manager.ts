/**
 * Pyodide Worker Manager - Simplified interface for running Python code
 *
 * This manager handles worker lifecycle, message passing, and provides
 * a cleaner API for executing Python code.
 */

import type {
  ExecuteRequest,
  ExecuteResult,
  FileRef,
  ImageOutput,
  FileOutput,
  WorkerResponse,
} from './worker-types'

export type { ExecuteRequest, ExecuteResult, FileRef, ImageOutput, FileOutput }

//=============================================================================
// Manager Options
//=============================================================================

export interface PyodideWorkerManagerOptions {
  workerUrl?: string
  onError?: (error: Error) => void
}

//=============================================================================
// Manager Class
//=============================================================================

export class PyodideWorkerManager {
  private worker: Worker | null = null
  private workerUrl: string
  private pendingRequests: Map<
    string,
    { resolve: (result: ExecuteResult) => void; reject: (error: Error) => void }
  > = new Map()
  private onError?: (error: Error) => void

  constructor(options: PyodideWorkerManagerOptions = {}) {
    this.workerUrl = options.workerUrl || this.getDefaultWorkerUrl()
    this.onError = options.onError
  }

  //=============================================================================
  // Public Methods
  //=============================================================================

  /**
   * Execute Python code
   *
   * @param code - Python code to execute
   * @param files - Optional files to inject into /mnt
   * @param packages - Optional packages to load
   * @param timeout - Execution timeout in milliseconds (default: 30000)
   * @returns Promise with execution result
   */
  async execute(
    code: string,
    files: FileRef[] = [],
    packages: string[] = [],
    timeout: number = 30000
  ): Promise<ExecuteResult> {
    const requestId = this.generateRequestId()

    try {
      // Ensure worker is initialized
      await this.ensureWorker()

      return new Promise<ExecuteResult>((resolve, reject) => {
        // Set up timeout
        const timeoutId = setTimeout(() => {
          this.pendingRequests.delete(requestId)
          reject(new Error(`Worker timeout after ${timeout}ms`))
        }, timeout)

        // Store promise callbacks
        this.pendingRequests.set(requestId, {
          resolve: (result) => {
            clearTimeout(timeoutId)
            resolve(result)
          },
          reject: (error) => {
            clearTimeout(timeoutId)
            reject(error)
          },
        })

        // Send execution request
        const message: ExecuteRequest = {
          id: requestId,
          type: 'execute',
          code,
          files,
          packages,
          timeout,
        }

        this.worker!.postMessage(message)
      })
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Check if worker is ready to execute code
   */
  isReady(): boolean {
    return this.worker !== null
  }

  /**
   * Terminate worker and cleanup resources
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
      this.pendingRequests.clear()
      console.log('[Pyodide Manager] Worker terminated')
    }
  }

  /**
   * Restart the worker (useful for error recovery)
   */
  async restart(): Promise<void> {
    this.terminate()
    await this.ensureWorker()
    console.log('[Pyodide Manager] Worker restarted')
  }

  //=============================================================================
  // Private Methods
  //=============================================================================

  /**
   * Ensure worker is initialized
   */
  private async ensureWorker(): Promise<void> {
    if (this.worker) return

    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(this.workerUrl, { type: 'module' })

        this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
          this.handleWorkerMessage(e.data)
        }

        this.worker.onerror = (error) => {
          const workerError = new Error(`Worker error: ${error.message}`)
          if (this.onError) {
            this.onError(workerError)
          }
          reject(workerError)
        }

        // Worker is ready
        resolve()
      } catch (error) {
        reject(this.handleError(error))
      }
    })
  }

  /**
   * Handle messages from worker
   */
  private handleWorkerMessage(message: WorkerResponse): void {
    const { id, success, result } = message

    const pending = this.pendingRequests.get(id)
    if (!pending) {
      console.warn(`[Pyodide Manager] Received response for unknown request: ${id}`)
      return
    }

    this.pendingRequests.delete(id)

    if (success && result.success) {
      pending.resolve(result)
    } else if (success && !result.success) {
      // Worker successfully executed but Python code failed
      pending.resolve(result)
    } else {
      // Worker itself failed
      pending.reject(new Error(result.error || 'Unknown worker error'))
    }
  }

  /**
   * Get default worker URL
   */
  private getDefaultWorkerUrl(): string {
    // Try to detect the correct path based on build environment
    if (typeof window !== 'undefined') {
      // Browser environment
      const scriptUrl = new URL(import.meta.url)
      const baseUrl = scriptUrl.pathname.replace(/\/[^/]*$/, '/')
      return `${baseUrl}/worker.js` // Built version
    }

    // Fallback for Node.js test environment
    return './python/worker.ts'
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Handle and normalize errors
   */
  private handleError(error: unknown): Error {
    if (error instanceof Error) {
      return error
    }
    if (typeof error === 'string') {
      return new Error(error)
    }
    return new Error(`Unknown error: ${String(error)}`)
  }
}

//=============================================================================
// Utility Functions
//=============================================================================

/**
 * Create a FileRef from a string (text file)
 */
export function createTextFile(name: string, content: string): FileRef {
  const encoder = new TextEncoder()
  return {
    name,
    content: encoder.encode(content).buffer,
  }
}

/**
 * Create a FileRef from a Blob
 */
export async function createFileFromBlob(name: string, blob: Blob): Promise<FileRef> {
  const arrayBuffer = await blob.arrayBuffer()
  return {
    name,
    content: arrayBuffer,
  }
}

/**
 * Create a FileRef from a File
 */
export async function createFileFromFile(file: File): Promise<FileRef> {
  const arrayBuffer = await file.arrayBuffer()
  return {
    name: file.name,
    content: arrayBuffer,
  }
}

/**
 * Convert FileOutput to Blob
 */
export function fileOutputToBlob(file: FileOutput): Blob {
  return new Blob([file.content], { type: 'application/octet-stream' })
}

/**
 * Convert FileOutput to text (for text files)
 */
export function fileOutputToText(file: FileOutput): string {
  const decoder = new TextDecoder()
  return decoder.decode(file.content)
}

/**
 * Convert FileOutput to data URL (for downloads)
 */
export function fileOutputToDataUrl(
  file: FileOutput,
  mimeType: string = 'application/octet-stream'
): string {
  const bytes = new Uint8Array(file.content)
  const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '')
  const base64 = btoa(binary)
  return `data:${mimeType};base64,${base64}`
}

/**
 * Download FileOutput as file
 */
export function downloadFileOutput(file: FileOutput, filename?: string): void {
  const blob = fileOutputToBlob(file)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || file.name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
