import { describe, expect, it } from 'vitest'
import { validateRubricDefinition, type RubricDefinition } from '../workflow/rubric'

function createValidRubric(partial?: Partial<RubricDefinition>): RubricDefinition {
  return {
    id: 'novel_daily_v1',
    version: 1,
    name: 'Novel Daily',
    passCondition: 'total_score >= 80 and hard_fail_count == 0',
    retryPolicy: {
      maxRepairRounds: 2,
    },
    rules: [
      {
        id: 'narrative_paragraph_len',
        checker: 'paragraph_sentence_count',
        params: {
          target: 'narrative',
          min: 3,
          max: 6,
        },
        weight: 0.25,
        threshold: {
          violationRateLte: 0.05,
        },
        failAction: 'auto_repair',
        severity: 'high',
      },
    ],
    ...partial,
  }
}

describe('validateRubricDefinition', () => {
  it('accepts a valid rubric definition', () => {
    const result = validateRubricDefinition(createValidRubric())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects empty rules list', () => {
    const result = validateRubricDefinition(createValidRubric({ rules: [] }))
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('at least one rule')
  })

  it('rejects duplicate rule ids', () => {
    const rule = createValidRubric().rules[0]
    const result = validateRubricDefinition(
      createValidRubric({
        rules: [rule, { ...rule }],
      })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('duplicate')
  })

  it('rejects when rule weight is out of range', () => {
    const rubric = createValidRubric()
    rubric.rules[0].weight = 1.5

    const result = validateRubricDefinition(rubric)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('weight')
  })

  it('rejects unsupported fail action', () => {
    const rubric = createValidRubric()
    rubric.rules[0].failAction = 'do_nothing' as never

    const result = validateRubricDefinition(rubric)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('failAction')
  })

  it('rejects maxRepairRounds lower than zero', () => {
    const result = validateRubricDefinition(
      createValidRubric({
        retryPolicy: {
          maxRepairRounds: -1,
        },
      })
    )

    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('maxRepairRounds')
  })
})
