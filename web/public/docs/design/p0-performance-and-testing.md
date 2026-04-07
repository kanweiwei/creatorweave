# P0 优先级任务设计文档

**项目**: BFOSA 性能优化与核心测试
**日期**: 2025-02-03
**状态**: 设计阶段

---

## 📋 设计概览

本文档涵盖两个 P0 优先级任务的详细技术设计：

1. **性能优化** - 文件遍历 Worker 隔离 + 分块处理
2. **核心测试** - 测试框架设计与核心路径覆盖

---

## Part 1: 性能优化设计

### 1.1 问题分析

#### 当前架构

```
┌─────────────────────────────────────────────┐
│              Main Thread (UI)               │
│  ┌─────────────────────────────────────┐   │
│  │  traverseDirectory()                │   │
│  │  (同步递归遍历，阻塞 UI)            │   │
│  └─────────────────────────────────────┘   │
│              ↓                              │
│  ┌─────────────────────────────────────┐   │
│  │  analyzeFiles()                     │   │
│  │  (WASM 计算，主线程调用)            │   │
│  └─────────────────────────────────────┘   │
│              ↓                              │
│  ┌─────────────────────────────────────┐   │
│  │  setState() (UI 更新)               │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

#### 问题

| 问题 | 影响 | 根因 |
|------|------|------|
| 大目录遍历阻塞 UI | 🔴 严重 | 递归遍历在主线程执行 |
| 内存峰值过高 | 🟡 中 | 全量加载文件元数据 |
| 无法取消操作 | 🟡 中 | 无取消机制 |
| 无进度反馈 | 🟢 低 | 缺少细粒度进度 |

### 1.2 目标架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Main Thread (UI)                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  FileAnalyzerWorker (接口层)                             │  │
│  │  - postMessage({ type: 'start', dirHandle })            │  │
│  │  - onmessage: 收集 chunk + 进度更新                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↕ (WorkerBridge)                      │
┌─────────────────────────────────────────────────────────────────┐
│                 FileTraversal Worker (独立线程)                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ChunkedTraversal                                       │  │
│  │  - 分块递归遍历 (chunkSize: 100)                        │  │
│  │  - yield 让出控制权                                       │  │
│  │  - 支持 cancel                                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ChunkProcessor                                          │  │
│  │  - 聚合 chunk 数据                                        │  │
│  │  - 定期 postMessage (非每个文件)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 接口设计

#### Worker 消息协议

```typescript
// 主线程 → Worker
type WorkerCommand =
  | { type: 'START', handle: SerializedDirectoryHandle, options: TraversalOptions }
  | { type: 'CANCEL' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }

// Worker → 主线程
type WorkerMessage =
  | { type: 'PROGRESS', data: { processed: number; total: number; currentPath: string } }
  | { type: 'CHUNK', data: FileMetadata[] }
  | { type: 'ERROR', error: string }
  | { type: 'COMPLETE', summary: TraversalSummary }

interface TraversalOptions {
  chunkSize?: number        // 每块文件数，默认 100
  yieldInterval?: number    // 让出控制间隔，默认 10ms
  maxDepth?: number         // 最大遍历深度，默认 Infinity
  includeHidden?: boolean   // 是否包含隐藏文件
  filePattern?: RegExp      // 文件名过滤
}

interface TraversalSummary {
  fileCount: number
  folderCount: number
  totalSize: number
  duration: number
  maxFile: { name: string; size: number; path: string }
}
```

#### Worker 接口

```typescript
/**
 * 文件遍历 Worker 接口
 */
class FileTraversalWorker {
  /**
   * 启动遍历
   */
  start(handle: FileSystemDirectoryHandle, options?: TraversalOptions): Promise<void>

  /**
   * 取消遍历
   */
  cancel(): void

  /**
   * 暂停遍历
   */
  pause(): void

  /**
   * 恢复遍历
   */
  resume(): void

