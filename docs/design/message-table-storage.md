# 消息独立表存储改造

> 状态：设计阶段
> 日期：2026-04-28

## 问题

当前所有聊天消息存储在 `conversations.messages_json` 中——一个巨大的 JSON blob。每次持久化（发消息、Agent 回复、删消息、改标题……）都要：

1. `JSON.stringify(全部历史消息)` — 消息越多越慢，阻塞主线程
2. 整体 UPSERT 到 `conversations` 表 — 即使只改了标题也重写全部消息

**实际影响：** 旧对话（100+ 条消息）发消息时明显卡顿。

---

## 现状分析

### 当前表结构

```sql
-- sqlite-schema.sql
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    title_mode TEXT NOT NULL DEFAULT 'manual',
    messages_json TEXT NOT NULL DEFAULT '[]',       -- ← 全部消息打包
    context_usage_json TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000)
);
```

### 持久化调用链

```
action (addMessage / updateMessages / ...)
  → set() 更新内存 store          ← 同步，React 立即渲染
  → persistConversation(conv)      ← async 但同步前缀阻塞
    → repo.save(full)
      → JSON.stringify(messages)   ← 同步，阻塞主线程
      → INSERT ... ON CONFLICT     ← await，异步
```

### 调用场景（15 处）

| 场景 | 变更内容 | 写入量 |
|------|---------|--------|
| `createNew` | 新建对话 + 首条系统消息 | 小 |
| `addMessage` | 追加一条消息 | **全量序列化** |
| `updateMessages` | 替换全部消息（发送、Agent 完成） | **全量序列化** |
| `deleteUserMessage` | 删除用户消息 | **全量序列化** |
| `deleteAgentLoop` | 删除 Agent 轮次 | **全量序列化** |
| `regenerateUserMessage` | 替换消息 + 启动新 Agent | **全量序列化** |
| `runAgent` (streaming 中) | 多次更新助手消息内容 | **全量序列化 × N** |
| `runAgent` (tool call) | 更新 tool 消息 | **全量序列化** |
| `runAgent` (finalizeRun) | 最终保存 + contextUsage | **全量序列化** |
| `cancelAgent` | 中止 Agent，保存当前状态 | **全量序列化** |
| `updateTitle` | 仅改标题 | **全量序列化（含消息）** |
| `loadFromDB` | 加载全部对话 | 全量反序列化 |

**核心问题：** 15 个场景中，每次都要序列化全部消息，即使只改了标题或只追加了 1 条消息。

### Message 类型

```typescript
interface Message {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  kind?: 'normal' | 'context_summary' | 'workflow_dry_run' | 'workflow_real_run'
  workflowDryRun?: WorkflowDryRunPayload
  workflowRealRun?: WorkflowRealRunPayload
  reasoning?: string | null
  toolCalls?: ToolCall[]
  toolCallId?: string        // tool role 消息
  name?: string              // tool role 消息
  timestamp: number
  usage?: MessageUsage
  assets?: AssetMeta[]
}
```

每条消息包含文本内容、工具调用、推理内容、资源附件等，单条可很大（工具调用结果可达数 KB）。

---

## 设计方案

### 新增 `messages` 表

```sql
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,           -- 'system' | 'user' | 'assistant' | 'tool'
    content_json TEXT NOT NULL DEFAULT 'null',  -- JSON: string | null
    meta_json TEXT,               -- JSON: { kind, reasoning, toolCalls, toolCallId, name, usage, assets, workflowDryRun, workflowRealRun }
    timestamp INTEGER NOT NULL,
    seq INTEGER NOT NULL,         -- 消息在对话中的顺序（0-based）
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_seq ON messages(conversation_id, seq);
CREATE INDEX IF NOT EXISTS idx_messages_conv_ts ON messages(conversation_id, timestamp);
```

### `conversations` 表变更

```sql
-- 移除 messages_json 列（迁移后）
-- conversations 表简化为：
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    title_mode TEXT NOT NULL DEFAULT 'manual',
    context_usage_json TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000)
);
```

### 设计决策说明

**为什么用 `meta_json` 而不是拆成多列？**
- Message 的可选字段多（`toolCalls`、`reasoning`、`assets` 等），拆列会有大量 NULL 列
- 查询时不单独按这些字段过滤，只在加载完整消息时使用
- 减少迁移和未来新增字段时的表结构变更

**为什么用 `seq` 而不是只靠 `timestamp` 排序？**
- 保证消息顺序确定性（同一毫秒内可能有多条消息）
- 删除中间消息后 seq 可以重排，或保留间隙（gap）

