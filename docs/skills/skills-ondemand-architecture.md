# Skills 按需加载 - 架构设计方案

## 一、当前架构分析

### 1.1 现有流程

```
┌─────────────────┐
│  User Message   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│   AgentLoop.injectSkills │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ SkillManager.getEnhanced... │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────┐
│   matchSkills()         │ ← 匹配算法（关键词/标签/类别）
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│   buildSkillsPrompt()   │ ← 注入完整 skill 内容
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  System Prompt (完整)   │ ← Token 浪费
└─────────────────────────┘
```

### 1.2 存在的问题

| 问题 | 影响 |
|------|------|
| Token 浪费 | 完整 skill 内容注入，但 LLM 可能只用一部分 |
| 被动匹配 | 系统决定哪些 skill 有用，不是 LLM 自主判断 |
| 后续调用未处理 | tool_result 后的新调用没有重新匹配 |
| 资源文件未支持 | skill 目录的 references/ 等被忽略 |

---

## 二、目标架构

### 2.1 新流程

```
┌─────────────────┐
│  User Message   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│  AgentLoop (每次用户消息)    │
└────────┬────────────────────┘
         │
         ├──> matchSkills() → 更新 recommendedSkills Set
         │
         ▼
┌─────────────────────────────┐
│ buildAvailableSkillsBlock() │ ← 只注入元数据 + 推荐
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  <skills_system> XML 块             │
│  - <usage> 使用说明                 │
│  - Recommended skills: xxx, yyy    │ ← 累加推荐列表
│  - <available_skills> 元数据列表   │ ← 不包含完整内容
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  System Prompt + Tools  │ ← 注册 read_skill 工具
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│   LLM 自主决策          │
│   "需要 code-review"     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 调用 read_skill 工具    │ ← 按需加载
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 返回完整 skill 内容     │
│ + 资源列表              │
└─────────────────────────┘
```

---

## 三、数据结构设计

### 3.1 类型定义（skill-types.ts 扩展）

```typescript
// ============ 现有类型（保持不变） ============
interface SkillMetadata {
  id: string
  name: string
  version: string
  description: string
  author: string
  category: SkillCategory
  tags: string[]
  source: SkillSource
  triggers: SkillTrigger
  enabled: boolean
  createdAt: number
  updatedAt: number
}

interface Skill extends SkillMetadata {
  instruction: string
  examples?: string
  templates?: string
}

// ============ 新增类型 ============

/** Skill 资源文件 */
interface SkillResource {
  id: string                // 格式: {skill_id}:{resource_path}
  skillId: string
  resourcePath: string      // 相对路径: "references/api-docs.md"
  resourceType: ResourceType
  content: string           // 文件内容
  contentType: string       // MIME type
  size: number              // 字节大小
  createdAt: number
}

/** 资源类型 */
type ResourceType = 'reference' | 'script' | 'asset'

/** 会话级推荐状态 */
interface SessionSkillState {
  /** 已推荐的 skills（累加） */
  recommendedSkills: Set<string>
  /** 已加载的 skills（缓存） */
  loadedSkills: Map<string, Skill>
}

/** 工具执行上下文 */
interface SkillToolContext {
  skillManager: SkillManager
  skillStorage: typeof import('./skill-storage')
}
```

### 3.2 数据库表设计

```sql
-- 现有 skills 表（保持不变）
CREATE TABLE IF NOT EXISTS skills (...);

-- 新增：skill_resources 表
CREATE TABLE IF NOT EXISTS skill_resources (
    id TEXT PRIMARY KEY,                    -- {skill_id}:{resource_path}
    skill_id TEXT NOT NULL,                -- 关联的 skill ID
    resource_path TEXT NOT NULL,           -- 相对路径
    resource_type TEXT NOT NULL,           -- 'reference' | 'script' | 'asset'
    content TEXT NOT NULL,                 -- 文件内容
    content_type TEXT,                     -- MIME type
    size INTEGER NOT NULL,                 -- 字节大小
    created_at INTEGER NOT NULL,
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_resources_skill_id ON skill_resources(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_resources_type ON skill_resources(resource_type);

-- 新增：按名称查询的索引（大小写不敏感）
CREATE INDEX IF NOT EXISTS idx_skills_name_lower ON skills(lower(name));
```

---

## 四、组件设计

### 4.1 新增文件

```
web/src/skills/
├── skill-resources.ts          # 新增：资源处理模块
├── skill-tools.ts              # 新增：read_skill 工具
└── skill-injection.ts          # 新增：注入逻辑重构

web/src/agent/
├── agent.ts                    # 修改：添加会话状态
└── agent-loop.ts               # 修改：集成新的注入逻辑
```

### 4.2 修改文件