  /**
   * 订阅事件
   */
  on(event: 'chunk', handler: (files: FileMetadata[]) => void): void
  on(event: 'progress', handler: (progress: Progress) => void): void
  on(event: 'complete', handler: (summary: TraversalSummary) => void): void
  on(event: 'error', handler: (error: Error) => void): void

  /**
   * 取消订阅
   */
  off(event: string, handler: Function): void
}
```

### 1.4 核心算法设计

#### 分块遍历算法

```typescript
/**
 * 分块递归遍历 - 在 Worker 中执行
 */
async function* traverseInChunks(
  dirHandle: FileSystemDirectoryHandle,
  options: TraversalOptions
): AsyncGenerator<FileMetadata[]> {
  const { chunkSize = 100, yieldInterval = 10, maxDepth = Infinity } = options
  let lastYield = Date.now()

  async function* recurse(
    handle: FileSystemDirectoryHandle,
    path: string,
    depth: number
  ): AsyncGenerator<FileMetadata> {
    if (depth > maxDepth) return

    for await (const entry of handle.entries()) {
      const [, entryHandle] = entry
      const entryPath = path ? `${path}/${entryHandle.name}` : entryHandle.name

      if (entryHandle.kind === 'file') {
        const file = await entryHandle.getFile()
        yield {
          name: file.name,
          size: file.size,
          type: 'file',
          lastModified: file.lastModified,
          path: entryPath,
        }
      } else if (entryHandle.kind === 'directory') {
        yield {
          name: entryHandle.name,
          size: 0,
          type: 'directory',
          lastModified: 0,
          path: entryPath,
        }
        yield* recurse(entryHandle as FileSystemDirectoryHandle, entryPath, depth + 1)
      }

      // 定期让出控制权
      const now = Date.now()
      if (now - lastYield > yieldInterval) {
        await new Promise(resolve => setTimeout(resolve, 0))
        lastYield = now
      }
    }
  }

  // 收集成块
  const chunk: FileMetadata[] = []
  for await (const file of recurse(dirHandle, '', 0)) {
    chunk.push(file)
    if (chunk.length >= chunkSize) {
      yield [...chunk]
      chunk.length = 0
    }
  }
  if (chunk.length > 0) yield chunk
}
```

#### 取消机制

```typescript
class CancellableTraversal {
  private cancelled = false
  private paused = false
  private resumeSignal: (() => void) | null = null

  cancel() {
    this.cancelled = true
    this.resumeSignal?.() // 释放暂停
  }

  pause() {
    this.paused = true
  }

  resume() {
    this.paused = false
    this.resumeSignal?.()
  }

  async checkPaused() {
    while (this.paused && !this.cancelled) {
      await new Promise<void>(resolve => {
        this.resumeSignal = resolve
      })
    }
    this.resumeSignal = null
  }

  isCancelled(): boolean {
    return this.cancelled
  }
}
```

### 1.5 文件结构

```
web/src/
├── workers/
│   ├── file-traversal/
│   │   ├── worker.ts              # Worker 入口
│   │   ├── traversal.ts            # 分块遍历逻辑
│   │   ├── cancellable.ts          # 取消机制
│   │   └── types.ts               # Worker 协议类型
│   ├── FileTraversalWorker.ts    # 主线程封装
│   └── plugin-host.ts             # 现有
├── services/
│   └── file-analyzer.service.ts   # 使用 Worker 的新服务
└── hooks/
    └── useFileAnalysis.ts         # React Hook 封装
```

### 1.6 性能指标

| 指标 | 当前 | 目标 | 测量方法 |
|------|------|------|----------|
| 10K 文件遍历 | 阻塞 UI | <5s UI 可响应 | Performance API |
| 内存峰值 | 未知 | <200MB | Chrome DevTools |
| 首次结果延迟 | 全量遍历后 | <100ms | Timestamp |
| 取消响应 | 无 | <50ms | Event timestamp |

### 1.7 兼容性考虑

| 浏览器 | Worker | FileSystemHandle | 兼容性 |
|--------|--------|------------------|--------|
| Chrome 86+ | ✅ | ✅ | 完整支持 |
| Edge 86+ | ✅ | ✅ | 完整支持 |
| Opera 72+ | ✅ | ✅ | 完整支持 |
| Firefox | ✅ | ❌ | 需要降级 |

降级方案：

```typescript
function supportsFileSystemAccess(): boolean {
  return 'showDirectoryPicker' in window
}

