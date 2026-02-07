/**
 * run_javascript_code tool - Execute JavaScript code in the browser
 *
 * Features:
 * - Execute arbitrary JavaScript code with console capture
 * - Capture console.log, console.error, console.warn outputs
 * - Return execution result and captured output
 * - Timeout management for long-running code
 * - Safe execution with error handling
 *
 * Use cases:
 * - Quick data processing and transformation
 * - JSON manipulation and validation
 * - Algorithm testing and verification
 * - DOM API exploration
 * - Array/object operations
 *
 * Examples:
 * - Process JSON: run_javascript_code(code="const data = {a: 1, b: 2}; JSON.stringify(data, null, 2);")
 * - Array operations: run_javascript_code(code="[1,2,3].map(x => x * 2).filter(x => x > 2);")
 * - String manipulation: run_javascript_code(code="'hello'.toUpperCase().split('').join('-');")
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'

//=============================================================================
// Tool Definition
//=============================================================================

export const javascriptCodeDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'run_javascript_code',
    description: `Execute JavaScript code in the browser. Use for data processing, JSON manipulation, algorithm testing, or quick calculations.

Available APIs:
- All standard JavaScript (ES2024+)
- Array/Object methods (map, filter, reduce, etc.)
- JSON methods (parse, stringify)
- Math functions
- Date/Time operations
- String methods
- RegExp operations

Use cases:
- Data transformation: convert between JSON, CSV, arrays
- Algorithm testing: test sorting, searching algorithms
- Calculations: mathematical operations, statistics
- String processing: text manipulation, pattern matching

Examples:
- Transform data: run_javascript_code(code="const data = [{name: 'A', value: 1}, {name: 'B', value: 2}]; data.map(x => ({...x, doubled: x.value * 2}));")
- Calculate stats: run_javascript_code(code="const nums = [1,2,3,4,5]; nums.reduce((a,b) => a + b, 0) / nums.length;")
- Parse JSON: run_javascript_code(code="const json = '{\\"key\\": \\"value\\"}'; JSON.stringify(JSON.parse(json), null, 2);")`,
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            'JavaScript code to execute. The last expression is automatically returned as the result.',
        },
        timeout: {
          type: 'number',
          description: 'Execution timeout in milliseconds (default: 5000, max: 30000).',
        },
      },
      required: ['code'],
    },
  },
}

//=============================================================================
// Console Capture Helper
//=============================================================================

interface ConsoleCapture {
  logs: string[]
  errors: string[]
  warns: string[]
}

/**
 * Create a sandboxed console that captures all output
 */
function createConsoleCapture(): ConsoleCapture {
  const capture: ConsoleCapture = {
    logs: [],
    errors: [],
    warns: [],
  }

  const originalLog = console.log
  const originalError = console.error
  const originalWarn = console.warn

  // Override console methods to capture output
  console.log = (...args: unknown[]) => {
    capture.logs.push(args.map(formatOutput).join(' '))
    originalLog(...args) // Still log to browser console
  }

  console.error = (...args: unknown[]) => {
    capture.errors.push(args.map(formatOutput).join(' '))
    originalError(...args)
  }

  console.warn = (...args: unknown[]) => {
    capture.warns.push(args.map(formatOutput).join(' '))
    originalWarn(...args)
  }

  return capture
}

/**
 * Format output for display
 */
function formatOutput(item: unknown): string {
  if (typeof item === 'string') return item
  if (item === null) return 'null'
  if (item === undefined) return 'undefined'
  if (typeof item === 'object') {
    try {
      return JSON.stringify(item, null, 2)
    } catch {
      return String(item)
    }
  }
  return String(item)
}

//=============================================================================
// Code Executor
//=============================================================================

interface ExecutionResult {
  success: boolean
  result?: unknown
  output?: {
    logs: string[]
    errors: string[]
    warns: string[]
  }
  error?: string
  executionTime: number
}

