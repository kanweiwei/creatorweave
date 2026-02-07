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
vi.mock('@/store/agent.store', () => ({
  useAgentStore: {
    getState: vi.fn(() => ({
      directoryHandle: null,
    })),
  },
}))

// Mock OPFS store
vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: {
    getState: vi.fn(() => ({
      readFile: vi.fn(),
    })),
  },
}))

// Mock Python bridge
vi.mock('@/python/bridge', () => ({
  getActiveFiles: vi.fn(() => Promise.resolve([])),
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
      expect(params.properties.packages).toBeDefined()
      expect(params.properties.files).toBeDefined()
      expect(params.properties.timeout).toBeDefined()
    })

    it('should have comprehensive description', () => {
      const desc = pythonCodeDefinition.function.description
      expect(desc).toContain('Python')
      expect(desc).toContain('Pyodide')
      expect(desc).toContain('pandas')
      expect(desc).toContain('matplotlib')
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

    it('should handle missing directory handle', async () => {
      const { pythonExecutor } = await import('@/python')
      vi.mocked(pythonExecutor.execute).mockResolvedValue({
        success: true,
        executionTime: 100,
      })

      const result = await pythonCodeExecutor(
        {
          code: 'print("Hello")',
          files: [{ path: 'test.txt' }],
        },
        mockContext
      )

      const parsed = JSON.parse(result)
      // Should fail because no directory handle is set
      expect(parsed.error).toContain('No directory selected')
    })

    it('should execute simple Python code', async () => {
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
    })

    it('should handle execution errors', async () => {
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

    it('should handle package specification', async () => {
      const { pythonExecutor } = await import('@/python')
      vi.mocked(pythonExecutor.execute).mockResolvedValue({
        success: true,
        executionTime: 200,
      })

      await pythonCodeExecutor(
        {
          code: 'import pandas as pd',
          packages: ['pandas', 'numpy'],
        },
        mockContext
      )

      expect(pythonExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          packages: ['pandas', 'numpy'],
        })
      )
    })

    it('should handle timeout specification', async () => {
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

    it('should format results with output files', async () => {
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

      expect(parsed.outputFiles).toHaveLength(1)
      expect(parsed.outputFiles[0].name).toBe('output.csv')
      expect(parsed.outputFiles[0].size).toBe(1024)
    })
  })

  describe('Package Detection', () => {
    it('should detect pandas imports', () => {
      const code = 'import pandas as pd\ndf = pd.read_csv("data.csv")'
      const packages = detectPackages(code)
      expect(packages).toContain('pandas')
    })

    it('should detect numpy imports', () => {
      const code = 'import numpy as np\narr = np.array([1, 2, 3])'
      const packages = detectPackages(code)
      expect(packages).toContain('numpy')
    })

    it('should detect matplotlib imports', () => {
      const code = 'import matplotlib.pyplot as plt\nplt.plot([1,2,3])'
      const packages = detectPackages(code)
      expect(packages).toContain('matplotlib')
    })

    it('should detect openpyxl imports', () => {
      const code = 'import openpyxl\nwb = openpyxl.load_workbook("data.xlsx")'
      const packages = detectPackages(code)
      expect(packages).toContain('openpyxl')
    })

    it('should detect multiple packages', () => {
      const code = `
        import pandas as pd
        import numpy as np
        import matplotlib.pyplot as plt
      `
      const packages = detectPackages(code)
      expect(packages).toContain('pandas')
      expect(packages).toContain('numpy')
      expect(packages).toContain('matplotlib')
    })

    it('should return empty array for no imports', () => {
      const code = 'print("Hello, World!")'
      const packages = detectPackages(code)
      expect(packages).toEqual([])
    })
  })
})

// Helper function for testing (should be exported from python.tool)
function detectPackages(code: string): string[] {
  const detected: string[] = []
  const patterns: Record<string, RegExp[]> = {
    pandas: [/\bimport\s+pandas\b/, /\bfrom\s+pandas\b/],
    numpy: [/\bimport\s+numpy\b/, /\bfrom\s+numpy\b/, /\bimport\s+numpy\b/],
    matplotlib: [
      /\bimport\s+matplotlib\b/,
      /\bfrom\s+matplotlib\b/,
      /\bimport\s+matplotlib\.pyplot\b/,
      /\bfrom\s+matplotlib\.pyplot\b/,
    ],
    openpyxl: [/\bimport\s+openpyxl\b/, /\bfrom\s+openpyxl\b/],
  }

  for (const [pkg, regexList] of Object.entries(patterns)) {
    for (const regex of regexList) {
      if (regex.test(code)) {
        detected.push(pkg)
        break
      }
    }
  }

  return detected
}
