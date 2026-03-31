import { validateWorkflowDag } from './dag-validator'
import { createWorkflowRunState, type WorkflowRunState } from './run-state-machine'
import { validateRubricDefinition, type RubricDefinition } from './rubric'
import type { WorkflowTemplate } from './types'

export type WorkflowRunPlanResult =
  | {
      ok: true
      executionOrder: string[]
      initialRunState: WorkflowRunState
    }
  | {
      ok: false
      errors: string[]
    }

export function createWorkflowRunPlan(
  workflow: WorkflowTemplate,
  rubric: RubricDefinition
): WorkflowRunPlanResult {
  const dagValidation = validateWorkflowDag(workflow)
  const rubricValidation = validateRubricDefinition(rubric)

  if (!dagValidation.valid || !rubricValidation.valid) {
    return {
      ok: false,
      errors: [...dagValidation.errors, ...rubricValidation.errors],
    }
  }

  return {
    ok: true,
    executionOrder: dagValidation.executionOrder,
    initialRunState: createWorkflowRunState(rubric.retryPolicy.maxRepairRounds, 0),
  }
}
