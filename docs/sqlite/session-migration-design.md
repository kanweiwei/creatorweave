# Session Store SQLite 迁移设计

## 1. 当前架构分析

### 1.1 现有组件依赖

```
SessionBadgeWithStorage (UI组件)
    ↓
useStorageInfo (Hook)
    ↓
┌─────────────────────────────────────────────┐
│ session.store.ts (Zustand Store)            │
│  ↓ 使用 ↓                                   │
│ @/opfs/session (SessionManager)             │
│  - SessionWorkspace: OPFS 文件操作          │
│  - SessionCacheManager: 文件缓存            │
│  - SessionPendingManager: 待同步队列        │
│  - SessionUndoStorage: 撤销历史             │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ @/sqlite/repositories/session.repository.ts │
│  - Session: 会话元数据                       │
│  - FileMetadata: 文件元数据                  │
│  - PendingChange: 待同步变更                 │
│  - UndoRecord: 撤销记录                      │
└─────────────────────────────────────────────┘
```

### 1.2 存储职责划分

| 数据类型 | 当前存储 | SQLite 状态 | 说明 |
|---------|---------|-------------|------|
| 会话元数据 | OPFS sessions.json | ✅ 已有 sessions 表 | 需要迁移读取 |
| 文件内容 | OPFS 文件系统 | ❌ 不迁移 | 保持 OPFS |
| 文件元数据 | OPFS file_metadata.json | ✅ 已有 file_metadata 表 | 需要迁移读写 |
| 待同步队列 | OPFS pending_changes.json | ✅ 已有 pending_changes 表 | 需要迁移读写 |
| 撤销历史 | OPFS undo_records.json | ✅ 已有 undo_records 表 | 需要迁移读写 |
| 存储空间信息 | navigator.storage.estimate | ❌ 不适用 | 浏览器 API |

## 2. 迁移策略

### 2.1 渐进式迁移方案

**阶段 1: 读取层迁移 (Read-First)**
- `session.store.ts` 从 `SessionRepository` 读取会话列表
- 保持 `SessionManager` 用于 OPFS 文件操作
- 两种存储并存，通过 `SessionRepository` 作为元数据源

**阶段 2: 写入层迁移 (Write-Through)**
- 会话创建/更新同时写入 OPFS 和 SQLite
- 待同步、撤销记录迁移到 SQLite
- 保持 OPFS 作为文件内容存储

**阶段 3: 完全迁移 (SQLite-First)**
- 移除 OPFS 元数据文件依赖
- 保留 `SessionWorkspace` 用于文件操作
- 所有元数据查询走 SQLite

### 2.2 数据同步策略

```typescript
// 迁移期间的同步逻辑
interface SessionSyncStrategy {
  // 读取优先级: SQLite > OPFS
  read: 'sqlite-first' | 'opfs-first' | 'sqlite-only'

  // 写入策略: 同时写入两者
  write: 'dual-write' | 'sqlite-only'

  // 迁移状态
  migration: 'pending' | 'in-progress' | 'complete'
}
```

## 3. 组件重构设计

### 3.1 新的 useStorageInfo Hook

```typescript
// hooks/useStorageInfo.ts (重构后)

import { getSessionRepository } from '@/sqlite'
import { getStorageEstimate, getStorageStatus, formatBytes } from '@/opfs/utils/storage-utils'

export function useStorageInfo(): UseStorageInfoResult {
  const sessions = useSessionStore((state) => state.sessions)

  // 从 SQLite 读取会话统计
  const refresh = useCallback(async (includeSessionSizes = false) => {
    const repo = getSessionRepository()

    // 获取浏览器存储配额 (OPFS + IndexedDB 总和)
    const estimate = await getStorageEstimate()

    // 从 SQLite 获取会话统计
    const stats = await repo.getSessionStats()

    return {
      storage: estimate,
      sessions: stats.map(s => ({
        id: s.sessionId,
        cacheSize: s.totalFileSize,
        cacheSizeFormatted: formatBytes(s.totalFileSize),
        pendingCount: s.pendingCount,
        undoCount: s.undoCount,
        // ...
      }))
    }
  }, [sessions])

  // 清理操作通过 SQLite + OPFS 协作
  const cleanupOldSessions = useCallback(async (days: number) => {
    const repo = getSessionRepository()
    const manager = await getSessionManager()

    // 1. 从 SQLite 获取需要清理的会话
    const oldSessions = await repo.findInactiveSessions(days)

    // 2. 同时清理 SQLite 和 OPFS
    for (const session of oldSessions) {
      await repo.deleteSession(session.id)
      await manager.deleteSession(session.id)
    }
  }, [])
}
```

### 3.2 新的 session.store.ts

