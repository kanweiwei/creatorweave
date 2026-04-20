import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Skill, SkillResource } from '../skill-types'
import { SkillManager } from '../skill-manager'
import { scanProjectSkills } from '../skill-scanner'
import * as storage from '../skill-storage'

vi.mock('../skill-storage', () => ({
  getSkillById: vi.fn(),
  saveSkill: vi.fn(),
  deleteSkillResources: vi.fn(),
  saveSkillResource: vi.fn(),
  getAllSkills: vi.fn().mockResolvedValue([]),
}))

vi.mock('../skill-scanner', () => ({
  scanProjectSkills: vi.fn(),
}))

describe('SkillManager.scanProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists scanned resources that already have skillId assigned', async () => {
    const skills: Skill[] = [
      {
        id: 'project:.skills/skill-a',
        name: 'skill-a',
        version: '1.0.0',
        description: '',
        author: 'test',
        category: 'general',
        tags: [],
        source: 'project',
        triggers: { keywords: ['a'] },
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
        instruction: 'A',
      },
      {
        id: 'project:.skills/skill-b',
        name: 'skill-b',
        version: '1.0.0',
        description: '',
        author: 'test',
        category: 'general',
        tags: [],
        source: 'project',
        triggers: { keywords: ['b'] },
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
        instruction: 'B',
      },
    ]

    const resources: SkillResource[] = [
      {
        id: 'project:.skills/skill-a:references/a.md',
        skillId: 'project:.skills/skill-a',
        resourcePath: 'references/a.md',
        resourceType: 'reference',
        content: 'a',
        contentType: 'text/markdown',
        size: 1,
        createdAt: 1,
      },
      {
        id: 'project:.skills/skill-b:scripts/b.sh',
        skillId: 'project:.skills/skill-b',
        resourcePath: 'scripts/b.sh',
        resourceType: 'script',
        content: 'b',
        contentType: 'text/x-shellscript',
        size: 1,
        createdAt: 1,
      },
    ]

    vi.mocked(scanProjectSkills).mockResolvedValue({
      skills,
      resources,
      errors: [],
    })
    vi.mocked(storage.getSkillById).mockResolvedValue(undefined)

    const manager = new SkillManager()
    const result = await manager.scanProject({} as FileSystemDirectoryHandle)

    expect(storage.saveSkill).toHaveBeenCalledTimes(2)
    expect(storage.deleteSkillResources).toHaveBeenCalledTimes(2)
    expect(storage.saveSkillResource).toHaveBeenCalledTimes(2)
    expect(storage.saveSkillResource).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: 'project:.skills/skill-a',
        resourcePath: 'references/a.md',
      })
    )
    expect(storage.saveSkillResource).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: 'project:.skills/skill-b',
        resourcePath: 'scripts/b.sh',
      })
    )
    expect(result).toEqual({
      added: 2,
      resourcesAdded: 2,
      errors: [],
    })
  })
})
