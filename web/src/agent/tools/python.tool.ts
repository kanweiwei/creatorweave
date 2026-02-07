/**
 * run_python_code tool - Execute Python code in the browser using Pyodide
 *
 * Features:
 * - Execute arbitrary Python code with stdio capture
 * - Automatic file injection from user's active workspace
 * - Support for pandas, numpy, matplotlib, openpyxl packages
 * - Handle matplotlib image outputs
 * - Capture output files and bridge to OPFS
 * - Comprehensive error handling and timeout management
 *
 * Integration:
 * - Uses pythonExecutor singleton from @/python
 * - Bridges active files from agent store to Pyodide
 * - Maps output files back to user's workspace
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { pythonExecutor } from '@/python'
import type { FileRef as CoreFileRef } from '@/python/types'
import type { FileRef as WorkerFileRef } from '@/python/worker-types'

//=============================================================================
// Tool Definition
//=============================================================================

export const pythonCodeDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'run_python_code',
    description: `Execute Python code in the browser. Use for data analysis, computation, automation, or testing.

⚠️ CRITICAL WORKFLOW: Files MUST be discovered and specified BEFORE use.
1. Use glob() to find files first
2. Then call run_python_code with files parameter
3. Python code reads from /mnt/{filename}

Available packages: pandas, numpy, matplotlib, openpyxl (auto-detected from imports)

Common use cases:
- Data analysis: pandas for CSV/Excel processing
- Visualization: matplotlib for charts and graphs
- Numerical computing: numpy for calculations
- File conversion: between CSV, Excel, JSON formats
- Testing: validate code logic or algorithms

Examples:
- glob("**/data.csv") → run_python_code(code="import pandas as pd; df=pd.read_csv('/mnt/data.csv'); print(df.describe())", files=[{path: "data.csv"}])
- glob("**/report.xlsx") → run_python_code(code="import pandas as pd; df=pd.read_excel('/mnt/report.xlsx'); df.to_csv('/mnt/output.csv')", files=[{path: "report.xlsx"}])`,
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            'Python code to execute. Access injected files via /mnt/{filename} (e.g., /mnt/sales.csv).',
        },
        packages: {
          type: 'array',
          items: {
            type: 'string',
          },
          description:
            'Optional list of packages to load. Available: pandas, numpy, matplotlib, openpyxl. Auto-detected from imports if not specified.',
          enum: ['pandas', 'numpy', 'matplotlib', 'openpyxl'],
        },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description:
                  'Workspace file path from glob results (e.g., "data/input.csv"). Use exact path from glob() - do not guess.',
              },
            },
            required: ['path'],
          },
          description:
            'REQUIRED for file operations. List of {path: string} objects from glob results. Files are injected to /mnt/{filename}.',
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
  const packages = (args.packages as string[]) || []
  const files = args.files as Array<{ path: string }> | undefined
  const timeout = (args.timeout as number) || 30000

  if (!code || typeof code !== 'string') {
    return JSON.stringify({ error: 'Code is required and must be a string' })
  }

  if (code.length > 100000) {
    return JSON.stringify({
      error: `Code is too large (${code.length} bytes). Maximum size is 100KB.`,
    })
  }

  // Check if code references /mnt/ files but no files parameter provided
  const mentionsMnt =
    code.includes('/mnt/') ||
    code.includes('pd.read_excel') ||
    code.includes('pd.read_csv') ||
    code.includes('open(') ||
    code.includes('pd.read_json')
  if (mentionsMnt && (!files || files.length === 0)) {
    return JSON.stringify({
      error: 'Code references files in /mnt/ but no files parameter provided.',
      hint: 'You MUST first use glob() to find the file, then pass it in the files parameter.',
      example:
        'Workflow: glob(pattern="**/*.xlsx") → run_python_code(code="...", files=[{path: "found/file.xlsx"}])',
    })
  }

  try {
    // Get active files if not explicitly specified
    let activeFiles: CoreFileRef[] = []
    try {
      if (files && files.length > 0) {
        // Load specific files
        const { useAgentStore } = await import('@/store/agent.store')
        const directoryHandle = useAgentStore.getState().directoryHandle

        if (!directoryHandle) {
          return JSON.stringify({
            error: 'No directory selected. Please select a project folder first.',
          })
        }

        const { useOPFSStore } = await import('@/store/opfs.store')
        const { readFile } = useOPFSStore.getState()

        for (const fileSpec of files) {
          try {
            const { content } = await readFile(fileSpec.path, directoryHandle)

            // Convert content to FileRef format
            let fileContent: string
            if (typeof content === 'string') {
              fileContent = content
            } else if (content instanceof ArrayBuffer) {
              // Decode binary content as UTF-8
              const decoder = new TextDecoder('utf-8')
              fileContent = decoder.decode(content)
            } else {
              // Blob - read as text
              const blob = content as Blob
              fileContent = await blob.text()
            }

            activeFiles.push({
              path: fileSpec.path,
              name: fileSpec.path.split('/').pop() || fileSpec.path,
              content: fileContent,
              contentType: 'text',
              size: fileContent.length,
              source: 'filesystem',
            })
          } catch (error) {
            console.warn(`[Python Tool] Failed to read file ${fileSpec.path}:`, error)
            // Continue with other files
          }
        }
      }
      // Note: If no files specified, no files are injected. Agent must explicitly specify files needed.
    } catch (error) {
      // If file loading fails, continue without files
      console.warn('[Python Tool] Failed to load files:', error)
      activeFiles = []
    }

    // Auto-detect packages if not explicitly provided
    const finalPackages = packages.length > 0 ? packages : detectPackages(code)

    if (finalPackages.length > 0) {
      console.log('[Python Tool] Auto-detected packages:', finalPackages)
    }

    // Convert CoreFileRef to WorkerFileRef format for executor
    const workerFiles: WorkerFileRef[] = activeFiles.map((file) => {
      // Convert content to ArrayBuffer
      let content: ArrayBuffer
      if (typeof file.content === 'string') {
        const encoder = new TextEncoder()
        const uint8Array = encoder.encode(file.content)
        // Create a proper ArrayBuffer from Uint8Array
        content = new ArrayBuffer(uint8Array.length)
        new Uint8Array(content).set(uint8Array)
      } else if (file.content instanceof Uint8Array) {
        // Create a proper ArrayBuffer copy
        content = new ArrayBuffer(file.content.length)
        new Uint8Array(content).set(file.content)
      } else {
        content = file.content as ArrayBuffer
      }

      return {
        name: file.name,
        content,
      }
    })

    // Execute Python code
    const result = await pythonExecutor.execute({
      code,
      files: workerFiles,
      packages: finalPackages,
      timeout,
    })

    // Handle output files - save to workspace
    if (result.outputFiles && result.outputFiles.length > 0) {
      try {
        // Get directory handle and workspace
        const { useAgentStore } = await import('@/store/agent.store')
        const { getSessionManager } = await import('@/opfs/session')
        const { useWorkspaceStore } = await import('@/store/workspace.store')

        const directoryHandle = useAgentStore.getState().directoryHandle
        if (!directoryHandle) {
          console.warn('[Python Tool] No directory handle, skipping output file bridging')
        } else {
          const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
          if (!activeWorkspaceId) {
            console.warn('[Python Tool] No active workspace, skipping output file bridging')
          } else {
            const manager = await getSessionManager()
            const workspace = await manager.getSession(activeWorkspaceId)
            if (workspace) {
              // Save each output file to workspace
              for (const outputFile of result.outputFiles) {
                try {
                  // Pass ArrayBuffer directly to preserve binary files (images, Excel, etc.)
                  await workspace.writeFile(outputFile.name, outputFile.content, directoryHandle)
                  console.log(
                    `[Python Tool] Saved output file: ${outputFile.name} (${outputFile.content.byteLength} bytes)`
                  )
                } catch (error) {
                  console.error(
                    `[Python Tool] Failed to save output file ${outputFile.name}:`,
                    error
                  )
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn('[Python Tool] Failed to bridge output files:', error)
        // Continue - file bridging failure is not fatal
      }
    }

    // Format result for Agent
    if (!result.success) {
      return JSON.stringify({
        error: result.error || 'Execution failed',
        stderr: result.stderr,
        executionTime: result.executionTime,
      })
    }

    // Build response
    const response: {
      stdout?: string
      stderr?: string
      result?: unknown
      images?: Array<{ filename: string; data: string }>
      outputFiles?: Array<{ name: string; size: number }>
      executionTime: number
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

    if (result.outputFiles && result.outputFiles.length > 0) {
      response.outputFiles = result.outputFiles.map(
        (f: { name: string; content: ArrayBuffer }) => ({
          name: f.name,
          size: f.content.byteLength,
        })
      )
    }

    return JSON.stringify(response, null, 2)
  } catch (error) {
    // Handle Pyodide loading errors
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes('Pyodide') || errorMessage.includes('loading')) {
      return JSON.stringify({
        error: 'Python environment is loading. Please wait a moment and try again.',
        details: errorMessage,
      })
    }

    return JSON.stringify({
      error: `Execution error: ${errorMessage}`,
    })
  }
}

//=============================================================================
// Auto-package Detection Helper
//=============================================================================

/**
 * Auto-detect packages from import statements
 * This allows the Agent to omit the packages parameter
 */
export function detectPackages(code: string): string[] {
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
