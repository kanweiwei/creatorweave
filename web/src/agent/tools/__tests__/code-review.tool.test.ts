/**
 * Code Review Tool Tests
 *
 * Unit tests for the code review static analysis tool.
 */

import { describe, it, expect } from 'vitest'
import { runReview, CODE_REVIEW_RULES } from '../code-review.tool'

describe('Code Review Tool', () => {
  describe('runReview', () => {
    it('should detect hardcoded secrets', () => {
      const code = `const apiKey = "sk-1234567890abcdefghijklmnop"`
      const result = runReview(code, 'config.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'sec/hardcoded-secret')).toBe(true)
    })

    it('should detect SQL injection patterns', () => {
      const code = `query = "SELECT * FROM users WHERE id = " + userId`
      const result = runReview(code, 'query.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'sec/sql-injection')).toBe(true)
    })

    it('should detect eval usage', () => {
      const code = `eval("dangerous code")`
      const result = runReview(code, 'script.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'sec/eval-usage')).toBe(true)
    })

    it('should detect innerHTML with user data', () => {
      const code = `element.innerHTML = userInput`
      const result = runReview(code, 'script.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'sec/innerHTML-xss')).toBe(true)
    })

    it('should detect Math.random for security purposes', () => {
      const code = `const token = Math.random().toString(36)`
      const result = runReview(code, 'script.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'sec/weak-random')).toBe(true)
    })

    it('should detect missing error handling in promises', () => {
      const code = `fetch(url).then(handleResponse)`
      const result = runReview(code, 'script.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'best/no-error-handling')).toBe(true)
    })

    it('should detect console.log statements', () => {
      const code = `console.log("debug")`
      const result = runReview(code, 'script.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'best/console-log')).toBe(true)
    })

    it('should detect empty catch blocks', () => {
      const code = `try {
  risky()
} catch (e) {}`
      const result = runReview(code, 'script.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'best/empty-catch')).toBe(true)
    })

    it('should detect debugger statements', () => {
      const code = `function debug() {
  debugger
}`
      const result = runReview(code, 'script.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'best/debugger-statement')).toBe(true)
    })

    it('should detect magic numbers', () => {
      const code = `if (status === 999) { }`
      const result = runReview(code, 'script.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'best/magic-number')).toBe(true)
    })

    it('should detect long lines', () => {
      const code = `const veryLongVariableName = "this is a very long string that exceeds one hundred and twenty characters and should trigger a warning"`
      const result = runReview(code, 'script.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'style/line-length')).toBe(true)
    })

    it('should detect typeof array check', () => {
      const code = `if (typeof items === "array") { }`
      const result = runReview(code, 'script.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'best/typeof-check')).toBe(true)
    })

    it('should filter by category', () => {
      const code = `const apiKey = "sk-1234567890abcdefghijklmnop"
const password = "mypassword123"
console.log("debug")`
      const securityResult = runReview(code, 'script.js', 'javascript', ['security'])
      const bestPracticeResult = runReview(code, 'script.js', 'javascript', ['best-practice'])

      expect(securityResult.issues.every((i) => i.category === 'security')).toBe(true)
      expect(bestPracticeResult.issues.every((i) => i.category === 'best-practice')).toBe(true)
      expect(securityResult.issues.length).toBeGreaterThan(0)
      expect(bestPracticeResult.issues.length).toBeGreaterThan(0)
    })

    it('should include correct summary counts', () => {
      const code = `const apiKey = "sk-1234567890abcdefghijklmnop"
const password = "mypassword123"
console.log("debug")`
      const result = runReview(code, 'script.js', 'javascript')
      // Should detect at least the API key and password
      expect(result.summary.errors).toBeGreaterThanOrEqual(2)
      // Should detect console.log
      expect(result.summary.suggestions).toBeGreaterThanOrEqual(1)
    })

    it('should handle empty code', () => {
      const result = runReview('', 'empty.js', 'javascript')
      expect(result.issues).toHaveLength(0)
    })

    it('should detect DOM queries in loops', () => {
      const code = `for (let i = 0; i < 10; i++) {
  document.getElementById('test')
}`
      const result = runReview(code, 'script.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'perf/dom-in-loop')).toBe(true)
    })

    it('should detect innerHTML in loops', () => {
      const code = `for (let i = 0; i < 10; i++) {
  container.innerHTML = '<div>' + i + '</div>'
}`
      const result = runReview(code, 'script.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'perf/inner-html-loop')).toBe(true)
    })

    it('should detect array.push in loops', () => {
      const code = `for (let i = 0; i < 10; i++) {
  results.push(i * 2)
}`
      const result = runReview(code, 'script.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'perf/array-push-loop')).toBe(true)
    })

    it('should detect await in loops', () => {
      const code = `for (let i = 0; i < 10; i++) {
  await fetch('/api/' + i)
}`
      const result = runReview(code, 'script.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'best/no-await-loop')).toBe(true)
    })

    it('should detect password patterns', () => {
      const code = `const password = "mypassword123"`
      const result = runReview(code, 'config.js', 'javascript')
      expect(result.issues.some((i) => i.rule === 'sec/hardcoded-secret')).toBe(true)
    })

    it('should not have false positives on clean code', () => {
      const code = `function calculateTotal(items: number[]): number {
  const taxRate = 0.08
  const subtotal = items.reduce((sum, item) => sum + item, 0)
  return subtotal * (1 + taxRate)
}`
      const result = runReview(code, 'calculator.ts', 'typescript')
      // Should not have any issues or only magic number
      expect(result.issues.length).toBeLessThanOrEqual(1)
    })
  })

  describe('CODE_REVIEW_RULES', () => {
    it('should have all required categories', () => {
      const categories = new Set(CODE_REVIEW_RULES.map((r) => r.category))
      expect(categories.has('style')).toBe(true)
      expect(categories.has('performance')).toBe(true)
      expect(categories.has('security')).toBe(true)
      expect(categories.has('best-practice')).toBe(true)
    })

    it('should have rules for all severity levels', () => {
      const severities = new Set(CODE_REVIEW_RULES.map((r) => r.severity))
      expect(severities.has('error')).toBe(true)
      expect(severities.has('warning')).toBe(true)
      expect(severities.has('info')).toBe(true)
    })

    it('should have unique rule IDs', () => {
      const ids = CODE_REVIEW_RULES.map((r) => r.id)
      const uniqueIds = new Set(ids)
      expect(ids.length).toBe(uniqueIds.size)
    })

    it('should have at least 15 rules', () => {
      expect(CODE_REVIEW_RULES.length).toBeGreaterThanOrEqual(15)
    })
  })

  describe('Language Detection', () => {
    it('should detect TypeScript files', () => {
      const code = `const fn = (x: number): number => x * 2`
      const result = runReview(code, 'test.ts', '')
      // No issues expected for simple TS code
      expect(result.issues.length).toBeLessThanOrEqual(1)
    })

    it('should detect Python files', () => {
      const code = `def hello(name):
    return f"Hello, {name}"`
      const result = runReview(code, 'test.py', '')
      // Python indentation check might trigger
      expect(result.issues.length).toBeLessThanOrEqual(1)
    })
  })

  describe('Output Format', () => {
    it('should return correct result structure', () => {
      const code = `console.log("test")`
      const result = runReview(code, 'test.js', 'javascript')

      expect(result).toHaveProperty('file')
      expect(result).toHaveProperty('issues')
      expect(result).toHaveProperty('summary')
      expect(result.file).toBe('test.js')
      expect(Array.isArray(result.issues)).toBe(true)
      expect(result.summary).toHaveProperty('errors')
      expect(result.summary).toHaveProperty('warnings')
      expect(result.summary).toHaveProperty('suggestions')
    })

    it('should have issue with correct properties', () => {
      const code = `eval("bad")`
      const result = runReview(code, 'test.js', 'javascript')
      const issue = result.issues[0]

      expect(issue).toHaveProperty('line')
      expect(issue).toHaveProperty('column')
      expect(issue).toHaveProperty('severity')
      expect(issue).toHaveProperty('category')
      expect(issue).toHaveProperty('message')
      expect(issue).toHaveProperty('rule')
      expect(['error', 'warning', 'info']).toContain(issue.severity)
      expect(['style', 'performance', 'security', 'best-practice']).toContain(issue.category)
    })
  })
})
