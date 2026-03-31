import type { RubricDefinition } from './rubric'
import type { WorkflowTemplate } from './types'

export interface WorkflowTemplateBundle {
  id: string
  label: string
  workflow: WorkflowTemplate
  rubric: RubricDefinition
}

export const defaultNovelDailyWorkflow: WorkflowTemplate = {
  id: 'novel_daily_v1',
  name: '小说日更工作流',
  domain: 'novel',
  entryNodeId: 'plan',
  nodes: [
    {
      id: 'plan',
      kind: 'plan',
      agentRole: 'plot_planner',
      inputRefs: [],
      outputKey: 'outline',
      retryPolicy: { maxRetries: 1, timeoutMs: 15000 },
    },
    {
      id: 'produce',
      kind: 'produce',
      agentRole: 'chapter_writer',
      inputRefs: ['outline'],
      outputKey: 'draft',
      retryPolicy: { maxRetries: 1, timeoutMs: 30000 },
    },
    {
      id: 'review',
      kind: 'review',
      agentRole: 'style_reviewer',
      inputRefs: ['draft'],
      outputKey: 'review_report',
      retryPolicy: { maxRetries: 1, timeoutMs: 20000 },
    },
  ],
  edges: [
    { from: 'plan', to: 'produce' },
    { from: 'produce', to: 'review' },
  ],
}

export const defaultNovelDailyRubric: RubricDefinition = {
  id: 'novel_daily_v1',
  version: 1,
  name: '小说日更评分规则',
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
      weight: 0.3,
      threshold: {
        violationRateLte: 0.05,
      },
      failAction: 'auto_repair',
      severity: 'high',
    },
    {
      id: 'dialogue_policy',
      checker: 'dialogue_paragraph_policy',
      params: {
        allowSingle: true,
      },
      weight: 0.15,
      threshold: {
        passEq: true,
      },
      failAction: 'auto_repair',
      severity: 'medium',
    },
  ],
}

export const defaultShortVideoWorkflow: WorkflowTemplate = {
  id: 'short_video_script_v1',
  name: '短视频脚本工作流',
  domain: 'marketing',
  entryNodeId: 'plan',
  nodes: [
    {
      id: 'plan',
      kind: 'plan',
      agentRole: 'campaign_planner',
      inputRefs: [],
      outputKey: 'creative_brief',
      retryPolicy: { maxRetries: 1, timeoutMs: 15000 },
    },
    {
      id: 'produce',
      kind: 'produce',
      agentRole: 'script_writer',
      inputRefs: ['creative_brief'],
      outputKey: 'script_draft',
      retryPolicy: { maxRetries: 1, timeoutMs: 25000 },
    },
    {
      id: 'review',
      kind: 'review',
      agentRole: 'video_script_reviewer',
      inputRefs: ['script_draft'],
      outputKey: 'review_report',
      retryPolicy: { maxRetries: 1, timeoutMs: 20000 },
    },
    {
      id: 'assemble',
      kind: 'assemble',
      agentRole: 'script_packager',
      inputRefs: ['script_draft', 'review_report'],
      outputKey: 'final_script_package',
      retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
    },
  ],
  edges: [
    { from: 'plan', to: 'produce' },
    { from: 'produce', to: 'review' },
    { from: 'review', to: 'assemble' },
  ],
}

export const defaultShortVideoRubric: RubricDefinition = {
  id: 'short_video_script_v1',
  version: 1,
  name: '短视频脚本评分规则',
  passCondition: 'total_score >= 82 and hard_fail_count == 0',
  retryPolicy: {
    maxRepairRounds: 2,
  },
  rules: [
    {
      id: 'opening_hook',
      checker: 'opening_hook_presence',
      params: {
        windowSeconds: 3,
      },
      weight: 0.25,
      threshold: {
        passEq: true,
      },
      failAction: 'auto_repair',
      severity: 'high',
    },
    {
      id: 'cta_alignment',
      checker: 'call_to_action_alignment',
      params: {
        required: true,
      },
      weight: 0.2,
      threshold: {
        passEq: true,
      },
      failAction: 'auto_repair',
      severity: 'medium',
    },
  ],
}

export const defaultEducationLessonWorkflow: WorkflowTemplate = {
  id: 'education_lesson_note_v1',
  name: '教案笔记工作流',
  domain: 'education',
  entryNodeId: 'plan',
  nodes: [
    {
      id: 'plan',
      kind: 'plan',
      agentRole: 'lesson_planner',
      inputRefs: [],
      outputKey: 'lesson_outline',
      retryPolicy: { maxRetries: 1, timeoutMs: 15000 },
    },
    {
      id: 'produce',
      kind: 'produce',
      agentRole: 'educator_writer',
      inputRefs: ['lesson_outline'],
      outputKey: 'lesson_note_draft',
      retryPolicy: { maxRetries: 1, timeoutMs: 25000 },
    },
    {
      id: 'review',
      kind: 'review',
      agentRole: 'pedagogy_reviewer',
      inputRefs: ['lesson_note_draft'],
      outputKey: 'review_report',
      retryPolicy: { maxRetries: 1, timeoutMs: 20000 },
    },
  ],
  edges: [
    { from: 'plan', to: 'produce' },
    { from: 'produce', to: 'review' },
  ],
}

