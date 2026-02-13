# Session/Conversation 术语统一设计

## 问题分析

### 当前架构

| 概念 | 英文 | 中文显示 | 存储位置 | 实际内容 |
|------|------|----------|----------|----------|
| Conversation | `Conversation` | "对话" | SQLite `conversations` 表 | 聊天消息 (`messages_json`) |
| Session | `Session` | "会话" | OPFS + SQLite `sessions` 表 | 文件工作区缓存 |

### 核心混淆点

1. **ID 共享但概念分离**
   - `conversation.id` === `session.id` (通常是相同的 UUID)
   - 但两者指向完全不同的数据

2. **UI 术语不统一**
   - Sidebar 显示 "对话"
   - Storage badge 显示 "会话"
   - 用户无法区分两者的关系

3. **内部代码也混淆**
   - `session.store.ts` 中使用 `DEFAULT_CONVERSATION_NAME`
   - 开发者也需要时刻提醒自己两个概念的区别

### 数据库关系

```
┌─────────────────────────────────────────────────────────────┐
│  conversations 表 (SQLite)                                  │
│  ├── id: "conv-123"                                         │
│  ├── title: "分析项目代码"                                   │
│  └── messages_json: "[...]"                                 │
└─────────────────────────────────────────────────────────────┘
                    │
                    │ 无外键约束，但 ID 相同
                    │
┌─────────────────────────────────────────────────────────────┐
│  sessions 表 (SQLite)                                       │
│  ├── id: "conv-123"                                         │
│  ├── root_directory: "/conversations/conv-123"              │
│  ├── cache_size: 1.2MB                                      │
│  ├── pending_count: 5                                       │
│  └── undo_count: 3                                          │
└─────────────────────────────────────────────────────────────┘
                    │
                    │ 1:1 关系
                    │
┌─────────────────────────────────────────────────────────────┐
│  OPFS 文件存储                                              │
│  /conversations/conv-123/                                   │
│  ├── workspace/              (文件缓存)                      │
│  ├── pending/                (待同步内容)                    │
│  └── undo/                   (撤销备份)                      │
└─────────────────────────────────────────────────────────────┘
```

## 设计方案

### 方案选择：统一为 "对话"

**用户视角**：只看到 "对话" (Conversation)
- 聊天记录 = 对话内容
- 文件缓存 = 对话的附件/工作数据

**代码视角**：明确分离
- `Conversation` = 聊天记录 + 工作区元数据的统一实体
- `Workspace` = OPFS 文件存储（内部实现细节）

### 新术语体系

| 旧术语 | 新术语 (用户) | 新术语 (代码) | 说明 |
|--------|--------------|--------------|------|
| Conversation | 对话 | `Conversation` | 统一实体，包含聊天和工作区状态 |
| Session | (隐藏) | `Workspace` | 内部实现，OPFS 文件存储 |
| activeConversationId | 当前对话 | `activeConversationId` | 统一 ID |
| activeSessionId | (隐藏) | `activeWorkspaceId` | 内部使用，与 conversationId 相同 |

### 重构后的数据结构

```typescript
/**
 * 统一的对话实体
 * 包含聊天记录和工作区状态
 */
interface Conversation {
  id: string                    // 唯一 ID
  title: string                 // 对话标题
  messages: Message[]           // 聊天记录

  // 工作区状态 (原 Session 数据)
  workspaceState: {
    cacheSize: number           // 文件缓存大小
    pendingCount: number        // 待同步变更数
    undoCount: number           // 可撤销记录数
    modifiedFiles: number       // 已修改文件数
  }

  // 时间戳
  createdAt: number
  lastActiveAt: number
}

/**
 * 工作区 (内部实现细节)
 * 用户不可见，仅用于文件操作
 */
interface Workspace {
  id: string                    // 与 conversation.id 相同
  rootDirectory: string         // OPFS 路径
}
```

### UI 变更

| 组件 | 当前显示 | 变更后 |
|------|----------|--------|
| Sidebar | 对话 | 对话 (不变) |
| SessionBadgeWithStorage | 存储空间 (会话列表) | 对话存储 |
| SessionSwitcher | 会话列表 | (移除，功能合并到 Conversation 列表) |
| 删除确认 | 删除会话 | 删除对话 |

## 重构计划

### Phase 1: 内部重构 (代码层面)

1. **重命名核心类型**
   ```typescript
   // session.store.ts → workspace.store.ts
   // Session → Workspace (内部)
   // useSessionStore → useWorkspaceStore (内部)
   ```

2. **合并数据访问**
   ```typescript
   // conversation.store.ts 扩展
   // 新增 workspaceState 字段
   // 对外暴露统一的 Conversation 实体
   ```

### Phase 2: UI 重构

1. **组件重命名**
   ```tsx
   // SessionBadgeWithStorage → ConversationStorageBadge
   // SessionSwitcher → (移除，功能合并)
   ```

2. **文案统一**
   - 所有 "会话" → "对话" 或 "对话存储"
   - 帮助文本明确说明 "文件缓存" 和 "对话记录" 的关系

### Phase 3: 数据库清理 (可选)

考虑是否需要：
- 合并 `conversations` 和 `sessions` 表
- 或保持分离但明确文档说明

## 迁移步骤

### Step 1: 创建新的 workspace 模块

```typescript
// workspace.store.ts (新建)
export interface Workspace {
  id: string
  rootDirectory: string
  // 内部 OPFS 管理状态
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  // 原 session.store 的逻辑
  // 但仅用于内部文件操作
}))
```

### Step 2: 扩展 conversation store

```typescript
// conversation.store.ts
export interface Conversation {
  // ... 现有字段

  // 新增：工作区状态 (从 sessions 表读取)
  workspaceState?: {
    cacheSize: number
    pendingCount: number
    undoCount: number
  }
}
```

### Step 3: 更新 UI 组件

```tsx
// ConversationStorageBadge.tsx (重命名)
// 显示 "对话存储" 而不是 "会话"
```

## 影响范围

### 需要修改的文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `store/session.store.ts` | 重命名 | → `workspace.store.ts` |
| `store/conversation.store.ts` | 扩展 | 添加 workspaceState |
| `components/session/SessionBadgeWithStorage.tsx` | 重命名 + 文案 | → `ConversationStorageBadge` |
| `components/session/SessionSwitcher.tsx` | 移除 | 功能合并到 Conversation 列表 |
| `components/layout/Sidebar.tsx` | 无变化 | 已使用 "对话" |
| `hooks/useStorageInfo.ts` | 更新 | 使用新的 workspace API |

### 无需修改的文件

- `components/agent/ConversationView.tsx` (已使用 "对话")
- `sqlite/repositories/session.repository.ts` (保持内部命名)

## 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 破坏现有数据 | 高 | 保持数据库表结构不变，仅修改代码层 |
| 用户困惑 | 中 | 提供迁移说明，UI 文案清晰 |
| 开发周期 | 中 | 分阶段实施，先内部后外部 |

## 建议

**推荐采用渐进式重构**：

1. 先完成 Phase 1 (内部重构)
2. 验证无问题后进行 Phase 2 (UI 重构)
3. Phase 3 (数据库合并) 可选，视需求而定

**核心原则**：
- 用户只看到 "对话"
- Workspace 是内部实现细节
- API 保持向后兼容