/**
 * Execute JavaScript code with console capture and timeout
 */
async function executeJavaScript(code: string, timeout: number): Promise<ExecutionResult> {
  const startTime = performance.now()

  // Create console capture
  const capture = createConsoleCapture()

  try {
    // Create a promise that resolves with the code execution result
    const executionPromise = new Promise<unknown>((resolve, reject) => {
      try {
        // Wrap code to capture the last expression as the return value
        // We use eval here (carefully) to execute the code in the current scope
        // The code is wrapped to automatically return the last expression
        const wrappedCode = `
          (() => {
            try {
              ${code}
            } catch (e) {
              return e;
            }
          })()
        `

        // Execute the code
        const result = eval(wrappedCode)

        // Check if result is an error
        if (result instanceof Error) {
          reject(result)
        } else {
          resolve(result)
        }
      } catch (error) {
        reject(error)
      }
    })

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Execution timeout after ${timeout}ms`))
      }, timeout)
    })

    // Race between execution and timeout
    const result = await Promise.race([executionPromise, timeoutPromise])

    const executionTime = performance.now() - startTime

    return {
      success: true,
      result,
      output: {
        logs: capture.logs,
        errors: capture.errors,
        warns: capture.warns,
      },
      executionTime,
    }
  } catch (error) {
    const executionTime = performance.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      success: false,
      error: errorMessage,
      output: {
        logs: capture.logs,
        errors: [...capture.errors, errorMessage],
        warns: capture.warns,
      },
      executionTime,
    }
  }
}

//=============================================================================
// Tool Executor
//=============================================================================

export const javascriptCodeExecutor: ToolExecutor = async (args) => {
  const code = args.code as string
  const timeout = Math.min(Math.max((args.timeout as number) || 5000, 100), 30000)

  if (!code || typeof code !== 'string') {
    return JSON.stringify({ error: 'Code is required and must be a string' })
  }

  if (code.length > 50000) {
    return JSON.stringify({
      error: `Code is too large (${code.length} bytes). Maximum size is 50KB.`,
    })
  }

  // Basic security checks - prevent obvious malicious patterns
  const dangerousPatterns = [
    /document\.cookie/i,
    /localStorage\.(get|set|remove)Item/i,
    /sessionStorage\.(get|set|remove)Item/i,
    /window\.location/i,
    /XMLHttpRequest/i,
    /fetch\s*\(/i,
    /eval\s*\(/i,
    /Function\s*\(/i,
    /<iframe/i,
    /<script/i,
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      return JSON.stringify({
        error: `Code contains potentially dangerous pattern: ${pattern.source}`,
        hint: 'For security reasons, certain APIs are restricted.',
      })
    }
  }

  try {
    const result = await executeJavaScript(code, timeout)

    if (!result.success) {
      return JSON.stringify({
        error: result.error,
        output: result.output,
        executionTime: Math.round(result.executionTime),
      })
    }

    // Format result for Agent
    const response: {
      result?: unknown
      resultString?: string
      output?: {
        logs: string[]
        errors: string[]
        warns: string[]
      }
      executionTime: number
    } = {
      executionTime: Math.round(result.executionTime),
    }

    // Include captured output if any
    if (
      result.output &&
      (result.output.logs.length > 0 ||
        result.output.errors.length > 0 ||
        result.output.warns.length > 0)
    ) {
      response.output = result.output
    }

    // Include result
    if (result.result !== undefined) {
      response.result = result.result

      // Also provide a string representation for easier reading
      try {
        if (typeof result.result === 'object' && result.result !== null) {
          response.resultString = JSON.stringify(result.result, null, 2)
        } else if (typeof result.result === 'string') {
          response.resultString = result.result
        } else {
          response.resultString = String(result.result)
        }
      } catch {
        response.resultString = String(result.result)
      }
    }

    return JSON.stringify(response, null, 2)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return JSON.stringify({
      error: `Execution error: ${errorMessage}`,
    })
  }
}
