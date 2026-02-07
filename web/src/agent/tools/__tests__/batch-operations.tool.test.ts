/**
 * Tests for Batch Operations Tools
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  batchEditDefinition,
  batchEditExecutor,
  advancedSearchDefinition,
  advancedSearchExecutor,
  fileBatchReadDefinition,
  fileBatchReadExecutor,
} from '../batch-operations.tool'
import type { ToolContext } from '../tool-types'

// Mock OPFS store
const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
const mockGetPendingChanges = vi.fn(() => [])

vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: () => ({
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    getPendingChanges: mockGetPendingChanges,
  }),
}))

// Mock remote store
vi.mock('@/store/remote.store', () => ({
  useRemoteStore: () => ({
    session: null,
  }),
}))

// Mock undo manager
vi.mock('@/undo/undo-manager', () => ({
  getUndoManager: () => ({
    recordModification: vi.fn(),
  }),
}))

// Mock file system services
const mockTraverseDirectory = async function* () {
  yield { type: 'file' as const, name: 'test.ts', path: 'test.ts', size: 1000 }
  yield { type: 'file' as const, name: 'example.ts', path: 'src/example.ts', size: 1500 }
  yield { type: 'file' as const, name: 'data.json', path: 'data.json', size: 500 }
}

vi.mock('@/services/traversal.service', () => ({
  traverseDirectory: () => mockTraverseDirectory(),
}))

vi.mock('@/services/fsAccess.service', () => ({
  resolveFileHandle: vi.fn(),
}))

describe('batch_edit tool', () => {
  let mockContext: ToolContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext = {
      directoryHandle: {} as FileSystemDirectoryHandle,
    }
    // Default mock implementations
    mockReadFile.mockResolvedValue({
      content: 'function oldName() {\n  return "hello";\n}',
      size: 100,
    })
    mockWriteFile.mockResolvedValue(undefined)
  })

  describe('tool definition', () => {
    it('should have correct tool name', () => {
      expect(batchEditDefinition.function.name).toBe('batch_edit')
    })

    it('should have required parameters', () => {
      const { required } = batchEditDefinition.function.parameters
      expect(required).toContain('file_pattern')
      expect(required).toContain('find')
      expect(required).toContain('replace')
    })

    it('should have optional parameters', () => {
      const { properties } = batchEditDefinition.function.parameters
      expect(properties.dry_run).toBeDefined()
      expect(properties.use_regex).toBeDefined()
      expect(properties.max_files).toBeDefined()
    })
  })

  describe('string replacement', () => {
    it('should replace text in matching files', async () => {
      const args = {
        file_pattern: '*.ts',
        find: 'oldName',
        replace: 'newName',
        dry_run: false,
        use_regex: false,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.filesMatched).toBeGreaterThan(0)
      expect(result.status).toBe('pending')
    })

    it('should preview changes when dry_run is true', async () => {
      const args = {
        file_pattern: '*.ts',
        find: 'oldName',
        replace: 'newName',
        dry_run: true,
        use_regex: false,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.dryRun).toBe(true)
      expect(result.status).toBe('preview')
      expect(mockWriteFile).not.toHaveBeenCalled()
    })

    it('should handle files without matches', async () => {
      mockReadFile.mockResolvedValue({
        content: 'function somethingElse() {}',
        size: 50,
      })

      const args = {
        file_pattern: '*.ts',
        find: 'oldName',
        replace: 'newName',
        dry_run: false,
        use_regex: false,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.filesMatched).toBe(0)
    })
  })

  describe('regex replacement', () => {
    it('should support regex patterns', async () => {
      mockReadFile.mockResolvedValue({
        content: 'function test123() { return 456; }',
        size: 100,
      })

      const args = {
        file_pattern: '*.ts',
        find: '\\d+',
        replace: 'NUMBER',
        dry_run: false,
        use_regex: true,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.totalMatches).toBeGreaterThan(0)
    })

    it('should handle invalid regex patterns', async () => {
      const args = {
        file_pattern: '*.ts',
        find: '[invalid(',
        replace: 'test',
        dry_run: false,
        use_regex: true,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.error).toBeDefined()
      expect(result.error).toContain('Invalid regex pattern')
    })

    it('should use capture groups in replacement', async () => {
      mockReadFile.mockResolvedValue({
        content: 'Name: John, Age: 30',
        size: 50,
      })

      const args = {
        file_pattern: '*.txt',
        find: '(\\w+): (\\w+)',
        replace: '$1 = $2',
        dry_run: false,
        use_regex: true,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.totalMatches).toBeGreaterThan(0)
    })
  })

  describe('error handling', () => {
    it('should require directory handle', async () => {
      const args = {
        file_pattern: '*.ts',
        find: 'old',
        replace: 'new',
      }

      const result = JSON.parse(await batchEditExecutor(args, { directoryHandle: null }))

      expect(result.error).toBeDefined()
      expect(result.error).toContain('No directory selected')
    })

    it('should handle file read errors gracefully', async () => {
      mockReadFile.mockRejectedValue(new Error('Read error'))

      const args = {
        file_pattern: '*.ts',
        find: 'old',
        replace: 'new',
        dry_run: false,
        use_regex: false,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.results.some((r: any) => r.error)).toBe(true)
    })

    it('should handle binary files', async () => {
      mockReadFile.mockResolvedValue({
        content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        size: 4,
      })

      const args = {
        file_pattern: '*.png',
        find: 'old',
        replace: 'new',
        dry_run: false,
        use_regex: false,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.results.some((r: any) => r.error?.includes('binary'))).toBe(true)
    })
  })
})

describe('advanced_search tool', () => {
  let mockContext: ToolContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext = {
      directoryHandle: {} as FileSystemDirectoryHandle,
    }
  })

  describe('tool definition', () => {
    it('should have correct tool name', () => {
      expect(advancedSearchDefinition.function.name).toBe('advanced_search')
    })

    it('should have required parameters', () => {
      const { required } = advancedSearchDefinition.function.parameters
      expect(required).toContain('pattern')
    })

    it('should have optional parameters', () => {
      const { properties } = advancedSearchDefinition.function.parameters
      expect(properties.file_pattern).toBeDefined()
      expect(properties.context_lines).toBeDefined()
      expect(properties.max_results).toBeDefined()
      expect(properties.case_insensitive).toBeDefined()
    })
  })

  describe('search functionality', () => {
    it('should search for pattern in files', async () => {
      const args = {
        pattern: 'function',
        file_pattern: '*.ts',
      }

      const result = JSON.parse(await advancedSearchExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.pattern).toBe('function')
    })

    it('should support case-insensitive search', async () => {
      const args = {
        pattern: 'FUNCTION',
        file_pattern: '*.ts',
        case_insensitive: true,
      }

      const result = JSON.parse(await advancedSearchExecutor(args, mockContext))

      expect(result.success).toBe(true)
    })

    it('should include context lines', async () => {
      const args = {
        pattern: 'test',
        file_pattern: '*.ts',
        context_lines: 3,
      }

      const result = JSON.parse(await advancedSearchExecutor(args, mockContext))

      expect(result.success).toBe(true)
    })

    it('should limit results', async () => {
      const args = {
        pattern: '.',
        file_pattern: '*.ts',
        max_results: 10,
      }

      const result = JSON.parse(await advancedSearchExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.totalMatches).toBeLessThanOrEqual(10)
    })

    it('should filter by file pattern', async () => {
      const args = {
        pattern: 'import',
        file_pattern: '*.ts',
      }

      const result = JSON.parse(await advancedSearchExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.filePattern).toBe('*.ts')
    })
  })

  describe('error handling', () => {
    it('should require directory handle', async () => {
      const args = {
        pattern: 'test',
      }

      const result = JSON.parse(await advancedSearchExecutor(args, { directoryHandle: null }))

      expect(result.error).toBeDefined()
      expect(result.error).toContain('No directory selected')
    })

    it('should handle invalid regex patterns', async () => {
      const args = {
        pattern: '[invalid(',
        file_pattern: '*.ts',
      }

      const result = JSON.parse(await advancedSearchExecutor(args, mockContext))

      expect(result.error).toBeDefined()
      expect(result.error).toContain('Invalid regex pattern')
    })

    it('should handle no matches gracefully', async () => {
      const args = {
        pattern: 'NONEXISTENT_PATTERN_xyz123',
        file_pattern: '*.ts',
      }

      const result = JSON.parse(await advancedSearchExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.results.length).toBe(0)
    })
  })
})

describe('file_batch_read tool', () => {
  let mockContext: ToolContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext = {
      directoryHandle: {} as FileSystemDirectoryHandle,
    }
    mockReadFile.mockResolvedValue({
      content: 'file content',
      size: 100,
    })
  })

  describe('tool definition', () => {
    it('should have correct tool name', () => {
      expect(fileBatchReadDefinition.function.name).toBe('file_batch_read')
    })

    it('should have required parameters', () => {
      const { required } = fileBatchReadDefinition.function.parameters
      expect(required).toContain('paths')
    })

    it('should have optional parameters', () => {
      const { properties } = fileBatchReadDefinition.function.parameters
      expect(properties.max_files).toBeDefined()
      expect(properties.max_size).toBeDefined()
    })
  })

  describe('batch reading', () => {
    it('should read multiple files', async () => {
      const args = {
        paths: ['file1.ts', 'file2.ts', 'file3.ts'],
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.total).toBe(3)
      expect(result.summary.successful).toBe(3)
      expect(result.results).toHaveLength(3)
    })

    it('should include file size information', async () => {
      mockReadFile.mockResolvedValue({
        content: 'test content',
        size: 256,
      })

      const args = {
        paths: ['test.txt'],
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.results[0].size).toBe(256)
      expect(result.summary.totalBytes).toBe(256)
    })

    it('should format total size', async () => {
      mockReadFile.mockResolvedValue({
        content: 'x'.repeat(2048),
        size: 2048,
      })

      const args = {
        paths: ['test.txt'],
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.totalSizeFormatted).toContain('KB')
    })

    it('should limit batch size', async () => {
      const args = {
        paths: ['1', '2', '3', '4', '5'],
        max_files: 3,
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.summary.total).toBeLessThanOrEqual(3)
    })

    it('should enforce file size limit', async () => {
      mockReadFile.mockResolvedValue({
        content: 'x'.repeat(300000),
        size: 300000,
      })

      const args = {
        paths: ['large.txt'],
        max_size: 100000,
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.summary.errors).toBe(1)
      expect(result.results[0].error).toContain('exceeds limit')
    })
  })

  describe('error handling', () => {
    it('should require directory handle', async () => {
      const args = {
        paths: ['test.txt'],
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, { directoryHandle: null }))

      expect(result.error).toBeDefined()
      expect(result.error).toContain('No directory selected')
    })

    it('should require non-empty paths array', async () => {
      const args = {
        paths: [],
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.error).toBeDefined()
      expect(result.error).toContain('non-empty array')
    })

    it('should handle read errors gracefully', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'))

      const args = {
        paths: ['missing.txt'],
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.errors).toBe(1)
      expect(result.results[0].error).toBeDefined()
    })

    it('should handle binary files', async () => {
      mockReadFile.mockResolvedValue({
        content: new Uint8Array([0x00, 0x01, 0x02]),
        size: 3,
      })

      const args = {
        paths: ['binary.bin'],
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.summary.errors).toBe(1)
      expect(result.results[0].error).toContain('binary')
    })
  })
})

describe('tool integration', () => {
  it('should handle concurrent operations', async () => {
    const mockContext = {
      directoryHandle: {} as FileSystemDirectoryHandle,
    }

    mockReadFile.mockResolvedValue({
      content: 'test content',
      size: 100,
    })

    const batchEditPromise = batchEditExecutor(
      {
        file_pattern: '*.ts',
        find: 'old',
        replace: 'new',
        dry_run: true,
        use_regex: false,
      },
      mockContext
    )

    const batchReadPromise = fileBatchReadExecutor(
      {
        paths: ['test.ts'],
      },
      mockContext
    )

    const [editResult, readResult] = await Promise.all([batchEditPromise, batchReadPromise])

    expect(JSON.parse(editResult).success).toBe(true)
    expect(JSON.parse(readResult).success).toBe(true)
  })

  it('should provide consistent error messages', async () => {
    const noHandleContext = { directoryHandle: null }

    const tools = [
      { executor: batchEditExecutor, args: { file_pattern: '*.ts', find: 'x', replace: 'y' } },
      { executor: advancedSearchExecutor, args: { pattern: 'test' } },
      { executor: fileBatchReadExecutor, args: { paths: ['test.txt'] } },
    ]

    for (const tool of tools) {
      const result = JSON.parse(await tool.executor(tool.args, noHandleContext))
      expect(result.error).toBeDefined()
      expect(result.error).toContain('No directory selected')
    }
  })
})
