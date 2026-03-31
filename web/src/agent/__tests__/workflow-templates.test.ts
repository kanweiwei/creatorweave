import { describe, expect, it } from 'vitest'
import {
  defaultEducationLessonRubric,
  defaultEducationLessonWorkflow,
  defaultNovelDailyRubric,
  defaultNovelDailyWorkflow,
  defaultShortVideoRubric,
  defaultShortVideoWorkflow,
  getWorkflowTemplateBundle,
  listWorkflowTemplateBundles,
} from '../workflow/templates'
import { createWorkflowRunPlan } from '../workflow/workflow-runner'

describe('workflow templates', () => {
  it('default novel daily bundle is runnable', () => {
    const result = createWorkflowRunPlan(defaultNovelDailyWorkflow, defaultNovelDailyRubric)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.executionOrder).toEqual(['plan', 'produce', 'review'])
    expect(result.initialRunState.maxRepairRounds).toBe(2)
  })

  it('returns template bundle by id', () => {
    const bundle = getWorkflowTemplateBundle('novel_daily_v1')
    expect(bundle).toBeDefined()
    expect(bundle?.workflow.id).toBe('novel_daily_v1')
    expect(bundle?.rubric.id).toBe('novel_daily_v1')
  })

  it('new cross-domain bundles are runnable', () => {
    const shortVideo = createWorkflowRunPlan(defaultShortVideoWorkflow, defaultShortVideoRubric)
    expect(shortVideo.ok).toBe(true)
    if (!shortVideo.ok) return
    expect(shortVideo.executionOrder).toEqual(['plan', 'produce', 'review', 'assemble'])

    const lesson = createWorkflowRunPlan(defaultEducationLessonWorkflow, defaultEducationLessonRubric)
    expect(lesson.ok).toBe(true)
    if (!lesson.ok) return
    expect(lesson.executionOrder).toEqual(['plan', 'produce', 'review'])
  })

  it('lists all built-in template bundles', () => {
    const bundles = listWorkflowTemplateBundles()
    expect(bundles.map((bundle) => bundle.id)).toEqual([
      'novel_daily_v1',
      'short_video_script_v1',
      'education_lesson_note_v1',
    ])
  })

  it('returns undefined for unknown template id', () => {
    const bundle = getWorkflowTemplateBundle('unknown_template')
    expect(bundle).toBeUndefined()
  })
})