| 文件 | 修改内容 |
|------|---------|
| `skill-manager.ts` | 添加会话状态管理，更新注入逻辑 |
| `skill-storage.sqlite.ts` | 添加资源相关方法 |
| `skill-scanner.ts` | 扫描资源文件 |
| `skill-matcher.ts` | 移除 MAX_INJECTED_SKILLS 限制 |
| `tool-registry.ts` | 注册 skill 工具 |

---

## 五、详细设计

### 5.1 资源处理模块（skill-resources.ts）

```typescript
/**
 * Skill Resources - 资源文件处理
 */

import type { SkillResource, ResourceType } from './skill-types'

/** 资源限制配置 */
export const RESOURCE_LIMITS = {
  MAX_FILE_SIZE: 5 * 1024 * 1024,      // 5MB
  MAX_RESOURCES_PER_SKILL: 50,
  MAX_TOTAL_SIZE: 20 * 1024 * 1024,    // 20MB
  LOAD_TIMEOUT: 3000,                   // 3秒
} as const

/** 获取资源类型 */
export function getResourceType(dirName: string): ResourceType {
  if (dirName === 'references') return 'reference'
  if (dirName === 'scripts') return 'script'
  return 'asset'
}

/** 获取 MIME 类型 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    md: 'text/markdown',
    txt: 'text/plain',
    py: 'text/x-python',
    js: 'text/javascript',
    ts: 'text/typescript',
    sh: 'text/x-shellscript',
    json: 'application/json',
    yaml: 'text/x-yaml',
    yml: 'text/x-yaml',
  }
  return mimeTypes[ext || ''] || 'text/plain'
}

/** 格式化资源列表 */
export function formatResourceList(resources: SkillResource[]): string {
  if (resources.length === 0) return ''

  let output = '\n\nAvailable Resources:\n'
  for (const r of resources) {
    output += `- ${r.resourcePath} (${r.size} bytes)\n`
  }
  output += '\nUse read_skill_resource to load any resource.'
  return output
}
```

### 5.2 Skill 工具（skill-tools.ts）

```typescript
/**
 * Skill Tools - read_skill 和 read_skill_resource 工具定义和执行器
 */

import type { ToolDefinition, ToolExecutor, ToolContext } from '../tools/tool-types'
import type { Skill, SkillResource } from './skill-types'
import * as storage from './skill-storage'

// ============================================================================
// read_skill 工具
// ============================================================================

/** 动态生成 read_skill 工具定义 */
export function generateReadSkillTool(enabledSkills: string[]): ToolDefinition {
  return {
    function: {
      name: 'read_skill',
      description: 'Load the full content of a skill by its name. Use this when you need detailed instructions for a task that matches a skill\'s description.',
      parameters: {
        type: 'object',
        properties: {
          skill_name: {
            type: 'string',
            description: 'The name of the skill to load (e.g., "code-review", "debugging")',
            enum: enabledSkills,
          },
        },
        required: ['skill_name'],
      },
    },
  }
}

/** read_skill 执行器 */
export const readSkillExecutor: ToolExecutor = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<string> => {
  const { skill_name } = args as { skill_name: string }

  // 大小写不敏感匹配
  const skillName = skill_name.toLowerCase()
  const skill = await storage.getSkillByName(skillName)

  if (!skill) {
    const availableSkills = await storage.getAllEnabledSkillNames()
    return `Error: Skill '${skill_name}' not found. Available skills: ${availableSkills.join(', ')}`
  }

  // 获取关联资源
  const resources = await storage.getSkillResources(skill.id)

  // 格式化输出
  let output = `Reading: ${skill.name}
Base directory: [skill base path]

${skill.instruction}

${skill.examples ? `### Examples\n${skill.examples}` : ''}`

  if (resources.length > 0) {
    const { formatResourceList } = await import('./skill-resources')
    output += formatResourceList(resources)
  }

  output += `\nSkill read: ${skill.name}`

  return output
}

// ============================================================================
// read_skill_resource 工具
// ============================================================================

/** read_skill_resource 工具定义（固定） */
export const readSkillResourceDefinition: ToolDefinition = {
  function: {
    name: 'read_skill_resource',
    description: 'Read a specific resource file from a skill (reference, script, or asset).\n\nAvailable resources are listed when you call read_skill.',
    parameters: {
      type: 'object',
      properties: {
        skill_name: {
          type: 'string',
          description: 'The skill that owns this resource',
        },
        resource_path: {
          type: 'string',
          description: 'The path to the resource (e.g., "references/api-docs.md", "scripts/analyze.py")',
        },
      },
      required: ['skill_name', 'resource_path'],
    },
  },
}

/** read_skill_resource 执行器 */
export const readSkillResourceExecutor: ToolExecutor = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<string> => {
  const { skill_name, resource_path } = args as { skill_name: string; resource_path: string }

  // 大小写不敏感匹配
  const skillName = skill_name.toLowerCase()
  const skill = await storage.getSkillByName(skillName)

  if (!skill) {
    return `Error: Skill '${skill_name}' not found`
  }

  // 获取资源
  const resource = await storage.getSkillResource(skill.id, resource_path)

  if (!resource) {
    const available = await storage.getSkillResources(skill.id)
    const availablePaths = available.map(r => r.resourcePath).join(', ')
    return `Error: Resource '${resource_path}' not found in skill '${skill_name}'.\nAvailable resources: ${availablePaths}`
  }

  return `Resource: ${skill_name}/${resource_path}

