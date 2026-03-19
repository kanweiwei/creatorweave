export function buildSnapshotSummaryPrompt(
  changeCount: number,
  changesText: string,
  diffSections: string[]
): string {
  return [
    'Generate a commit message for the following changes.',
    '要求：',
    '1) 输出完整 message，可多行',
    '2) 第一行是简短 subject（建议 72 字符内）',
    '3) 后续是 body，2-6 行，描述关键改动点',
    '4) 语言不限，按变更语境选择中英文',
    '5) 不要解释你自己，不要代码块',
    '6) 直接输出 message 本体，不要 SUBJECT:/BODY: 标签',
    '示例（仅风格参考）：',
    'Refactor snapshot rollback flow',
    '',
    '- Track before/after file states for each approved change',
    '- Improve snapshot switch reliability with compensation logic',
    '',
    `变更数：${changeCount}`,
    changesText,
    '',
    ...(diffSections.length > 0
      ? ['关键 diff：', diffSections.join('\n\n')]
      : ['关键 diff：', '[diff unavailable; summarize based on file list]']),
  ].join('\n')
}