function createFileAnalyzer() {
  if (!supportsFileSystemAccess()) {
    // 使用 IndexedDB + 文件上传的降级方案
    return new LegacyFileAnalyzer()
  }
  return new WorkerFileAnalyzer()
}
```

---

## Part 2: 核心测试设计

### 2.1 测试策略

#### 金字塔模型

```
           /\
          /E2E\        10% - 关键用户流程
         /------\
        /集成测试 \     30% - Store + Service 交互
       /----------\
      /  单元测试   \   60% - 纯函数、工具类
     /--------------\
```

#### 测试优先级矩阵

| 模块 | 复杂度 | 业务影响 | 测试优先级 | 覆盖率目标 |
|------|--------|----------|-----------|-----------|
| AgentLoop | 高 | 高 | P0 | 85% |
| Stores (conversation, remote) | 高 | 高 | P0 | 80% |
| Services (traversal, analyzer) | 中 | 高 | P0 | 75% |
| Workers | 中 | 高 | P0 | 70% |
| Security (api-key-store) | 中 | 高 | P1 | 80% |
| Components | 低 | 中 | P1 | 60% |

### 2.2 测试框架配置

#### Vitest 配置增强

```typescript
// vite.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test-setup.ts',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.d.ts',
        'src/wasm/', // 生成的 WASM 类型
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    includeSource: ['src/**/*.{ts,tsx}'],
    benchmark: {
      include: ['src/**/*.bench.ts'],
    },
  },
})
```

#### 测试工具函数

```typescript
// src/test-helpers/index.ts
import { render, renderHook } from '@testing-library/react'
import { vi } from 'vitest'

/**
 * 创建假的 FileSystemDirectoryHandle
 */
export function createMockDirHandle(
  files: Record<string, { size: number; type: 'file' | 'directory' }>
): FileSystemDirectoryHandle {
  // Mock 实现
}

/**
 * 创建假的 Zustand store
 */
export function createMockStore<T>(initialState: T) {
  let state = initialState
  return {
    getState: () => state,
    setState: (partial: Partial<T>) => {
      state = { ...state, ...partial }
    },
    subscribe: (listener: () => void) => {
      return () => {} // noop unsubscribe
    },
  }
}

/**
 * 等待条件成立
 */
