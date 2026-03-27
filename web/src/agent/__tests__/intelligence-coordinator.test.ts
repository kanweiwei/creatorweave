import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntelligenceCoordinator } from '../intelligence-coordinator'

const {
  recommendMock,
  getToolRecommendationsForPromptMock,
  scanMock,
  formatFingerprintForPromptMock,
  getMemoryBlockForPromptMock,
  processMessageMock,
  getProjectMock,
  buildAgentPromptMock,
  findActiveProjectMock,
  projectStoreState,
} = vi.hoisted(() => {
  const findActiveProjectMockInner = vi.fn<() => Promise<{ id: string } | null>>(async () => null)
  return {
    recommendMock: vi.fn(() => []),
    getToolRecommendationsForPromptMock: vi.fn(() => ''),
    scanMock: vi.fn(async () => null),
    formatFingerprintForPromptMock: vi.fn(() => ''),
    getMemoryBlockForPromptMock: vi.fn(async () => ''),
    processMessageMock: vi.fn(async () => {}),
    getProjectMock: vi.fn(),
    buildAgentPromptMock: vi.fn(() => 'AGENT_PROMPT'),
    findActiveProjectMock: findActiveProjectMockInner,
    projectStoreState: { activeProjectId: '' },
  }
})

vi.mock('../tools/tool-recommendation', () => ({
  getRecommendationEngine: () => ({
    recommend: recommendMock,
    getAllTools: vi.fn(() => ({})),
  }),
  getToolRecommendationsForPrompt: getToolRecommendationsForPromptMock,
}))

vi.mock('../project-fingerprint', () => ({
  getFingerprintScanner: () => ({
    scan: scanMock,
    quickScan: vi.fn(async () => 'unknown'),
  }),
  formatFingerprintForPrompt: formatFingerprintForPromptMock,
  getProjectTypeDescription: vi.fn(() => ''),
}))

vi.mock('../context-memory', () => ({
  getContextMemoryManager: () => ({
    processMessage: processMessageMock,
  }),
  getMemoryBlockForPrompt: getMemoryBlockForPromptMock,
}))

vi.mock('@/opfs', () => ({
  ProjectManager: {
    create: vi.fn(async () => ({
      getProject: getProjectMock,
    })),
  },
}))

vi.mock('../prompt-builder', () => ({
  buildAgentPrompt: buildAgentPromptMock,
}))

vi.mock('@/sqlite/repositories/project.repository', () => ({
  getProjectRepository: () => ({
    findActiveProject: findActiveProjectMock,
  }),
}))

vi.mock('@/store/project.store', () => ({
  useProjectStore: {
    getState: () => projectStoreState,
  },
}))

function createAgentInfo(id = 'default') {
  return {
    id,
    meta: { id, name: id, createdAt: Date.now(), lastAccessedAt: Date.now() },
    soul: '# SOUL',
    identity: '# IDENTITY',
    agents: '# AGENTS',
    user: '# USER',
    memory: '# MEMORY',
  }
}

describe('IntelligenceCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectStoreState.activeProjectId = ''
    findActiveProjectMock.mockResolvedValue(null)
    getProjectMock.mockResolvedValue(null)
  })

  it('injects agent prompt when project store has activeProjectId', async () => {
    projectStoreState.activeProjectId = 'proj-store'
    const agentInfo = createAgentInfo('default')
    getProjectMock.mockResolvedValue({
      agentManager: {
        getAgent: vi.fn(async () => agentInfo),
        readTodayLog: vi.fn(async () => null),
      },
    })

    const coordinator = new IntelligenceCoordinator()
    const result = await coordinator.enhanceSystemPrompt('BASE_PROMPT')

    expect(result.agentInfo?.id).toBe('default')
    expect(result.systemPrompt).toContain('AGENT_PROMPT\n\n---\n\nBASE_PROMPT')
    expect(getProjectMock).toHaveBeenCalledWith('proj-store')
  })

  it('falls back to sqlite active project when project store is empty', async () => {
    findActiveProjectMock.mockResolvedValue({ id: 'proj-sqlite' })
    const agentInfo = createAgentInfo('default')
    getProjectMock.mockResolvedValue({
      agentManager: {
        getAgent: vi.fn(async () => agentInfo),
        readTodayLog: vi.fn(async () => null),
      },
    })

    const coordinator = new IntelligenceCoordinator()
    const result = await coordinator.enhanceSystemPrompt('BASE_PROMPT')

    expect(result.systemPrompt).toContain('AGENT_PROMPT\n\n---\n\nBASE_PROMPT')
    expect(getProjectMock).toHaveBeenCalledWith('proj-sqlite')
  })

  it('injects routed agent prompt when currentAgentId is provided', async () => {
    projectStoreState.activeProjectId = 'proj-store'
    const routedAgent = createAgentInfo('novel-editor')
    const defaultAgent = createAgentInfo('default')
    const getAgentMock = vi.fn(async (id: string) =>
      id === 'novel-editor' ? routedAgent : defaultAgent
    )
    getProjectMock.mockResolvedValue({
      agentManager: {
        getAgent: getAgentMock,
        readTodayLog: vi.fn(async () => null),
      },
    })

    const coordinator = new IntelligenceCoordinator()
    const result = await coordinator.enhanceSystemPrompt('BASE_PROMPT', {
      currentAgentId: 'novel-editor',
    })

    expect(getAgentMock).toHaveBeenCalledWith('novel-editor')
    expect(result.agentInfo?.id).toBe('novel-editor')
    expect(result.systemPrompt).toContain('AGENT_PROMPT\n\n---\n\nBASE_PROMPT')
  })

  it('falls back to default agent prompt when routed agent is missing', async () => {
    projectStoreState.activeProjectId = 'proj-store'
    const defaultAgent = createAgentInfo('default')
    const getAgentMock = vi.fn(async (id: string) => (id === 'default' ? defaultAgent : null))
    getProjectMock.mockResolvedValue({
      agentManager: {
        getAgent: getAgentMock,
        readTodayLog: vi.fn(async () => null),
      },
    })

    const coordinator = new IntelligenceCoordinator()
    const result = await coordinator.enhanceSystemPrompt('BASE_PROMPT', {
      currentAgentId: 'novel-editor',
    })

    expect(getAgentMock).toHaveBeenCalledWith('novel-editor')
    expect(getAgentMock).toHaveBeenCalledWith('default')
    expect(result.agentInfo?.id).toBe('default')
    expect(result.systemPrompt).toContain('AGENT_PROMPT\n\n---\n\nBASE_PROMPT')
  })

  it('does not inject agent prompt when no active project can be resolved', async () => {
    const coordinator = new IntelligenceCoordinator()
    const result = await coordinator.enhanceSystemPrompt('BASE_PROMPT')

    expect(result.agentInfo).toBeNull()
    expect(result.systemPrompt).toBe('BASE_PROMPT')
    expect(buildAgentPromptMock).not.toHaveBeenCalled()
  })
})