**`content_json` 为什么独立？**
- `content` 是最常访问的字段（列表预览、搜索）
- 独立出来方便未来做全文搜索（FTS）
- 单独看时不需要解析整个 meta_json

---

## Repository 层改造

### 新增 MessageRepository

```typescript
// sqlite/repositories/message.repository.ts

export class MessageRepository {
  /** INSERT 单条消息 */
  async insert(convId: string, message: Message, seq: number): Promise<void>

  /** INSERT 多条消息（事务） */
  async insertBatch(convId: string, messages: Message[]): Promise<void>

  /** 按 seq 加载对话的全部消息 */
  async findByConversation(convId: string): Promise<Message[]>

  /** 删除对话的全部消息 */
  async deleteByConversation(convId: string): Promise<void>

  /** 删除 seq >= 指定值的消息（用于删除 Agent 轮次） */
  async deleteFromSeq(convId: string, seq: number): Promise<void>

  /** 替换对话的全部消息（事务：删旧 + 插新） */
  async replaceAll(convId: string, messages: Message[]): Promise<void>

  /** 统计对话消息数 */
  async count(convId: string): Promise<number>
}
```

### ConversationRepository 改造

```typescript
// 改造前：save() 做全量 UPSERT（含 messages_json）
// 改造后：save() 只管 conversations 表自身的字段

class ConversationRepository {
  /** 只更新对话元数据（不含消息） */
  async save(meta: { id, title, titleMode, contextUsage, createdAt, updatedAt }): Promise<void>

  /** updateTitle / updateMessages 等方法移除或改为调用 MessageRepository */
}
```

---

## Store 层改造

### 持久化函数替换

```typescript
// ============ 之前 ============
async function persistConversation(conv: Conversation) {
  await repo.save({ ..., messages: conv.messages, ... })  // 全量序列化
}

// ============ 之后 ============

/** 追加单条消息（不发消息时最常用） */
async function persistNewMessage(convId: string, message: Message, seq: number) {
  await messageRepo.insert(convId, message, seq)
  // 更新 conversations.updated_at
  await convRepo.touch(convId)
}

/** 替换全部消息（删消息、regenerate 等场景） */
async function persistMessageReplace(convId: string, messages: Message[]) {
  await messageRepo.replaceAll(convId, messages)
  await convRepo.touch(convId)
}

/** 仅更新对话元数据（标题、contextUsage） */
async function persistConversationMeta(conv: Conversation) {
  await convRepo.save({
    id: conv.id,
    title: conv.title,
    titleMode: conv.titleMode,
    contextUsage: conv.lastContextWindowUsage,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  })
}
```

### 各调用点改造

| 场景 | 之前 | 之后 |
|------|------|------|
| `addMessage` | `persistConversation(conv)` | `persistNewMessage(convId, msg, seq)` |
| `updateMessages` | `persistConversation(conv)` | `persistMessageReplace(convId, msgs)` |
| `deleteUserMessage` | `persistConversation(conv)` | `persistMessageReplace(convId, msgs)` |
| `deleteAgentLoop` | `persistConversation(conv)` | `persistMessageReplace(convId, msgs)` |
| `updateTitle` | `persistConversation(conv)` | `persistConversationMeta(conv)` |
| `runAgent` streaming | `persistConversation(conv)` × N | Debounce → `persistMessageReplace` |
| `finalizeRun` | `persistConversation(conv)` | `persistConversationMeta(conv)` + `persistMessageReplace` |
| `createNew` | `persistConversation(conv)` | `persistMessageReplace(convId, msgs)` |
| `loadFromDB` | `repo.findAll()` 含 messages_json | `repo.findAllMeta()` + `messageRepo.findByConversation()` |

---

## 数据迁移

### Migration 脚本（version 5）

```sql
-- 1. 创建 messages 表
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content_json TEXT NOT NULL DEFAULT 'null',
    meta_json TEXT,
    timestamp INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_conv_seq ON messages(conversation_id, seq);

-- 2. 从 messages_json 拆分行
-- 这一步需要在 Worker 中用 JS 完成（SQLite 缺少 JSON_TABLE）

-- 3. 删除 conversations.messages_json 列
-- SQLite 不支持 DROP COLUMN（3.35.0 之前）
-- 方案：重建 conversations 表
```

### 迁移策略

由于 SQLite 不直接支持 `DROP COLUMN`（需 3.35.0+ 且 WASM 版本不确定），有两种方案：

**方案 A：保留 messages_json 列，不再写入**
- 迁移后 `messages_json` 保留为空 `[]`
- 代码层不再读取此列
- 最简单、零风险

