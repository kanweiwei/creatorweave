import { listWorkflowTemplateBundles } from './templates'

export interface WorkflowCatalogField {
  name: string
  description: string
  required: boolean
}

export interface WorkflowCatalogOutputField {
  name: string
  description: string
}

export interface WorkflowCatalogEntry {
  id: string
  label: string
  whenToUse: string
  defaultMode: 'dry_run' | 'real_run'
  requireConfirmationForRealRun: boolean
  estimatedRealRunCostHint: string
  inputs: WorkflowCatalogField[]
  outputs: WorkflowCatalogOutputField[]
}

interface WorkflowCatalogMetadata {
  whenToUse: string
  defaultMode?: 'dry_run' | 'real_run'
  requireConfirmationForRealRun?: boolean
  estimatedRealRunCostHint?: string
  inputs: WorkflowCatalogField[]
  outputs?: WorkflowCatalogOutputField[]
}

const WORKFLOW_CATALOG_METADATA: Record<string, WorkflowCatalogMetadata> = {
  novel_daily_v1: {
    whenToUse: '用于网文/小说章节日更，要求结构化产出并保持风格稳定。',
    defaultMode: 'real_run',
    requireConfirmationForRealRun: true,
    estimatedRealRunCostHint: '中等 token 消耗（通常 3 个节点顺序执行）',
    inputs: [
      { name: 'task_brief', description: '本章任务目标与剧情意图', required: true },
      { name: 'chapter_goal', description: '本章推进目标（冲突/反转/伏笔）', required: false },
      { name: 'style_rules', description: '风格约束（段落句数、禁忌、语气）', required: false },
      { name: 'character_state', description: '人物状态/关系更新', required: false },
    ],
    outputs: [
      { name: 'outline', description: '章节大纲' },
      { name: 'draft', description: '章节草稿' },
      { name: 'review_report', description: '评审报告' },
    ],
  },
  short_video_script_v1: {
    whenToUse: '用于短视频脚本生产，强调开场钩子、节奏和 CTA 完整性。',
    defaultMode: 'real_run',
    requireConfirmationForRealRun: true,
    estimatedRealRunCostHint: '中高 token 消耗（多节点串行 + 组装）',
    inputs: [
      { name: 'task_brief', description: '视频主题与传播目标', required: true },
      { name: 'target_audience', description: '目标受众画像', required: false },
      { name: 'platform', description: '平台（抖音/快手/B站等）', required: false },
      { name: 'cta_goal', description: '转化目标与行动指令', required: false },
    ],
    outputs: [
      { name: 'creative_brief', description: '创意摘要' },
      { name: 'script_draft', description: '脚本草稿' },
      { name: 'review_report', description: '评审报告' },
      { name: 'final_script_package', description: '最终脚本包' },
    ],
  },
  education_lesson_note_v1: {
    whenToUse: '用于教学场景的教案与授课笔记撰写，强调目标与教学法一致性。',
    defaultMode: 'real_run',
    requireConfirmationForRealRun: true,
    estimatedRealRunCostHint: '中等 token 消耗（3 节点串行）',
    inputs: [
      { name: 'task_brief', description: '课程主题与教学目标', required: true },
      { name: 'grade_level', description: '年级/学段', required: false },
      { name: 'lesson_duration', description: '课时长度', required: false },
      { name: 'teaching_constraints', description: '教学限制（时间/资源/形式）', required: false },
    ],
    outputs: [
      { name: 'lesson_outline', description: '教案大纲' },
      { name: 'lesson_note_draft', description: '教案草稿' },
      { name: 'review_report', description: '评审报告' },
    ],
  },
}

function fallbackOutputs(workflowId: string): WorkflowCatalogOutputField[] {
  const bundle = listWorkflowTemplateBundles().find((item) => item.id === workflowId)
  if (!bundle) return []
  return bundle.workflow.nodes.map((node) => ({
    name: node.outputKey,
    description: `${node.kind} 节点输出`,
  }))
}

function toCatalogEntry(workflowId: string, label: string): WorkflowCatalogEntry {
  const metadata = WORKFLOW_CATALOG_METADATA[workflowId]
  return {
    id: workflowId,
    label,
    whenToUse: metadata?.whenToUse || '用于结构化内容生产流程。',
    defaultMode: metadata?.defaultMode || 'dry_run',
    requireConfirmationForRealRun: metadata?.requireConfirmationForRealRun ?? true,
    estimatedRealRunCostHint: metadata?.estimatedRealRunCostHint || '可能消耗较多 token',
    inputs: metadata?.inputs || [],
    outputs: metadata?.outputs || fallbackOutputs(workflowId),
  }
}

export function getAvailableWorkflowCatalog(): WorkflowCatalogEntry[] {
  return listWorkflowTemplateBundles().map((bundle) => toCatalogEntry(bundle.id, bundle.label))
}

export function getWorkflowCatalogEntry(templateId: string): WorkflowCatalogEntry | undefined {
  return getAvailableWorkflowCatalog().find((entry) => entry.id === templateId)
}

