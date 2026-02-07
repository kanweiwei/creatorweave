/**
 * Tests for javascript-execution.tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { javascriptCodeExecutor } from '../javascript-execution.tool'

describe('javascript-execution.tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore console after each test
    // Note: This is a simplified approach
  })

  it('should execute simple JavaScript code', async () => {
    const result = await javascriptCodeExecutor({ code: '1 + 1' }, { directoryHandle: null })
    const parsed = JSON.parse(result)

    expect(parsed.result).toBe(2)
    expect(parsed.executionTime).toBeGreaterThan(0)
  })

  it('should execute array operations', async () => {
    const result = await javascriptCodeExecutor(
      { code: '[1, 2, 3].map(x => x * 2)' },
      { directoryHandle: null }
    )
    const parsed = JSON.parse(result)

    expect(parsed.result).toEqual([2, 4, 6])
  })

  it('should execute object operations', async () => {
    const result = await javascriptCodeExecutor(
      { code: 'const obj = { a: 1, b: 2 }; JSON.stringify(obj, null, 2)' },
      { directoryHandle: null }
    )
    const parsed = JSON.parse(result)

    expect(parsed.resultString).toBe('{\n  "a": 1,\n  "b": 2\n}')
  })

  it('should capture console.log output', async () => {
    const result = await javascriptCodeExecutor(
      { code: 'console.log("test"); 42' },
      { directoryHandle: null }
    )
    const parsed = JSON.parse(result)

    expect(parsed.result).toBe(42)
    expect(parsed.output?.logs).toContain('test')
  })

  it('should handle syntax errors', async () => {
    const result = await javascriptCodeExecutor(
      { code: 'invalid syntax here' },
      { directoryHandle: null }
    )
    const parsed = JSON.parse(result)

    expect(parsed.error).toBeDefined()
    expect(parsed.success).toBeUndefined() // Error responses don't have success field
  })

  it('should handle runtime errors', async () => {
    const result = await javascriptCodeExecutor(
      { code: 'throw new Error("test error")' },
      { directoryHandle: null }
    )
    const parsed = JSON.parse(result)

    expect(parsed.error).toBe('test error')
  })

  it('should enforce timeout', async () => {
    const result = await javascriptCodeExecutor(
      { code: 'while (true) {}', timeout: 100 },
      { directoryHandle: null }
    )
    const parsed = JSON.parse(result)

    expect(parsed.error).toContain('timeout')
  }, 10000)

  it('should reject dangerous patterns', async () => {
    const dangerousPatterns = ['document.cookie', 'localStorage.getItem', 'fetch(', 'eval(']

    for (const pattern of dangerousPatterns) {
      const result = await javascriptCodeExecutor({ code: pattern }, { directoryHandle: null })
      const parsed = JSON.parse(result)

      expect(parsed.error).toBeDefined()
      expect(parsed.error).toContain('dangerous pattern')
    }
  })

  it('should reject empty code', async () => {
    const result = await javascriptCodeExecutor({ code: '' }, { directoryHandle: null })
    const parsed = JSON.parse(result)

    expect(parsed.error).toBe('Code is required and must be a string')
  })

  it('should reject oversized code', async () => {
    const largeCode = 'x'.repeat(50001)
    const result = await javascriptCodeExecutor({ code: largeCode }, { directoryHandle: null })
    const parsed = JSON.parse(result)

    expect(parsed.error).toContain('too large')
  })

  it('should execute Math operations', async () => {
    const result = await javascriptCodeExecutor(
      { code: 'Math.round(3.7)' },
      { directoryHandle: null }
    )
    const parsed = JSON.parse(result)

    expect(parsed.result).toBe(4)
  })

  it('should execute String operations', async () => {
    const result = await javascriptCodeExecutor(
      { code: "'hello world'.toUpperCase().split(' ')" },
      { directoryHandle: null }
    )
    const parsed = JSON.parse(result)

    expect(parsed.result).toEqual(['HELLO', 'WORLD'])
  })

  it('should execute Date operations', async () => {
    const result = await javascriptCodeExecutor(
      { code: 'new Date("2025-01-01").getFullYear()' },
      { directoryHandle: null }
    )
    const parsed = JSON.parse(result)

    expect(parsed.result).toBe(2025)
  })
})
