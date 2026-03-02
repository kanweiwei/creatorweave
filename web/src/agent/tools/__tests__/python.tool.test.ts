/**
 * Python Tool Tests
 *
 * Tests for the run_python_code Agent tool integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pythonCodeDefinition, pythonCodeExecutor } from '../python.tool'
import type { ToolContext } from '../tool-types'

// Mock the Python executor
vi.mock('@/python', () => ({
  pythonExecutor: {
    execute: vi.fn(),
  },
}))

// Mock the agent store
const mockDirectoryHandle = {
  queryPermission: vi.fn(() => Promise.resolve('granted')),
  name: 'test-project',
} as unknown as FileSystemDirectoryHandle

vi.mock('@/store/agent.store', () => ({
  useAgentStore: {
    getState: vi.fn(() => ({
      directoryHandle: null,
    })),
  },
}))

describe('Python Tool Integration', () => {
  const mockContext: ToolContext = {
    directoryHandle: null,
    abortSignal: undefined,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Tool Definition', () => {
    it('should have correct tool name', () => {
      expect(pythonCodeDefinition.function.name).toBe('run_python_code')
    })

    it('should have required parameters', () => {
      const params = pythonCodeDefinition.function.parameters
      expect(params.properties.code).toBeDefined()
      expect(params.required).toContain('code')
    })

    it('should have optional parameters', () => {
      const params = pythonCodeDefinition.function.parameters
      expect(params.properties.sync).toBeDefined()
      expect(params.properties.timeout).toBeDefined()
    })

    it('should NOT have deprecated parameters', () => {
      const params = pythonCodeDefinition.function.parameters
      // packages and files are removed - files are accessed via mounted directory
      expect(params.properties.packages).toBeUndefined()
      expect(params.properties.files).toBeUndefined()
    })

    it('should have comprehensive description', () => {
      const desc = pythonCodeDefinition.function.description
      expect(desc).toContain('Python')
      expect(desc).toContain('Pyodide')
      expect(desc).toContain('/mnt')
      expect(desc).toContain('sync')
    })
  })

  describe('Tool Executor', () => {
    it('should require code parameter', async () => {
      const result = await pythonCodeExecutor({}, mockContext)
      const parsed = JSON.parse(result)
      expect(parsed.error).toContain('required')
    })

    it('should reject non-string code', async () => {
      const result = await pythonCodeExecutor({ code: 123 }, mockContext)
      const parsed = JSON.parse(result)
      expect(parsed.error).toContain('string')
    })

    it('should reject oversized code', async () => {
      const largeCode = 'x'.repeat(100001)
      const result = await pythonCodeExecutor({ code: largeCode }, mockContext)
      const parsed = JSON.parse(result)
      expect(parsed.error).toContain('too large')
    })

    it('should validate minimum timeout', async () => {
      const result = await pythonCodeExecutor({ code: 'print("test")', timeout: 500 }, mockContext)
      const parsed = JSON.parse(result)
      expect(parsed.error).toContain('at least 1000ms')
    })

    it('should validate maximum timeout', async () => {
      const result = await pythonCodeExecutor(
        { code: 'print("test")', timeout: 200000 },
        mockContext
      )
      const parsed = JSON.parse(result)
      expect(parsed.error).toContain('cannot exceed 120000ms')
    })

    it('should handle missing directory handle', async () => {
      const result = await pythonCodeExecutor({ code: 'print("Hello")' }, mockContext)
      const parsed = JSON.parse(result)
      expect(parsed.error).toContain('No workspace directory selected')
    })

    it('should execute simple Python code with mounted directory', async () => {
      const { useAgentStore } = await import('@/store/agent.store')
      vi.mocked(useAgentStore.getState).mockReturnValue({
        directoryHandle: mockDirectoryHandle,
        directoryName: 'test-project',
        isRestoringHandle: false,
        pendingHandle: null,
        setDirectoryHandle: vi.fn(),
        restoreDirectoryHandle: vi.fn(),
        requestPendingHandlePermission: vi.fn(),
        activeProjectId: "default-project",
        setActiveProject: vi.fn(),
      })

      const { pythonExecutor } = await import('@/python')
      vi.mocked(pythonExecutor.execute).mockResolvedValue({
        success: true,
        stdout: 'Hello, World!',
        executionTime: 100,
      })

      const result = await pythonCodeExecutor({ code: 'print("Hello, World!")' }, mockContext)
      const parsed = JSON.parse(result)

      expect(parsed.stdout).toBe('Hello, World!')
      expect(parsed.executionTime).toBe(100)

      // Verify mountDir was passed
      expect(pythonExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          mountDir: mockDirectoryHandle,
        })
      )
    })

    it('should pass sync parameter to executor', async () => {
      const { useAgentStore } = await import('@/store/agent.store')
      vi.mocked(useAgentStore.getState).mockReturnValue({
        directoryHandle: mockDirectoryHandle,
        directoryName: 'test-project',
        isRestoringHandle: false,
        pendingHandle: null,
        setDirectoryHandle: vi.fn(),
        restoreDirectoryHandle: vi.fn(),
        requestPendingHandlePermission: vi.fn(),
        activeProjectId: "default-project",
        setActiveProject: vi.fn(),
      })

      const { pythonExecutor } = await import('@/python')
      vi.mocked(pythonExecutor.execute).mockResolvedValue({
        success: true,
        executionTime: 100,
      })

      await pythonCodeExecutor({ code: 'save()', sync: true }, mockContext)

      expect(pythonExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          syncFs: true,
        })
      )
    })

    it('should handle execution errors', async () => {
      const { useAgentStore } = await import('@/store/agent.store')
      vi.mocked(useAgentStore.getState).mockReturnValue({
        directoryHandle: mockDirectoryHandle,
        directoryName: 'test-project',
        isRestoringHandle: false,
        pendingHandle: null,
        setDirectoryHandle: vi.fn(),
        restoreDirectoryHandle: vi.fn(),
        requestPendingHandlePermission: vi.fn(),
        activeProjectId: "default-project",
        setActiveProject: vi.fn(),
      })

      const { pythonExecutor } = await import('@/python')
      vi.mocked(pythonExecutor.execute).mockResolvedValue({
        success: false,
        error: 'Syntax error',
        executionTime: 50,
      })

      const result = await pythonCodeExecutor({ code: 'invalid python' }, mockContext)
      const parsed = JSON.parse(result)

      expect(parsed.error).toBe('Syntax error')
    })

    it('should handle timeout specification', async () => {
      const { useAgentStore } = await import('@/store/agent.store')
      vi.mocked(useAgentStore.getState).mockReturnValue({
        directoryHandle: mockDirectoryHandle,
        directoryName: 'test-project',
        isRestoringHandle: false,
        pendingHandle: null,
        setDirectoryHandle: vi.fn(),
        restoreDirectoryHandle: vi.fn(),
        requestPendingHandlePermission: vi.fn(),
        activeProjectId: "default-project",
        setActiveProject: vi.fn(),
      })

      const { pythonExecutor } = await import('@/python')
      vi.mocked(pythonExecutor.execute).mockResolvedValue({
        success: true,
        executionTime: 300,
      })

      await pythonCodeExecutor(
        {
          code: 'import time; time.sleep(1)',
          timeout: 60000,
        },
        mockContext
      )

      expect(pythonExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 60000,
        })
      )
    })

    it('should format results with images', async () => {
      const { useAgentStore } = await import('@/store/agent.store')
      vi.mocked(useAgentStore.getState).mockReturnValue({
        directoryHandle: mockDirectoryHandle,
        directoryName: 'test-project',
        isRestoringHandle: false,
        pendingHandle: null,
        setDirectoryHandle: vi.fn(),
        restoreDirectoryHandle: vi.fn(),
        requestPendingHandlePermission: vi.fn(),
        activeProjectId: "default-project",
        setActiveProject: vi.fn(),
      })

      const { pythonExecutor } = await import('@/python')
      vi.mocked(pythonExecutor.execute).mockResolvedValue({
        success: true,
        executionTime: 500,
        images: [
          {
            filename: 'plot.png',
            data: 'base64data',
          },
        ],
      })

      const result = await pythonCodeExecutor({ code: 'plot' }, mockContext)
      const parsed = JSON.parse(result)

      expect(parsed.images).toHaveLength(1)
      expect(parsed.images[0].filename).toBe('plot.png')
    })

    it('should include synced status when sync=true', async () => {
      const { useAgentStore } = await import('@/store/agent.store')
      vi.mocked(useAgentStore.getState).mockReturnValue({
        directoryHandle: mockDirectoryHandle,
        directoryName: 'test-project',
        isRestoringHandle: false,
        pendingHandle: null,
        setDirectoryHandle: vi.fn(),
        restoreDirectoryHandle: vi.fn(),
        requestPendingHandlePermission: vi.fn(),
        activeProjectId: "default-project",
        setActiveProject: vi.fn(),
      })

      const { pythonExecutor } = await import('@/python')
      vi.mocked(pythonExecutor.execute).mockResolvedValue({
        success: true,
        executionTime: 100,
      })

      const result = await pythonCodeExecutor({ code: 'save()', sync: true }, mockContext)
      const parsed = JSON.parse(result)

      expect(parsed.synced).toBe(true)
    })

    it('should NOT include outputFiles in response', async () => {
      const { useAgentStore } = await import('@/store/agent.store')
      vi.mocked(useAgentStore.getState).mockReturnValue({
        directoryHandle: mockDirectoryHandle,
        directoryName: 'test-project',
        isRestoringHandle: false,
        pendingHandle: null,
        setDirectoryHandle: vi.fn(),
        restoreDirectoryHandle: vi.fn(),
        requestPendingHandlePermission: vi.fn(),
        activeProjectId: "default-project",
        setActiveProject: vi.fn(),
      })

      const { pythonExecutor } = await import('@/python')
      vi.mocked(pythonExecutor.execute).mockResolvedValue({
        success: true,
        executionTime: 400,
        outputFiles: [
          {
            name: 'output.csv',
            content: new ArrayBuffer(1024),
          },
        ],
      })

      const result = await pythonCodeExecutor({ code: 'save' }, mockContext)
      const parsed = JSON.parse(result)

      // outputFiles should NOT be in the response
      expect(parsed.outputFiles).toBeUndefined()
    })

    it('should handle permission denied error', async () => {
      const deniedHandle = {
        queryPermission: vi.fn(() => Promise.resolve('prompt')),
        name: 'test-project',
      } as unknown as FileSystemDirectoryHandle

      const { useAgentStore } = await import('@/store/agent.store')
      vi.mocked(useAgentStore.getState).mockReturnValue({
        directoryHandle: deniedHandle,
        directoryName: 'test-project',
        isRestoringHandle: false,
        pendingHandle: null,
        setDirectoryHandle: vi.fn(),
        restoreDirectoryHandle: vi.fn(),
        requestPendingHandlePermission: vi.fn(),
        activeProjectId: "default-project",
        setActiveProject: vi.fn(),
      })

      const result = await pythonCodeExecutor({ code: 'print("test")' }, mockContext)
      const parsed = JSON.parse(result)

      expect(parsed.error).toContain('permission not granted')
    })
  })

  describe('Error Handling', () => {
    it('should handle Pyodide loading errors', async () => {
      const { useAgentStore } = await import('@/store/agent.store')
      vi.mocked(useAgentStore.getState).mockReturnValue({
        directoryHandle: mockDirectoryHandle,
        directoryName: 'test-project',
        isRestoringHandle: false,
        pendingHandle: null,
        setDirectoryHandle: vi.fn(),
        restoreDirectoryHandle: vi.fn(),
        requestPendingHandlePermission: vi.fn(),
        activeProjectId: "default-project",
        setActiveProject: vi.fn(),
      })

      const { pythonExecutor } = await import('@/python')
      vi.mocked(pythonExecutor.execute).mockRejectedValue(
        new Error('Pyodide is loading')
      )

      const result = await pythonCodeExecutor({ code: 'print("test")' }, mockContext)
      const parsed = JSON.parse(result)

      expect(parsed.error).toContain('loading')
    })

    it('should handle NotAllowedError permission errors', async () => {
      const { useAgentStore } = await import('@/store/agent.store')
      vi.mocked(useAgentStore.getState).mockReturnValue({
        directoryHandle: mockDirectoryHandle,
        directoryName: 'test-project',
        isRestoringHandle: false,
        pendingHandle: null,
        setDirectoryHandle: vi.fn(),
        restoreDirectoryHandle: vi.fn(),
        requestPendingHandlePermission: vi.fn(),
        activeProjectId: "default-project",
        setActiveProject: vi.fn(),
      })

      const { pythonExecutor } = await import('@/python')
      vi.mocked(pythonExecutor.execute).mockRejectedValue(
        new Error('NotAllowedError: Permission denied')
      )

      const result = await pythonCodeExecutor({ code: 'print("test")' }, mockContext)
      const parsed = JSON.parse(result)

      expect(parsed.error).toContain('Permission denied')
    })
  })
})
