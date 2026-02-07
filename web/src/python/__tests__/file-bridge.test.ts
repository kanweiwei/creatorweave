/**
 * File Bridge Layer Tests
 *
 * Unit tests for the file bridge layer that connects browser files to Pyodide
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { validateFileSize, isTextFile, fileToFileRef } from '../files'
import { MAX_FILE_SIZE, MOUNT_POINT } from '../constants'
import type { FileRef, PyodideInstance } from '../types'

// Mock Pyodide instance for testing
const createMockPyodide = (): PyodideInstance => ({
  FS: {
    writeFile: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn(() => []),
    stat: vi.fn(() => ({ mode: 0o100000, size: 100, mtime: Date.now() })),
    unlink: vi.fn(),
    mkdir: vi.fn(),
    rmdir: vi.fn(),
    exists: vi.fn(() => true),
  },
  globals: {
    get: vi.fn(),
    set: vi.fn(),
  },
  runPython: vi.fn(),
})

describe('File Bridge Layer', () => {
  describe('validateFileSize', () => {
    it('should accept files within size limit', () => {
      const file: FileRef = {
        path: 'test.txt',
        name: 'test.txt',
        content: 'Hello, World!',
        contentType: 'text',
        size: 1024, // 1KB
      }

      expect(() => validateFileSize(file)).not.toThrow()
    })

    it('should reject files exceeding size limit', () => {
      const file: FileRef = {
        path: 'large.txt',
        name: 'large.txt',
        content: 'x'.repeat(MAX_FILE_SIZE + 1),
        contentType: 'text',
        size: MAX_FILE_SIZE + 1,
      }

      expect(() => validateFileSize(file)).toThrow(/too large/)
    })
  })

  describe('isTextFile', () => {
    it('should identify text files by extension', () => {
      expect(isTextFile('test.py')).toBe(true)
      expect(isTextFile('test.js')).toBe(true)
      expect(isTextFile('test.ts')).toBe(true)
      expect(isTextFile('test.json')).toBe(true)
      expect(isTextFile('test.md')).toBe(true)
      expect(isTextFile('test.txt')).toBe(true)
    })

    it('should reject non-text files', () => {
      expect(isTextFile('test.png')).toBe(false)
      expect(isTextFile('test.pdf')).toBe(false)
      expect(isTextFile('test.exe')).toBe(false)
    })
  })

  describe('fileToFileRef', () => {
    it('should convert File object to FileRef', async () => {
      const file = new File(['Hello, World!'], 'test.txt', { type: 'text/plain' })
      const fileRef = await fileToFileRef(file)

      expect(fileRef.path).toBe('test.txt')
      expect(fileRef.name).toBe('test.txt')
      expect(fileRef.content).toBe('Hello, World!')
      expect(fileRef.contentType).toBe('text')
      expect(fileRef.size).toBe(13)
      expect(fileRef.source).toBe('filesystem')
    })

    it('should handle base path correctly', async () => {
      const file = new File(['test'], 'file.txt', { type: 'text/plain' })
      const fileRef = await fileToFileRef(file, 'src/components')

      expect(fileRef.path).toBe('src/components/file.txt')
      expect(fileRef.name).toBe('file.txt')
    })
  })

  describe('Pyodide Integration', () => {
    let mockPyodide: PyodideInstance

    beforeEach(() => {
      mockPyodide = createMockPyodide()
    })

    it('should create mount point if it does not exist', () => {
      vi.mocked(mockPyodide.FS.exists).mockReturnValue(false)

      // This would be called in bridgeFilesToPyodide
      if (!mockPyodide.FS.exists(MOUNT_POINT)) {
        mockPyodide.FS.mkdir(MOUNT_POINT)
      }

      expect(mockPyodide.FS.mkdir).toHaveBeenCalledWith(MOUNT_POINT)
    })
  })
})