${resource.content}`
}
```

### 5.3 Agent 扩展（添加会话状态）

```typescript
/**
 * Agent 类扩展 - 添加会话级技能状态
 *
 * 放在 Agent 实例中，每个对话独立
 */

// 在 agent.ts 或 agent-loop.ts 中添加

class Agent {
  // ... 现有属性 ...

  /** 会话级推荐技能状态 */
  private recommendedSkills = new Set<string>()

  /** 更新推荐列表（在每次用户消息后调用） */
  updateRecommendedSkills(matches: Array<{ name: string }>): void {
    for (const match of matches) {
      this.recommendedSkills.add(match.name.toLowerCase())
    }
  }

  /** 获取推荐列表字符串 */
  getRecommendedSkillsString(): string {
    const list = Array.from(this.recommendedSkills)
    if (list.length === 0) return ''
    return `Recommended skills: ${list.join(', ')}`
  }

  /** 清空会话状态（新对话时调用） */
  clearRecommendedSkills(): void {
    this.recommendedSkills.clear()
  }

  /** 检查 skill 是否已被推荐 */
  isSkillRecommended(skillName: string): boolean {
    return this.recommendedSkills.has(skillName.toLowerCase())
  }
}
```

**使用方式**：

```typescript
// 在 agent-loop.ts 中
class AgentLoop {
  private agent: Agent

  async handleMessage(message: string): Promise<void> {
    // 1. 匹配 skills
    const matches = matchSkillsOnly(allSkills, { userMessage: message })

    // 2. 更新推荐状态
    this.agent.updateRecommendedSkills(matches)

    // 3. 构建注入块
    const recommended = this.agent.getRecommendedSkillsString()
    const skillsBlock = buildAvailableSkillsBlock(allSkills, recommended)
    // ...
  }

  // 新对话时清空
  startNewConversation(): void {
    this.agent.clearRecommendedSkills()
  }
}
```

### 5.4 可用技能块生成（重构）

```typescript
/**
 * buildAvailableSkillsBlock - 生成 <skills_system> XML 块
 *
 * 替代原来的 buildSkillsPrompt
 */

import type { SkillMetadata } from './skill-types'
import { getRecommendedSkillsString } from './skill-injection'

export function buildAvailableSkillsBlock(
  allSkills: SkillMetadata[],
  context: SkillMatchContext
): string {
  // 先更新推荐列表
  const { matchSkillsOnly } = require('./skill-matcher')
  const { updateRecommendedSkills } = require('./skill-injection')

  const matches = matchSkillsOnly(allSkills, context)
  updateRecommendedSkills(context, allSkills)

  const recommendedString = getRecommendedSkillsString()

  // 生成 XML 块
  const skillsList = allSkills
    .filter(s => s.enabled)
    .map(skill => formatSkillMetadata(skill))
    .join('\n\n')

  return `<skills_system priority="1">

## Available Skills

<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively.

How to use skills:
- Use the read_skill tool to load the full skill content
- The skill content will provide detailed instructions on how to complete the task
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context

${recommendedString}
</usage>

<available_skills>

${skillsList}

</available_skills>

</skills_system>`
}

function formatSkillMetadata(skill: SkillMetadata): string {
  const tags = skill.tags.join(',')
  const keywords = skill.triggers.keywords.join(',')
  const fileExtensions = skill.triggers.fileExtensions?.join(',') || ''

  return `<skill>
<name>${skill.name}</name>
<displayName>${skill.name}</displayName>
<description>${skill.description}</description>
<category>${skill.category}</category>
<tags>${tags}</tags>
<triggers>
  <keywords>${keywords}</keywords>
  ${fileExtensions ? `<fileExtensions>${fileExtensions}</fileExtensions>` : ''}
</triggers>
</skill>`
}
```

---

## 六、数据库迁移

### 6.1 迁移脚本（migration.ts）

