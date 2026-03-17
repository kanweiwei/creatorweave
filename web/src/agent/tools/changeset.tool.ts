import type { ToolDefinition, ToolExecutor } from './tool-types'
import { getActiveWorkspace, useWorkspaceStore } from '@/store/workspace.store'

export const commitChangesDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'checkpoint',
    description:
      'Save a draft checkpoint for current file changes. ' +
      'Use this as a review point before syncing files to disk. ' +
      'Important: this does NOT sync changes to native disk.',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Optional short note describing this checkpoint',
        },
      },
    },
  },
}

export const commitChangesExecutor: ToolExecutor = async (args) => {
  const summary = args.summary as string | undefined
  const active = await getActiveWorkspace()
  if (!active) {
    return JSON.stringify({ error: 'No active workspace' })
  }

  const result = await active.workspace.commitDraftChangeset(summary)
  await useWorkspaceStore.getState().updateCurrentCounts()
  await useWorkspaceStore.getState().refreshPendingChanges(true)

  if (!result) {
    return JSON.stringify({
      success: true,
      committed: false,
      message: 'No draft changes to save as checkpoint.',
    })
  }

  return JSON.stringify({
    success: true,
    committed: true,
    changesetId: result.changesetId,
    opCount: result.opCount,
    message: `Saved checkpoint ${result.changesetId} (${result.opCount} change(s)).`,
  })
}

export const rollbackChangesetDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'revert_checkpoint',
    description:
      'Revert pending file changes from a checkpoint. ' +
      'New files from that checkpoint are removed from workspace. ' +
      'Modified/deleted existing files may require a directory handle to restore from disk.',
    parameters: {
      type: 'object',
      properties: {
        checkpoint_id: {
          type: 'string',
          description: 'Checkpoint id to revert',
        },
      },
      required: ['checkpoint_id'],
    },
  },
}

export const rollbackChangesetExecutor: ToolExecutor = async (args, context) => {
  const changesetId = args.checkpoint_id as string | undefined
  if (!changesetId) {
    return JSON.stringify({ error: 'checkpoint_id is required' })
  }

  const active = await getActiveWorkspace()
  if (!active) {
    return JSON.stringify({ error: 'No active workspace' })
  }

  const result = await active.workspace.rollbackChangeset(changesetId, context.directoryHandle)
  await useWorkspaceStore.getState().updateCurrentCounts()
  await useWorkspaceStore.getState().refreshPendingChanges(true)
  const hasUnresolved = result.unresolved.length > 0

  return JSON.stringify({
    success: !hasUnresolved,
    reverted: result.reverted,
    unresolved: result.unresolved,
    hint:
      hasUnresolved && !context.directoryHandle
        ? '当前未连接本机目录，无法恢复已存在文件；请先选择目录后重试。'
        : hasUnresolved
          ? '部分文件在当前目录中不存在，无法自动恢复，请手动处理。'
          : undefined,
    message:
      !hasUnresolved
        ? `Reverted ${result.reverted} change(s) from checkpoint ${changesetId}.`
        : `Reverted ${result.reverted} change(s), ${result.unresolved.length} unresolved.`,
  })
}
