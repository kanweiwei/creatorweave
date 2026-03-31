export type RuleFailAction = 'auto_repair' | 'reroute_review' | 'human_gate' | 'stop'

export type RuleSeverity = 'low' | 'medium' | 'high' | 'hard_fail'

export interface RubricRule {
  id: string
  checker: string
  params: Record<string, unknown>
  weight: number
  threshold: Record<string, number | string | boolean>
  failAction: RuleFailAction
  severity: RuleSeverity
}

export interface RubricRetryPolicy {
  maxRepairRounds: number
}

export interface RubricDefinition {
  id: string
  version: number
  name: string
  passCondition: string
  retryPolicy: RubricRetryPolicy
  rules: RubricRule[]
}

export interface RubricValidationResult {
  valid: boolean
  errors: string[]
}

export type RubricDslParseResult =
  | {
      ok: true
      rubric: RubricDefinition
    }
  | {
      ok: false
      errors: string[]
    }

const SUPPORTED_FAIL_ACTIONS: RuleFailAction[] = [
  'auto_repair',
  'reroute_review',
  'human_gate',
  'stop',
]

const SUPPORTED_SEVERITIES: RuleSeverity[] = ['low', 'medium', 'high', 'hard_fail']

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeThreshold(
  value: unknown
): Record<string, string | number | boolean> {
  if (!isRecord(value)) {
    return {}
  }

  const normalized: Record<string, string | number | boolean> = {}
  for (const [key, fieldValue] of Object.entries(value)) {
    if (
      typeof fieldValue === 'string' ||
      typeof fieldValue === 'number' ||
      typeof fieldValue === 'boolean'
    ) {
      normalized[key] = fieldValue
    }
  }

  return normalized
}

export function validateRubricDefinition(rubric: RubricDefinition): RubricValidationResult {
  const errors: string[] = []

  if (!rubric.id.trim()) {
    errors.push('rubric id is required')
  }

  if (!rubric.name.trim()) {
    errors.push('rubric name is required')
  }

  if (rubric.version < 1) {
    errors.push('rubric version must be >= 1')
  }

  if (!rubric.passCondition.trim()) {
    errors.push('passCondition is required')
  }

  if (rubric.retryPolicy.maxRepairRounds < 0) {
    errors.push('retryPolicy.maxRepairRounds must be >= 0')
  }

  if (rubric.rules.length < 1) {
    errors.push('rubric must include at least one rule')
  }

  const seenRuleIds = new Set<string>()

  rubric.rules.forEach((rule, index) => {
    if (!rule.id.trim()) {
      errors.push(`rules[${index}].id is required`)
    }

    if (seenRuleIds.has(rule.id)) {
      errors.push(`duplicate rule id: ${rule.id}`)
    }

    seenRuleIds.add(rule.id)

    if (!rule.checker.trim()) {
      errors.push(`rules[${index}].checker is required`)
    }

    if (rule.weight < 0 || rule.weight > 1) {
      errors.push(`rules[${index}].weight must be between 0 and 1`)
    }

    if (!SUPPORTED_FAIL_ACTIONS.includes(rule.failAction)) {
      errors.push(`rules[${index}].failAction is not supported: ${String(rule.failAction)}`)
    }

    if (!SUPPORTED_SEVERITIES.includes(rule.severity)) {
      errors.push(`rules[${index}].severity is not supported: ${String(rule.severity)}`)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function parseRubricDsl(source: string): RubricDslParseResult {
  let payload: unknown

  try {
    payload = JSON.parse(source)
  } catch {
    return {
      ok: false,
      errors: ['invalid JSON syntax in rubric DSL'],
    }
  }

  if (!isRecord(payload)) {
    return {
      ok: false,
      errors: ['rubric DSL root must be an object'],
    }
  }

  const structureErrors: string[] = []

  const id = typeof payload.id === 'string' ? payload.id : ''
  if (typeof payload.id !== 'string') {
    structureErrors.push('id must be a string')
  }

  const version = typeof payload.version === 'number' ? payload.version : 0
  if (typeof payload.version !== 'number') {
    structureErrors.push('version must be a number')
  }

  const name = typeof payload.name === 'string' ? payload.name : ''
  if (typeof payload.name !== 'string') {
    structureErrors.push('name must be a string')
  }

  const passCondition = typeof payload.passCondition === 'string' ? payload.passCondition : ''
  if (typeof payload.passCondition !== 'string') {
    structureErrors.push('passCondition must be a string')
  }

  const retryPolicyRaw = isRecord(payload.retryPolicy) ? payload.retryPolicy : {}
  if (!isRecord(payload.retryPolicy)) {
    structureErrors.push('retryPolicy must be an object')
  }
  const maxRepairRounds =
    typeof retryPolicyRaw.maxRepairRounds === 'number' ? retryPolicyRaw.maxRepairRounds : -1
  if (typeof retryPolicyRaw.maxRepairRounds !== 'number') {
    structureErrors.push('retryPolicy.maxRepairRounds must be a number')
  }

  const rulesRaw = Array.isArray(payload.rules) ? payload.rules : []
  if (!Array.isArray(payload.rules)) {
    structureErrors.push('rules must be an array')
  }

  const rules: RubricRule[] = []
  for (let i = 0; i < rulesRaw.length; i++) {
    const rawRule = rulesRaw[i]
    if (!isRecord(rawRule)) {
      structureErrors.push(`rules[${i}] must be an object`)
      continue
    }

    rules.push({
      id: typeof rawRule.id === 'string' ? rawRule.id : '',
      checker: typeof rawRule.checker === 'string' ? rawRule.checker : '',
      params: isRecord(rawRule.params) ? rawRule.params : {},
      weight: typeof rawRule.weight === 'number' ? rawRule.weight : -1,
      threshold: normalizeThreshold(rawRule.threshold),
      failAction: typeof rawRule.failAction === 'string' ? (rawRule.failAction as RuleFailAction) : 'stop',
      severity: typeof rawRule.severity === 'string' ? (rawRule.severity as RuleSeverity) : 'low',
    })
  }

  const rubric: RubricDefinition = {
    id,
    version,
    name,
    passCondition,
    retryPolicy: {
      maxRepairRounds,
    },
    rules,
  }

  const validation = validateRubricDefinition(rubric)
  const errors = [...structureErrors, ...validation.errors]
  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    }
  }

  return {
    ok: true,
    rubric,
  }
}