```typescript
/**
 * Skills 迁移 - 添加资源支持
 */

import { getSQLiteDB } from './sqlite-database'

export async function migrateToSkillsV2(): Promise<void> {
  const db = getSQLiteDB()

  // 创建 skill_resources 表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS skill_resources (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      resource_path TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      content TEXT NOT NULL,
      content_type TEXT,
      size INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    )
  `)

  // 创建索引
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_skill_resources_skill_id
    ON skill_resources(skill_id)
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_skill_resources_type
    ON skill_resources(resource_type)
  `)

  // 添加 name_lower 索引（大小写不敏感查询）
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_skills_name_lower
    ON skills(lower(name))
  `)
}
```

---

## 七、实现计划

### 7.1 Phase 1: 数据结构（1-2天）✅ 已完成

**任务**：
1. ✅ 扩展 `skill-types.ts` 添加新类型
2. ✅ 创建 `skill-resources.ts` 资源模块
3. ✅ SQLite schema 添加 `skill_resources` 表
4. ✅ 更新 `skill-storage.sqlite.ts` 添加资源方法

**已完成**：
- `skill-types.ts`: 添加了 `SkillResource`, `ResourceType`, `RESOURCE_LIMITS` 等类型
- `skill-resources.ts`: 资源类型检测、格式化、验证函数
- `sqlite-schema.sql`: 添加 `skill_resources` 表和索引
- `skill.repository.ts`: 添加资源 CRUD 方法
- `skill-storage.sqlite.ts`: 暴露资源相关 API

### 7.2 Phase 2: 注入重构（2-3天）✅ 已完成

**任务**：
1. ✅ 创建 `skill-injection.ts` 会话状态管理
2. ✅ 创建 `skill-tools.ts` 工具定义
3. ✅ 实现 `buildAvailableSkillsBlock()`

**已完成**：
- `skill-injection.ts`: 会话推荐状态、可用技能块生成
- `skill-tools.ts`: `read_skill` 和 `read_skill_resource` 工具定义和执行器
- `skill-manager.ts`: 更新为使用新的注入方式

### 7.3 Phase 3: Tool 集成（1-2天）✅ 已完成

**任务**：
1. ✅ 在 `tool-registry.ts` 注册 skill 工具
2. ✅ 在 `skill-manager.ts` 集成新注入逻辑
3. 添加工具执行上下文

**验证**：
- E2E 测试：LLM 可以调用 read_skill
- E2E 测试：多轮对话推荐累加

### 7.4 Phase 4: 资源扫描（1-2天）✅ 已完成

**任务**：
1. ✅ 更新 `skill-scanner.ts` 扫描资源目录
2. ✅ 实现资源大小限制检查
3. ✅ 添加资源存储到数据库

**已完成**：
- `skill-scanner.ts`: 扫描 `references/`, `scripts/`, `assets/` 目录
- 资源大小、数量、总量限制检查
- `skill-manager.ts`: 扫描时自动保存资源

---

## 八、实现总结

**实现状态**: ✅ Phase 1-4 全部完成

**新增/修改的文件**:
- `web/src/skills/skill-types.ts` - 扩展类型定义
- `web/src/skills/skill-resources.ts` - 资源处理模块
- `web/src/skills/skill-tools.ts` - read_skill 工具
- `web/src/skills/skill-injection.ts` - 注入逻辑
- `web/src/sqlite/repositories/skill.repository.ts` - 添加资源方法
- `web/src/sqlite/sqlite-schema.sql` - 添加 skill_resources 表
- `web/src/skills/skill-manager.ts` - 更新注入方式
- `web/src/skills/skill-scanner.ts` - 添加资源扫描
- `web/src/agent/tool-registry.ts` - 注册 skill 工具

**下一步**:
- [ ] Phase 5: E2E 测试和验证
- [ ] 在实际对话中测试 read_skill 工具调用
- [ ] 监控 token 使用情况，验证节省效果

---

## 九、关键决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 错误处理 | 返回清晰错误消息 | 让 LLM 知道如何应对 |
| 资源限制 | 5MB/50个/20MB/3秒 | 防止资源滥用 |
| 资源列表 | read_skill 返回中包含 | 不需要单独的 list 工具 |
| 大小写 | 不敏感 | 用户体验更好 |
| 推荐上限 | 不限制 | 匹配逻辑已过滤 |
| 多轮更新 | 累加策略 | 只增不减 |
| 向后兼容 | 完全替换 | 简化实现 |
| **会话状态** | **放在 Agent 实例中** | **每个对话独立，生命周期一致** |

---

## 九、风险和缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| LLM 不调用 read_skill | 功能无效 | 推荐列表提示 + description 说明 |
| Token 节省不明显 | 价值未体现 | 监控实际使用数据 |
| 资源文件过大 | 性能问题 | 设置大小限制 |
| 多轮累加过多 | 列表过长 | 用户可禁用 skills |

---

## 十、后续优化

1. **智能推荐**：基于实际使用率调整推荐策略
2. **技能分类**：按领域组织 skills
3. **技能依赖**：支持技能之间的引用
4. **技能版本**：支持多版本共存
5. **技能市场**：从远程仓库安装 skills
