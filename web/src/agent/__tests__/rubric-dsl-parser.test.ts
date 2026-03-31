import { describe, expect, it } from 'vitest'
import { parseRubricDsl } from '../workflow/rubric'

describe('parseRubricDsl', () => {
  it('parses valid json rubric dsl', () => {
    const result = parseRubricDsl(`
      {
        "id": "novel_daily_v1",
        "version": 1,
        "name": "Novel Daily",
        "passCondition": "total_score >= 80",
        "retryPolicy": { "maxRepairRounds": 2 },
        "rules": [
          {
            "id": "paragraph_len",
            "checker": "paragraph_sentence_count",
            "params": { "min": 3, "max": 6 },
            "weight": 0.5,
            "threshold": { "violationRateLte": 0.05 },
            "failAction": "auto_repair",
            "severity": "high"
          }
        ]
      }
    `)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.rubric.id).toBe('novel_daily_v1')
  })

  it('returns syntax error for invalid json', () => {
    const result = parseRubricDsl('{')
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.errors.join(' ')).toContain('JSON')
  })

  it('returns validation errors for invalid rubric payload', () => {
    const result = parseRubricDsl(`
      {
        "id": "",
        "version": 1,
        "name": "Invalid",
        "passCondition": "",
        "retryPolicy": { "maxRepairRounds": -1 },
        "rules": []
      }
    `)

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.errors.join(' ')).toContain('at least one rule')
  })
})
