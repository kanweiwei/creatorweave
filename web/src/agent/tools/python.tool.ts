/**
 * run_python_code tool - Execute Python code in the browser using Pyodide
 *
 * Features:
 * - Execute arbitrary Python code with stdio capture
 * - Access user's workspace files via mountNativeFS (LazyPyodideFS)
 * - Automatic package loading from imports (pandas, numpy, matplotlib, openpyxl, etc.)
 * - Handle matplotlib image outputs
 * - Optional auto-sync for file writes back to workspace
 * - Comprehensive error handling and timeout management
 *
 * Architecture:
 * - Uses pythonExecutor singleton from @/python
 * - Mounts agentStore.directoryHandle at /mnt using mountNativeFS
 * - LazyPyodideFS provides lazy-loading file access via File System Access API
 * - No file pre-injection - files are read on-demand from native filesystem
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { pythonExecutor } from '@/python'

//=============================================================================
// Tool Definition
//=============================================================================

export const pythonCodeDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'run_python_code',
    description: `Execute Python code in the browser using Pyodide (WebAssembly Python runtime).

ENVIRONMENT: Runs in browser via WebAssembly, not a full Python environment.
- Files are accessible at /mnt/ path (mounted from your workspace)
- Built-in packages: pandas, numpy, matplotlib, openpyxl, pillow, scipy, sklearn, etc.
- For other packages: use micropip.install('package-name')
- For matplotlib: set matplotlib.use('Agg') BEFORE creating figures (headless mode)
- File writes require sync=true to persist back to workspace

IMPORTANT:
1. The workspace directory is automatically mounted at /mnt
2. Set sync=true to persist file writes back to workspace
3. Files are read on-demand - no need to specify which files you need

Examples:
- Simple computation:
  run_python_code(code="print(sum([1, 2, 3]))")

- Data analysis with pandas:
  run_python_code(code="import pandas as pd\\ndf = pd.read_csv('/mnt/data.csv')\\nprint(df.describe())")

- Data visualization (headless mode):
  run_python_code(code="import matplotlib\\nmatplotlib.use('Agg')\\nimport matplotlib.pyplot as plt\\nplt.plot([1, 2, 3])\\nplt.savefig('/mnt/chart.png')", sync=true)

- Write processed data back to workspace:
  run_python_code(code="import pandas as pd\\ndf = pd.read_csv('/mnt/input.csv')\\ndf.to_csv('/mnt/output.csv', index=False)", sync=true)`,
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Python code to execute. Access workspace files via /mnt/{path}.',
        },
        sync: {
          type: 'boolean',
          description:
            'If true, sync file writes back to workspace after execution. Use this when your code writes files.',
        },
        timeout: {
          type: 'number',
          description: 'Execution timeout in milliseconds (default: 30000, max: 120000).',
        },
      },
      required: ['code'],
    },
  },
}

//=============================================================================
// Tool Executor
//=============================================================================

export const pythonCodeExecutor: ToolExecutor = async (args, _context) => {
  const code = args.code as string
  const sync = args.sync as boolean | undefined
  const timeout = (args.timeout as number) || 30000

  // Validation
  if (!code || typeof code !== 'string') {
    return JSON.stringify({ error: 'code is required and must be a string' })
  }

  if (code.length > 100000) {
    return JSON.stringify({
      error: `Code is too large (${code.length} bytes). Maximum size is 100KB.`,
    })
  }

  // Validate timeout range
  if (timeout < 1000) {
    return JSON.stringify({ error: 'Timeout must be at least 1000ms (1 second)' })
  }
  if (timeout > 120000) {
    return JSON.stringify({ error: 'Timeout cannot exceed 120000ms (120 seconds)' })
  }

  // Check for workspace directory
  const { useAgentStore } = await import('@/store/agent.store')
  const directoryHandle = useAgentStore.getState().directoryHandle

  if (!directoryHandle) {
    return JSON.stringify({
      error: 'No workspace directory selected. Please select a project folder first.',
      hint: 'Use the folder selection button to choose your project directory.',
    })
  }

  // Verify directory permissions
  const permission = await directoryHandle.queryPermission({ mode: 'readwrite' })
  if (permission !== 'granted') {
    return JSON.stringify({
      error: 'Workspace directory permission not granted.',
      hint: 'Please re-select the folder to grant read/write permissions.',
    })
  }

  try {
    // Execute Python code with mounted directory
    const result = await pythonExecutor.execute({
      code,
      mountDir: directoryHandle,
      syncFs: sync === true,
      timeout,
    })

    // Format result for Agent
    if (!result.success) {
      return JSON.stringify({
        error: result.error || 'Execution failed',
        stderr: result.stderr,
        executionTime: result.executionTime,
      })
    }

    // Build response (without outputFiles)
    const response: {
      stdout?: string
      stderr?: string
      result?: unknown
      images?: Array<{ filename: string; data: string }>
      executionTime: number
      synced?: boolean
    } = {
      executionTime: result.executionTime,
    }

    if (result.stdout) {
      response.stdout = result.stdout
    }

    if (result.stderr) {
      response.stderr = result.stderr
    }

    if (result.result !== undefined && result.result !== null) {
      response.result = result.result
    }

    if (result.images && result.images.length > 0) {
      response.images = result.images
    }

    // Add sync status if sync was requested
    if (sync === true) {
      response.synced = true
    }

    return JSON.stringify(response, null, 2)
  } catch (error) {
    // Handle errors
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Pyodide loading errors
    if (errorMessage.includes('Pyodide') || errorMessage.includes('loading')) {
      return JSON.stringify({
        error: 'Python environment is loading. Please wait a moment and try again.',
        details: errorMessage,
      })
    }

    // Permission errors
    if (errorMessage.includes('permission') || errorMessage.includes('NotAllowedError')) {
      return JSON.stringify({
        error: 'Permission denied accessing workspace files.',
        hint: 'Please re-select the folder to grant read/write permissions.',
        details: errorMessage,
      })
    }

    // Generic error
    return JSON.stringify({
      error: `Execution error: ${errorMessage}`,
    })
  }
}