```typescript
// store/session.store.ts (重构后)

import { getSessionRepository } from '@/sqlite'
import { getSessionManager } from '@/opfs/session'

export const useSessionStore = create<SessionState>()(
  immer((set, get) => ({
    activeSessionId: null,
    sessions: [],
    initialized: false,

    initialize: async () => {
      // 从 SQLite 读取会话列表
      const repo = getSessionRepository()
      const sessions = await repo.findAllSessions()

      set({
        sessions: sessions.map(s => ({
          id: s.id,
          name: s.name,
          createdAt: s.createdAt,
          lastActiveAt: s.lastAccessedAt,
          cacheSize: s.cacheSize,
          pendingCount: s.pendingCount,
          undoCount: s.undoCount,
          modifiedFiles: s.modifiedFiles,
          status: s.status,
        })),
        activeSessionId: sessions[0]?.id || null,
        initialized: true,
      })
    },

    createSession: async (id, rootDirectory, name) => {
      const repo = getSessionRepository()
      const manager = await getSessionManager()

      // 1. 创建 OPFS 工作空间
      await manager.createSession(rootDirectory, id)

      // 2. 创建 SQLite 会话记录
      await repo.createSession({
        id,
        rootDirectory,
        name: name || rootDirectory.split('/').pop(),
        status: 'active',
        cacheSize: 0,
        pendingCount: 0,
        undoCount: 0,
        modifiedFiles: 0,
      })

      // 3. 刷新会话列表
      await get().initialize()
    },

    deleteSession: async (id) => {
      const repo = getSessionRepository()
      const manager = await getSessionManager()

      // 1. 删除 OPFS 数据
      await manager.deleteSession(id)

      // 2. 删除 SQLite 记录
      await repo.deleteSession(id)

      // 3. 刷新会话列表
      await get().initialize()
    },
  }))
)
```

## 4. SQLite Schema 增强

### 4.1 当前 Schema

```sql
-- sessions 表
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  root_directory TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  cache_size INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL DEFAULT 0,
  undo_count INTEGER NOT NULL DEFAULT 0,
  modified_files INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_accessed_at INTEGER NOT NULL
);

-- file_metadata 表
CREATE TABLE IF NOT EXISTS file_metadata (...);

-- pending_changes 表
CREATE TABLE IF NOT EXISTS pending_changes (...);

-- undo_records 表
CREATE TABLE IF NOT EXISTS undo_records (...);
```

### 4.2 需要的增强

```sql
-- 添加索引优化查询
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_last_accessed ON sessions(last_accessed_at DESC);

-- 添加触发器自动更新统计
CREATE TRIGGER IF NOT EXISTS update_pending_count
AFTER INSERT ON pending_changes
BEGIN
  UPDATE sessions SET pending_count = pending_count + 1
  WHERE id = NEW.session_id;
END;
```

## 5. 迁移步骤

### Step 1: 创建迁移工具

```typescript
// sqlite/migration/session-migration.ts

export async function migrateSessionsFromOPFS() {
  const manager = await getSessionManager()
  const repo = getSessionRepository()

  // 1. 读取 OPFS 中的所有会话
  const opfsSessions = manager.getAllSessions()

  // 2. 为每个会话创建 SQLite 记录
  for (const opfsSession of opfsSessions) {
    const workspace = await manager.getSession(opfsSession.sessionId)
    if (!workspace) continue

    const existing = await repo.findSessionById(opfsSession.sessionId)
    if (existing) {
      // 更新现有记录
      await repo.updateSession({
        ...existing,
        pendingCount: workspace.pendingCount,
        undoCount: workspace.undoCount,
        lastAccessedAt: opfsSession.lastAccessedAt,
      })
    } else {
      // 创建新记录
      await repo.createSession({
        id: opfsSession.sessionId,
        rootDirectory: opfsSession.rootDirectory,
        name: opfsSession.name || opfsSession.rootDirectory.split('/').pop(),
        status: 'active',
        cacheSize: 0,
        pendingCount: workspace.pendingCount,
        undoCount: workspace.undoCount,
        modifiedFiles: 0,
      })
    }
  }
}
```

### Step 2: 更新 SessionRepository

添加缺失的辅助方法：

```typescript
// 按活跃状态查找会话
async findActiveSessions(): Promise<Session[]>

// 查找长时间未活跃的会话
async findInactiveSessions(days: number): Promise<Session[]>

// 批量更新统计信息
async updateSessionStats(sessionId: string, stats: Partial<Session>): Promise<void>

// 获取所有会话的统计信息
async getSessionStats(): Promise<SessionStats[]>
```

### Step 3: 更新组件

1. `useStorageInfo.ts` - 从 SQLite 读取统计数据
2. `session.store.ts` - 使用 `SessionRepository` 作为元数据源
3. `SessionBadgeWithStorage.tsx` - 保持不变，使用更新后的 Hook

### Step 4: 清理旧代码

迁移完成后：
- 保留 `SessionWorkspace` 用于 OPFS 文件操作
- 移除 `SessionManager` 中的元数据管理代码
- 保留 `opfs-utils.ts` 的存储配额查询功能

## 6. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 数据不一致 | 显示错误的会话信息 | 迁移期间双写，验证数据一致性 |
| 性能回归 | 频繁 SQLite 查询 | 使用 Zustand 缓存，批量查询 |
| 迁移失败 | 丢失会话数据 | 迁移前备份，失败时回滚 |
| 浏览器兼容性 | SQLite Worker 不可用 | Fallback 到 OPFS 模式 |

## 7. 测试计划

### 7.1 单元测试

- `SessionRepository` CRUD 操作测试
- 迁移工具测试
- `useStorageInfo` Hook 测试

### 7.2 集成测试

- 会话创建/切换/删除流程
- 存储空间统计准确性
- 清理操作正确性

### 7.3 E2E 测试

- 完整会话生命周期
- 跨会话数据一致性
