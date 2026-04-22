/**
 * Built-in Skills - pre-installed skills that ship with the application.
 */

import type { Skill } from './skill-types'

const now = Date.now()

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'builtin:code-review',
    name: 'Code Review',
    version: '1.0.0',
    description: 'Systematic code review with focus on quality, security, and maintainability',
    author: 'Core Team',
    category: 'code-review',
    tags: ['review', 'quality', 'best-practices'],
    source: 'builtin',
    triggers: {
      keywords: ['review', 'code review', 'check code', 'inspect', 'audit code'],
    },
    enabled: true,
    createdAt: now,
    updatedAt: now,
    instruction: `When reviewing code, follow this systematic approach:

1. **Correctness**: Does the code do what it's supposed to?
   - Check logic flow and edge cases
   - Verify error handling completeness
   - Validate input/output contracts

2. **Security**: Are there vulnerabilities?
   - Check for injection risks (SQL, XSS, command)
   - Verify authentication/authorization
   - Look for hardcoded secrets or sensitive data exposure

3. **Maintainability**: Is the code easy to understand and modify?
   - Check naming conventions and clarity
   - Evaluate function/module responsibilities (SRP)
   - Look for code duplication

4. **Performance**: Are there obvious inefficiencies?
   - Check for N+1 queries or unnecessary iterations
   - Look for memory leaks or unbounded growth
   - Evaluate algorithmic complexity

Provide feedback in this format:
- 🔴 **Critical**: Must fix before merge
- 🟡 **Suggestion**: Recommended improvement
- 🟢 **Nitpick**: Style/preference (optional)`,
    examples: `Example review comment:
🔴 **Critical**: \`user.password\` is logged in line 45. Remove sensitive data from logs.
🟡 **Suggestion**: Consider using \`Map\` instead of nested \`Array.find()\` for O(1) lookup.
🟢 **Nitpick**: Consider renaming \`data\` to \`userProfile\` for clarity.`,
  },

  {
    id: 'builtin:debugging',
    name: 'Systematic Debugging',
    version: '1.0.0',
    description: 'Structured approach to finding and fixing bugs',
    author: 'Core Team',
    category: 'debugging',
    tags: ['debug', 'fix', 'error', 'troubleshoot'],
    source: 'builtin',
    triggers: {
      keywords: ['debug', 'bug', 'fix', 'error', 'not working', 'broken', 'crash'],
    },
    enabled: true,
    createdAt: now,
    updatedAt: now,
    instruction: `When debugging, follow this systematic approach:

1. **Reproduce**: Understand exactly how to trigger the issue
   - What input/action causes it?
   - Is it consistent or intermittent?
   - When did it start (what changed)?

2. **Isolate**: Narrow down the location
   - Use ls to find relevant code
   - Read the error message and stack trace carefully
   - Check recent git changes in the affected area

3. **Analyze**: Understand the root cause
   - Read the code path from entry to error
   - Check data flow and state at each step
   - Look for type mismatches, null references, race conditions

4. **Fix**: Apply the minimal correct fix
   - Fix the root cause, not just the symptom
   - Keep the fix focused and small
   - Consider if similar bugs exist elsewhere

5. **Verify**: Confirm the fix works
   - Test the original reproduction case
   - Check that related functionality still works
   - Consider adding a test to prevent regression`,
  },
]
