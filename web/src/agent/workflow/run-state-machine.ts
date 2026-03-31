export type WorkflowRunStatus = 'queued' | 'running' | 'needs_human' | 'passed' | 'failed'

export interface WorkflowRunState {
  status: WorkflowRunStatus
  repairRound: number
  maxRepairRounds: number
  manualInterventions: number
  lastError?: string
  currentIteration: number
}

export type WorkflowRunEvent =
  | { type: 'start' }
  | { type: 'review_failed' }
  | { type: 'all_nodes_passed' }
  | { type: 'human_retry' }
  | { type: 'human_approve' }
  | { type: 'human_reject'; reason?: string }
  | { type: 'fatal_error'; reason: string }
  | { type: 'loop_iteration' }
  | { type: 'loop_timeout'; reason: string }

export function createWorkflowRunState(maxRepairRounds = 2, repairRound = 0): WorkflowRunState {
  return {
    status: 'queued',
    repairRound,
    maxRepairRounds,
    manualInterventions: 0,
    currentIteration: 0,
  }
}

function invalidTransition(state: WorkflowRunState, event: WorkflowRunEvent): never {
  throw new Error(`invalid transition: ${state.status} -> ${event.type}`)
}

export function transitionWorkflowRunState(
  state: WorkflowRunState,
  event: WorkflowRunEvent
): WorkflowRunState {
  // Handle terminal events that can occur from any state
  if (event.type === 'fatal_error') {
    return {
      ...state,
      status: 'failed',
      lastError: event.reason,
    }
  }

  if (event.type === 'loop_timeout') {
    return {
      ...state,
      status: 'needs_human',
      lastError: event.reason,
    }
  }

  switch (state.status) {
    case 'queued': {
      if (event.type === 'start') {
        return {
          ...state,
          status: 'running',
        }
      }
      return invalidTransition(state, event)
    }
    case 'running': {
      if (event.type === 'all_nodes_passed') {
        return {
          ...state,
          status: 'passed',
        }
      }

      if (event.type === 'review_failed') {
        if (state.repairRound < state.maxRepairRounds) {
          return {
            ...state,
            status: 'running',
            repairRound: state.repairRound + 1,
          }
        }

        return {
          ...state,
          status: 'needs_human',
        }
      }

      if (event.type === 'loop_iteration') {
        return {
          ...state,
          status: 'running',
          currentIteration: state.currentIteration + 1,
        }
      }

      return invalidTransition(state, event)
    }
    case 'needs_human': {
      if (event.type === 'human_retry') {
        return {
          ...state,
          status: 'running',
          repairRound: 0,
          currentIteration: 0,
          manualInterventions: state.manualInterventions + 1,
          lastError: undefined,
        }
      }

      if (event.type === 'human_approve') {
        return {
          ...state,
          status: 'passed',
        }
      }

      if (event.type === 'human_reject') {
        return {
          ...state,
          status: 'failed',
          lastError: event.reason,
        }
      }

      return invalidTransition(state, event)
    }
    case 'passed':
    case 'failed': {
      return invalidTransition(state, event)
    }
    default: {
      return invalidTransition(state, event)
    }
  }
}
