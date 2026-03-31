import { getAvailableWorkflowCatalog, type WorkflowCatalogEntry } from './workflow-catalog'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function renderWorkflow(entry: WorkflowCatalogEntry): string {
  const inputLines =
    entry.inputs.length === 0
      ? '    <inputs />\n'
      : `    <inputs>\n${entry.inputs
          .map(
            (field) =>
              `      <input name="${escapeXml(field.name)}" required="${field.required ? 'true' : 'false'}">${escapeXml(field.description)}</input>`
          )
          .join('\n')}\n    </inputs>\n`

  const outputLines =
    entry.outputs.length === 0
      ? '    <outputs />\n'
      : `    <outputs>\n${entry.outputs
          .map(
            (field) =>
              `      <output name="${escapeXml(field.name)}">${escapeXml(field.description)}</output>`
          )
          .join('\n')}\n    </outputs>\n`

  return (
    `  <workflow id="${escapeXml(entry.id)}" label="${escapeXml(entry.label)}" default_mode="${entry.defaultMode}">\n` +
    `    <when_to_use>${escapeXml(entry.whenToUse)}</when_to_use>\n` +
    `    <real_run_confirmation_required>${entry.requireConfirmationForRealRun ? 'true' : 'false'}</real_run_confirmation_required>\n` +
    `    <real_run_cost_hint>${escapeXml(entry.estimatedRealRunCostHint)}</real_run_cost_hint>\n` +
    inputLines +
    outputLines +
    '  </workflow>\n'
  )
}

export function buildAvailableWorkflowsBlock(): string {
  const workflows = getAvailableWorkflowCatalog()
  if (workflows.length === 0) return ''

  const rendered = workflows.map((entry) => renderWorkflow(entry)).join('\n')

  return `<workflow_system priority="1">

## Available Workflows

<usage>
Use the \`run_workflow\` tool when the user request matches a workflow scenario.
Rules:
- Prefer \`mode="dry_run"\` to validate flow when user is exploring or debugging.
- Use \`mode="real_run"\` only when user clearly wants real generation/execution.
- For real_run, ask for confirmation first unless user has explicitly approved execution.
- If required inputs are missing, ask follow-up questions before running.
</usage>

<available_workflows>
${rendered}</available_workflows>

</workflow_system>`
}

