import { describe, expect, it } from 'vitest'
import { evaluateExpression } from '../workflow/expression-eval'

describe('evaluateExpression', () => {
  it('evaluates a simple numeric comparison', () => {
    expect(evaluateExpression('${review.score} >= 80', { review: { score: 85 } })).toBe(true)
    expect(evaluateExpression('${review.score} >= 80', { review: { score: 75 } })).toBe(false)
  })

  it('evaluates a boolean equality', () => {
    expect(evaluateExpression('${review.passed} == true', { review: { passed: true } })).toBe(true)
    expect(evaluateExpression('${review.passed} == true', { review: { passed: false } })).toBe(false)
  })

  it('evaluates AND combination', () => {
    const ctx = { review: { score: 85, passed: true } }
    expect(evaluateExpression('${review.score} >= 80 AND ${review.passed} == true', ctx)).toBe(true)
    expect(evaluateExpression('${review.score} >= 80 AND ${review.passed} == false', ctx)).toBe(false)
  })

  it('evaluates OR combination', () => {
    const ctx = { review: { score: 75, passed: true } }
    expect(evaluateExpression('${review.score} >= 80 OR ${review.passed} == true', ctx)).toBe(true)
  })

  it('returns false for missing variables', () => {
    expect(evaluateExpression('${missing.value} >= 80', {})).toBe(false)
  })

  it('handles string equality', () => {
    expect(evaluateExpression('${status} == "approved"', { status: 'approved' })).toBe(true)
    expect(evaluateExpression('${status} == "approved"', { status: 'rejected' })).toBe(false)
  })

  it('handles not-equal operator', () => {
    expect(evaluateExpression('${count} != 0', { count: 5 })).toBe(true)
    expect(evaluateExpression('${count} != 0', { count: 0 })).toBe(false)
  })

  it('handles less-than operators', () => {
    expect(evaluateExpression('${count} < 10', { count: 5 })).toBe(true)
    expect(evaluateExpression('${count} <= 5', { count: 5 })).toBe(true)
    expect(evaluateExpression('${count} > 3', { count: 5 })).toBe(true)
  })

  it('handles string variables with dots in name', () => {
    expect(evaluateExpression('${draft.word_count} > 1000', { draft: { word_count: 1500 } })).toBe(true)
  })

  it('evaluates true literal as always passing', () => {
    expect(evaluateExpression('true', {})).toBe(true)
  })

  it('handles parentheses for grouping', () => {
    const ctx = { a: { score: 70 }, b: { score: 90 } }
    expect(evaluateExpression('(${a.score} >= 80) OR (${b.score} >= 80)', ctx)).toBe(true)
  })
})