**方案 B：重建表**
- `ALTER TABLE conversations RENAME TO conversations_old;`
- `CREATE TABLE conversations (...)`（不含 messages_json）
- `INSERT INTO conversations SELECT id, title, ... FROM conversations_old;`
- `DROP TABLE conversations_old;`
- 更干净但有锁表风险

**推荐方案 A**——保留列，不再使用。未来可以在确认稳定后再清理。

### 迁移执行（在 Worker 中）

```typescript
// migrations/index.ts 新增 version 5
{
  version: 5,
  name: 'extract_messages_to独立_table',
  up: `
    CREATE TABLE IF NOT EXISTS messages (...);
    CREATE INDEX IF NOT EXISTS idx_messages_conv_seq ON messages(conversation_id, seq);
    PRAGMA user_version = 5;
  `
}
```

但实际的行拆分（从 JSON blob 到独立行）需要在 Worker 中用 JS 逻辑完成：

```typescript
// 在 initializeSchema 之后，检查是否需要迁移数据
async function migrateMessagesToTable(db: any) {
  // 检查 messages 表是否已有数据（避免重复迁移）
  const count = db.exec('SELECT COUNT(*) FROM messages')
  if (count > 0) return

  // 读取所有对话的 messages_json
  const rows = db.exec({
    sql: 'SELECT id, messages_json FROM conversations',
    returnValue: 'resultRows',
    rowMode: 'object',
  })

  for (const row of rows) {
    const messages = JSON.parse(row.messages_json || '[]')
    // 逐条 INSERT 到 messages 表
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      db.exec({
        sql: `INSERT OR IGNORE INTO messages (id, conversation_id, role, content_json, meta_json, timestamp, seq)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          msg.id,
          row.id,
          msg.role,
          JSON.stringify(msg.content),
          JSON.stringify({ /* meta fields */ }),
          msg.timestamp,
          i,
        ],
      })
    }
  }
}
```

---

## 性能对比

### 发消息（追加 1 条）

| 操作 | 当前 | 改造后 |
|------|------|--------|
| `JSON.stringify` | 全部消息（O(n)） | 无（仅序列化 1 条消息的字段） |
| SQL | 1 次 UPSERT（整个 JSON） | 1 次 INSERT（1 行） |
| 主线程阻塞 | 随消息数线性增长 | **恒定，与对话长度无关** |

### Agent 运行（streaming 更新）

| 操作 | 当前 | 改造后 |
|------|------|--------|
| 每次更新 | 全量序列化 + UPSERT | 仅更新 1 行的 `content_json` + `meta_json` |
| 频率 | 每个 token 都可能触发 | 每个 token 都可能触发，但单次开销恒定 |
| Debounce 效果 | 减少写入次数但仍全量 | 减少写入次数且单次开销小 |

### 加载对话列表

| 操作 | 当前 | 改造后 |
|------|------|--------|
| 列表页 | `findAll()` 反序列化所有对话的全部消息 | `findAllMeta()` 只读元数据（轻量） |
| 进入对话 | 消息已在内存 | `findByConversation()` 按需加载 |

### 预估提升

- 50 条消息的对话：发消息延迟从 ~50ms 降至 ~5ms
- 200 条消息的对话：发消息延迟从 ~200ms 降至 ~5ms
- 对话列表加载：不再反序列化所有消息，启动速度提升明显

---

## 风险与回退

### 风险

1. **迁移耗时**：消息很多的用户首次升级时迁移需要时间
   - 缓解：后台迁移 + 进度提示，不阻塞使用
2. **事务一致性**：消息表和对话表需要在同一事务中操作
   - 缓解：`replaceall` 和删除操作用事务包裹
3. **Cascade 删除**：`ON DELETE CASCADE` 需要确保 `PRAGMA foreign_keys = ON`
   - 已在建表 SQL 中设置

### 回退方案

如果迁移后发现问题：
1. `messages_json` 列仍保留在 conversations 表（方案 A）
2. 可以回退代码到读取 `messages_json` 的版本
3. 新版本运行期间会同时写入 messages 表和（可选的）messages_json 列作为安全网

---

## 实施步骤

1. **Migration**：新增 `messages` 表（version 5），编写数据迁移逻辑
2. **MessageRepository**：新建 `message.repository.ts`，实现 CRUD
3. **ConversationRepository**：`save()` 不再接受 `messages` 参数
4. **Store 改造**：替换 15 个 `persistConversation` 调用点为细粒度函数
5. **加载改造**：`loadFromDB` 改为先读元数据再按需加载消息
6. **测试**：迁移正确性、性能基准、回退验证
7. **清理**：确认稳定后移除 `messages_json` 相关代码
