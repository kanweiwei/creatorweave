/**
 * Type definitions for Pyodide Worker
 *
 * The worker.ts is a classic worker (not a module) to support importScripts(),
 * so types are defined here for TypeScript imports.
 */

/**
 * Simple file reference for worker message passing
 * Note: For full file metadata, use types.FileRef instead
 */
export interface FileRef {
  name: string
  content: ArrayBuffer
}

export interface FileOutput {
  name: string
  content: ArrayBuffer
}

export interface ImageOutput {
  filename: string
  data: string // base64
}

export interface ExecuteRequest {
  id: string
  type: 'execute'
  code: string
  files?: FileRef[]
  packages?: string[]
  timeout?: number
}

export interface ExecuteResult {
  success: boolean
  result?: unknown
  stdout?: string
  stderr?: string
  images?: ImageOutput[]
  outputFiles?: FileOutput[]
  executionTime: number
  error?: string
}

export interface WorkerResponse {
  id: string
  success: boolean
  result: ExecuteResult
}
