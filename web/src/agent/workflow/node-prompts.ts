import type { ConditionConfig, WorkflowNodeKind } from './types'

const kindInstructions: Record<WorkflowNodeKind, string> = {
  plan: '请根据以下输入制定详细的大纲。大纲应条理清晰、层次分明，为后续创作提供完整框架。',
  produce: '请根据以下大纲创作内容。创作应紧扣大纲要点，语言流畅，结构完整。',
  review:
    '请评审以下内容并给出评分。请以 JSON 格式返回评审结果，包含以下字段：\n- "score": 总体评分 (0-100)\n- "passed": 是否通过 (boolean)\n- "issues": 发现的问题列表\n- "suggestions": 改进建议列表\n\n示例格式：\n```json\n{"score": 85, "passed": true, "issues": [], "suggestions": ["可以增加更多细节描写"]}\n```',
  repair: '请根据评审意见修复以下内容中的问题。修复后保持原有风格和结构，仅针对指出的不足进行改进。',
  assemble: '请整合以下素材，输出最终版本。最终版本应融合所有输入的优点，保持一致的风格和完整的结构。',
  condition: '请根据以下输入判断条件分支。返回格式：\n```json\n{"branch": "分支名称", "reason": "选择原因"}\n```',
}

export function getDefaultNodeInstruction(kind: WorkflowNodeKind): string {
  return kindInstructions[kind]
}

const roleLabel: Record<string, string> = {
  plot_planner: '剧情规划师',
  chapter_writer: '章节写手',
  style_reviewer: '风格审稿人',
  campaign_planner: '营销策划师',
  script_writer: '脚本写手',
  video_script_reviewer: '视频脚本审稿人',
  script_packager: '脚本打包师',
  lesson_planner: '课程规划师',
  educator_writer: '教案撰写人',
  pedagogy_reviewer: '教学法审稿人',
}

/**
 * Build instruction text for condition node based on its configuration.
 */
function buildConditionInstruction(config: ConditionConfig): string {
  const modeDesc = config.mode === 'rule'
    ? '根据以下规则条件选择分支：'
    : '根据以下描述选择最合适的分支：'

  const branchLines = config.branches.map((branch) => {
    if (config.mode === 'rule') {
      return `  - "${branch.label}": 条件 ${branch.condition || '(fallback)'}`
    }
    return `  - "${branch.label}": ${branch.description || '(无描述)'}`
  })

  const customPrompt = config.prompt ? `\n\n判断提示：${config.prompt}` : ''
  const fallbackNote = config.fallbackBranch
    ? `\n如果没有匹配的分支，请选择 "${config.fallbackBranch}"。`
    : ''

  return `${modeDesc}
${branchLines.join('\n')}
${fallbackNote}
${customPrompt}

请以 JSON 格式返回选择的分支：
\`\`\`json
{"branch": "分支名称", "reason": "选择原因"}
\`\`\``
}

export function buildNodeSystemPrompt(
  kind: WorkflowNodeKind,
  agentRole: string,
  taskInstruction?: string,
  conditionConfig?: ConditionConfig,
): string {
  const label = roleLabel[agentRole] || agentRole
  const customInstruction = taskInstruction?.trim()

  let instruction: string
  if (customInstruction) {
    instruction = customInstruction
  } else if (kind === 'condition' && conditionConfig) {
    instruction = buildConditionInstruction(conditionConfig)
  } else {
    instruction = getDefaultNodeInstruction(kind)
  }

  return `你是一个${label}。${instruction}`
}

/**
 * Build the user message for a workflow node, incorporating upstream inputs.
 */
export function buildNodeUserMessage(
  inputs: Map<string, unknown>,
): string {
  if (inputs.size === 0) {
    return '请开始工作。'
  }

  const parts: string[] = ['以下是上游节点的输出：\n']
  for (const [key, content] of inputs) {
    const contentStr =
      typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    parts.push(`--- ${key} ---\n${contentStr}\n`)
  }
  return parts.join('\n')
}
