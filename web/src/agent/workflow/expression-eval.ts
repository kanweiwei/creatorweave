/**
 * Expression Evaluator for workflow condition nodes.
 * Supports comparisons like ${var} >= 80 and boolean combinations with AND/OR.
 */

export interface ExpressionContext {
  [variableName: string]: unknown
}

const COMPARISON_RE = /^\s*\$\{([^}]+)\}\s*(>=|<=|>|<|==|!=)\s*(.+?)\s*$/

function resolveVariable(name: string, ctx: ExpressionContext): unknown {
  // Handle nested property access like "initialValue.score"
  const parts = name.split('.')
  let value: unknown = ctx[parts[0]]

  for (let i = 1; i < parts.length && value !== undefined && value !== null; i++) {
    if (typeof value === 'object') {
      value = (value as Record<string, unknown>)[parts[i]]
    } else {
      return undefined
    }
  }

  return value
}

function parseLiteral(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  // Handle quoted strings
  if (/^".*"$/.test(trimmed) || /^'.*'$/.test(trimmed)) return trimmed.slice(1, -1)
  return trimmed
}

function compare(left: unknown, operator: string, right: unknown): boolean {
  // Try numeric comparison first
  const lNum = typeof left === 'number' ? left : Number(left)
  const rNum = typeof right === 'number' ? right : Number(right)

  if (!Number.isNaN(lNum) && !Number.isNaN(rNum)) {
    switch (operator) {
      case '>=':
        return lNum >= rNum
      case '<=':
        return lNum <= rNum
      case '>':
        return lNum > rNum
      case '<':
        return lNum < rNum
      case '==':
        return lNum === rNum
      case '!=':
        return lNum !== rNum
    }
  }

  // Fall back to string comparison
  const lStr = String(left)
  const rStr = String(right)
  switch (operator) {
    case '==':
      return lStr === rStr
    case '!=':
      return lStr !== rStr
    default:
      return false
  }
}

function evaluateComparison(expr: string, ctx: ExpressionContext): boolean {
  const match = expr.match(COMPARISON_RE)
  if (!match) return false

  const [, varName, operator, rawRight] = match
  const left = resolveVariable(varName, ctx)
  if (left === undefined) return false

  const right = parseLiteral(rawRight)
  return compare(left, operator, right)
}

/**
 * Tokenize expression into parts, respecting parentheses
 */
function tokenize(expr: string): string[] {
  const tokens: string[] = []
  let current = ''
  let parenDepth = 0

  for (let i = 0; i < expr.length; i++) {
    const char = expr[i]

    if (char === '(') {
      parenDepth++
      current += char
    } else if (char === ')') {
      parenDepth--
      current += char
    } else if (parenDepth === 0) {
      // Check for AND or OR at top level (must be surrounded by whitespace or at boundaries)
      const remaining = expr.slice(i)
      const andMatch = remaining.match(/^(AND)\s+/i)
      const orMatch = remaining.match(/^(OR)\s+/i)

      if (andMatch || orMatch) {
        const match = andMatch || orMatch!
        if (current.trim()) {
          tokens.push(current.trim())
        }
        tokens.push(match[1].toUpperCase())
        i += match[0].length - 1
        current = ''
      } else {
        current += char
      }
    } else {
      current += char
    }
  }

  if (current.trim()) {
    tokens.push(current.trim())
  }

  return tokens
}

/**
 * Evaluate a condition expression against a context.
 *
 * @param expression - The expression to evaluate (e.g., "${review.score} >= 80")
 * @param ctx - Context object with variable values
 * @returns boolean result of the evaluation
 *
 * @example
 * evaluateExpression('${score} >= 80', { score: 85 }) // true
 * evaluateExpression('${passed} == true', { passed: false }) // false
 */
export function evaluateExpression(expression: string, ctx: ExpressionContext): boolean {
  const trimmed = expression.trim()
  if (!trimmed) return false

  // Handle 'true' literal
  if (trimmed === 'true') return true

  // Handle parentheses by removing outer parens if they wrap the entire expression
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    // Check if the parens are balanced and wrap the whole thing
    let depth = 0
    let isWrapping = true
    for (let i = 0; i < trimmed.length - 1; i++) {
      if (trimmed[i] === '(') depth++
      else if (trimmed[i] === ')') depth--
      if (depth === 0) {
        isWrapping = false
        break
      }
    }
    if (isWrapping) {
      return evaluateExpression(trimmed.slice(1, -1), ctx)
    }
  }

  // Tokenize and evaluate
  const tokens = tokenize(trimmed)

  if (tokens.length === 1) {
    return evaluateComparison(tokens[0], ctx)
  }

  // Evaluate with operator precedence: AND before OR
  // First pass: evaluate all ANDs
  const evaluated: (boolean | 'AND' | 'OR')[] = []
  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]
    if (token === 'AND') {
      const left = evaluated.pop() as boolean
      const right = evaluateExpression(tokens[i + 1], ctx)
      evaluated.push(left && right)
      i += 2
    } else if (token === 'OR') {
      evaluated.push('OR')
      i++
    } else {
      evaluated.push(evaluateExpression(token, ctx))
      i++
    }
  }

  // Second pass: evaluate ORs
  let result = evaluated[0] as boolean
  for (let j = 1; j < evaluated.length; j += 2) {
    const op = evaluated[j]
    const right = evaluated[j + 1] as boolean
    if (op === 'OR') {
      result = result || right
    }
  }

  return result
}
