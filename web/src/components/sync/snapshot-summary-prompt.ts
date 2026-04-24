export function buildSnapshotSummaryPrompt(
  changeCount: number,
  changesText: string,
  diffSections: string[]
): string {
  return [
    'Generate a commit message for the following changes.',
    'Requirements:',
    '1) MUST follow Conventional Commits format: type: description',
    '2) First line MUST start with one of: feat, fix, docs, style, refactor, perf, test, chore, ci, build',
    '3) First line subject (type + description) recommended under 72 characters',
    '4) Following is body, 2-6 lines, describing key changes',
    '5) Language is flexible, choose Chinese or English based on context',
    '6) Do not explain yourself, no code blocks',
    '7) Output message directly, no SUBJECT:/BODY: prefixes',
    'Examples (style reference only):',
    'feat: add snapshot rollback flow',
    '',
    '- Track before/after file states for each approved change',
    '- Improve snapshot switch reliability with compensation logic',
    '',
    'fix: resolve pagination offset error',
    'refactor: extract diff viewer component',
    'docs: update API reference for sync module',
    '',
    `Change count: ${changeCount}`,
    changesText,
    '',
    ...(diffSections.length > 0
      ? ['Key diff:', diffSections.join('\n\n')]
      : ['Key diff:', '[diff unavailable; summarize based on file list]']),
  ].join('\n')
}