export const defaultEducationLessonRubric: RubricDefinition = {
  id: 'education_lesson_note_v1',
  version: 1,
  name: '教案笔记评分规则',
  passCondition: 'total_score >= 80 and hard_fail_count == 0',
  retryPolicy: {
    maxRepairRounds: 1,
  },
  rules: [
    {
      id: 'learning_objective_clarity',
      checker: 'learning_objective_coverage',
      params: {
        requireActionVerb: true,
      },
      weight: 0.25,
      threshold: {
        passEq: true,
      },
      failAction: 'auto_repair',
      severity: 'high',
    },
    {
      id: 'exposition_paragraph_len',
      checker: 'paragraph_sentence_count',
      params: {
        target: 'exposition',
        min: 3,
        max: 6,
      },
      weight: 0.2,
      threshold: {
        violationRateLte: 0.08,
      },
      failAction: 'auto_repair',
      severity: 'medium',
    },
  ],
}

export const defaultConditionalQualityLoopWorkflow: WorkflowTemplate = {
  id: 'conditional_quality_loop_v1',
  name: '质量循环工作流',
  domain: 'generic',
  entryNodeId: 'plan',
  nodes: [
    {
      id: 'plan',
      kind: 'plan',
      agentRole: 'planner',
      inputRefs: [],
      outputKey: 'outline',
      retryPolicy: { maxRetries: 1, timeoutMs: 15000 },
    },
    {
      id: 'produce',
      kind: 'produce',
      agentRole: 'writer',
      inputRefs: ['outline'],
      outputKey: 'draft',
      retryPolicy: { maxRetries: 1, timeoutMs: 30000 },
    },
    {
      id: 'review',
      kind: 'review',
      agentRole: 'reviewer',
      inputRefs: ['draft'],
      outputKey: 'review_report',
      retryPolicy: { maxRetries: 1, timeoutMs: 20000 },
    },
    {
      id: 'quality_gate',
      kind: 'condition',
      agentRole: 'quality_router',
      inputRefs: ['review_report'],
      outputKey: 'decision',
      retryPolicy: { maxRetries: 0, timeoutMs: 5000 },
      conditionConfig: {
        mode: 'rule',
        branches: [
          { label: 'pass', condition: '${review_report.score} >= 80' },
          { label: 'fail', condition: 'true' },
        ],
        fallbackBranch: 'fail',
      },
    },
    {
      id: 'assemble',
      kind: 'assemble',
      agentRole: 'packager',
      inputRefs: ['draft', 'review_report'],
      outputKey: 'final_output',
      retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
    },
  ],
  edges: [
    { from: 'plan', to: 'produce' },
    { from: 'produce', to: 'review' },
    { from: 'review', to: 'quality_gate' },
    { from: 'quality_gate', to: 'assemble', branch: 'pass' },
    {
      from: 'quality_gate',
      to: 'produce',
      branch: 'fail',
      loopPolicy: {
        maxIterations: 3,
        exitCondition: '${review_report.score} >= 80',
        accumulateHistory: true,
      },
    },
  ],
}

export const defaultConditionalQualityLoopRubric: RubricDefinition = {
  id: 'conditional_quality_loop_v1',
  version: 1,
  name: '质量循环评分规则',
  passCondition: 'total_score >= 80 and hard_fail_count == 0',
  retryPolicy: {
    maxRepairRounds: 2,
  },
  rules: [
    {
      id: 'quality_check',
      checker: 'quality_score',
      params: {
        minScore: 80,
      },
      weight: 1.0,
      threshold: {
        passEq: true,
      },
      failAction: 'auto_repair',
      severity: 'high',
    },
  ],
}

const templateBundles: WorkflowTemplateBundle[] = [
  {
    id: 'novel_daily_v1',
    label: '小说日更',
    workflow: defaultNovelDailyWorkflow,
    rubric: defaultNovelDailyRubric,
  },
  {
    id: 'short_video_script_v1',
    label: '短视频脚本',
    workflow: defaultShortVideoWorkflow,
    rubric: defaultShortVideoRubric,
  },
  {
    id: 'education_lesson_note_v1',
    label: '教案笔记',
    workflow: defaultEducationLessonWorkflow,
    rubric: defaultEducationLessonRubric,
  },
  {
    id: 'conditional_quality_loop_v1',
    label: '质量循环',
    workflow: defaultConditionalQualityLoopWorkflow,
    rubric: defaultConditionalQualityLoopRubric,
  },
]

export function getWorkflowTemplateBundle(id: string): WorkflowTemplateBundle | undefined {
  return templateBundles.find((bundle) => bundle.id === id)
}

export function listWorkflowTemplateBundles(): WorkflowTemplateBundle[] {
  return templateBundles.slice()
}