export async function waitFor(
  condition: () => boolean,
  timeout = 5000
): Promise<void> {
  const startTime = Date.now()
  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition')
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

/**
 * Mock Worker
 */
export function createMockWorker() {
  const worker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  return { worker, mockMessages: [] as any[] }
}
```

### 2.3 单元测试设计

#### AgentLoop 测试

```typescript
// src/agent/__tests__/agent-loop.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentLoop } from '../agent-loop'
import type { LLMProvider, ToolRegistry } from '../types'

describe('AgentLoop', () => {
  let mockProvider: LLMProvider
  let mockTools: ToolRegistry
  let mockContextManager: any

  beforeEach(() => {
    mockProvider = {
      chat: vi.fn(),
      streamChat: vi.fn(),
      maxContextTokens: 128000,
    }
    mockTools = {
      getTool: vi.fn(),
      listTools: vi.fn(),
    }
    mockContextManager = {
      buildContext: vi.fn(),
      estimateTokens: vi.fn(),
    }
  })

  describe('run()', () => {
    it('should execute single turn conversation', async () => {
      const loop = new AgentLoop({
        provider: mockProvider,
        toolRegistry: mockTools,
        contextManager: mockContextManager,
        maxIterations: 20,
      })

      const messages = [{ role: 'user', content: 'test' }]
      mockProvider.streamChat.mockResolvedValueOnce({
        role: 'assistant',
        content: 'response',
        toolCalls: [],
      })

      const result = await loop.run(messages)

      expect(result).toHaveLength(2) // user + assistant
      expect(result[1].content).toBe('response')
    })

    it('should handle tool calls', async () => {
      // Tool call 测试场景
    })

    it('should stop at max iterations', async () => {
      // 最大迭代次数测试
    })

    it('should cancel gracefully', async () => {
      // 取消测试
    })
  })

  describe('error handling', () => {
    it('should handle provider errors', async () => {
      // Provider 错误处理
    })

    it('should handle tool execution errors', async () => {
      // Tool 执行错误处理
    })
  })
})
```

#### Store 测试

```typescript
// src/store/__tests__/conversation.store.test.ts

import { describe, it, expect, beforeEach } from 'vitest'
import { useConversationStore } from '../conversation.store'
import { waitFor } from '@/test-helpers'

describe('ConversationStore', () => {
  beforeEach(() => {
    // 重置 store
    useConversationStore.setState({
      conversations: [],
      activeConversationId: null,
      loaded: true,
    })
  })

  describe('createNew()', () => {
    it('should create a new conversation with default title', () => {
      const store = useConversationStore.getState()
      const conversation = store.createNew()

      expect(conversation.id).toBeTruthy()
      expect(conversation.title).toMatch(/^Chat /)
      expect(conversation.messages).toEqual([])
    })

    it('should create a new conversation with custom title', () => {
      const store = useConversationStore.getState()
      const conversation = store.createNew('My Chat')

      expect(conversation.title).toBe('My Chat')
    })

    it('should set the new conversation as active', () => {
      const store = useConversationStore.getState()
      store.createNew()

      expect(useConversationStore.getState().activeConversationId).toBeTruthy()
    })
  })

  describe('addMessage()', () => {
    it('should add a message to the conversation', () => {
      const store = useConversationStore.getState()
      const conversation = store.createNew()

      store.addMessage(conversation.id, {
        role: 'user',
        content: 'Hello',
      })

      const updated = useConversationStore.getState().conversations[0]
      expect(updated.messages).toHaveLength(1)
      expect(updated.messages[0].content).toBe('Hello')
    })

    it('should auto-update title from first user message', () => {
      const store = useConversationStore.getState()
      const conversation = store.createNew() // 默认标题 "Chat 1"

      store.addMessage(conversation.id, {
        role: 'user',
        content: 'This is a custom title',
      })

      const updated = useConversationStore.getState().conversations[0]
      expect(updated.title).toBe('This is a custom title')
    })
  })

  describe('deleteConversation()', () => {
    it('should remove the conversation', () => {
      const store = useConversationStore.getState()
      const conversation = store.createNew()

      store.deleteConversation(conversation.id)

      expect(useConversationStore.getState().conversations).toHaveLength(0)
    })

    it('should clear activeConversationId if deleting active conversation', () => {
      const store = useConversationStore.getState()
      const conversation = store.createNew()

      store.deleteConversation(conversation.id)

      expect(useConversationStore.getState().activeConversationId).toBeNull()
    })

    it('should cleanup streaming queues', () => {
      // Streaming queue 清理测试
    })
  })
})
```

### 2.4 集成测试设计

#### Store + Service 集成

```typescript
// src/integration/__tests__/file-analysis.integration.test.ts

import { describe, it, expect } from 'vitest'
import { createMockDirHandle } from '@/test-helpers'
import { useAnalysisStore } from '@/store/analysis.store'
import { analyzeFiles } from '@/services/analyzer.service'

describe('File Analysis Integration', () => {
  it('should analyze files and update store', async () => {
    const mockHandle = createMockDirHandle({
      'file1.txt': { size: 1000, type: 'file' },
      'file2.txt': { size: 2000, type: 'file' },
      'subdir': { size: 0, type: 'directory' },
    })

    const result = await analyzeFiles(mockHandle)

    expect(result.fileCount).toBe(2)
    expect(result.totalSize).toBe(3000)
    expect(result.averageSize).toBe(1500)
  })

  it('should update progress during analysis', async () => {
    const store = useAnalysisStore.getState()
    const progressUpdates: number[] = []

    await analyzeFiles(mockHandle, (count, size) => {
      progressUpdates.push(count)
    })

    expect(progressUpdates.length).toBeGreaterThan(0)
  })
})
```

### 2.5 E2E 测试设计

#### Playwright 场景

```typescript
// tests/e2e/file-analysis.spec.ts

import { test, expect } from '@playwright/test'

test.describe('File Analysis Flow', () => {
  test('should analyze a selected folder', async ({ page }) => {
    await page.goto('/')

    // Mock file system access API
    await page.addInitScript(() => {
      // @ts-ignore
      window.showDirectoryPicker = async () => {
        return {
          name: 'test-folder',
          entries: async function* () {
            yield ['file1.txt', getFileHandle(1000)]
            yield ['file2.txt', getFileHandle(2000)]
          },
        }
      }
    })

    // Click "Select Folder" button
    await page.click('button:has-text("选择文件夹")')

    // Wait for analysis to complete
    await expect(page.locator('[data-testid="file-count"]')).toHaveText('2')
    await expect(page.locator('[data-testid="total-size"]')).toHaveText('3 KB')
  })

  test('should show progress during analysis', async ({ page }) => {
    // 进度显示测试
  })

  test('should handle analysis errors gracefully', async ({ page }) => {
    // 错误处理测试
  })
})
```

### 2.6 测试执行命令

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:watch": "vitest --watch",
    "test:benchmark": "vitest bench"
  }
}
```

### 2.7 覆盖率目标

| 模块 | Statements | Branches | Functions | Lines |
|------|-----------|----------|-----------|-------|
| Agent | 85% | 80% | 85% | 85% |
| Store | 80% | 75% | 80% | 80% |
| Services | 75% | 70% | 75% | 75% |
| Workers | 70% | 65% | 70% | 70% |
| Utils | 90% | 85% | 90% | 90% |
| Components | 60% | 50% | 60% | 60% |
| **总体目标** | **80%** | **75%** | **80%** | **80%** |

---

## 📅 实施计划

### Sprint 1: Worker 隔离 (3 天)

| 任务 | 预估 | 负责人 |
|------|------|--------|
| 创建 file-traversal worker | 4h | |
| 实现 CancellableTraversal | 2h | |
| Worker 协议与类型定义 | 2h | |
| FileTraversalWorker 封装 | 2h | |
| 单元测试 | 4h | |
| 集成测试 | 2h | |

### Sprint 2: 核心测试 (4 天)

| 任务 | 预估 | 负责人 |
|------|------|--------|
| 测试工具函数 | 2h | |
| AgentLoop 单元测试 | 6h | |
| Store 单元测试 | 6h | |
| Service 单元测试 | 4h | |
| 集成测试 | 4h | |
| 覆盖率报告配置 | 1h | |

### Sprint 3: 优化与验证 (2 天)

| 任务 | 预估 | 负责人 |
|------|------|--------|
| 性能基准测试 | 3h | |
| 内存泄漏检测 | 2h | |
| 降级方案实现 | 6h | |
| 文档更新 | 2h | |

---

## 📈 验收标准

### 性能优化

- [ ] 10K 文件遍历 <5s，UI 保持响应
- [ ] 内存峰值 <200MB (10K 文件)
- [ ] 支持取消操作，响应 <50ms
- [ ] 首批结果 <100ms 显示

### 测试覆盖

- [ ] 整体覆盖率 ≥80%
- [ ] AgentLoop 覆盖率 ≥85%
- [ ] Store 覆盖率 ≥80%
- [ ] CI 自动运行测试

---

## 🔗 相关文档

- [技术债务规划](./technical-debt-plan.md)
- [代码分析报告](./analysis-report.md)
- [架构概览](./architecture/overview.md)
