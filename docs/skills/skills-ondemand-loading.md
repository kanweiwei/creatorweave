# Skills 按需加载功能需求文档

## 一、背景分析

### 1.1 当前实现方式

**现有流程**：
1. 用户发送消息 → `injectSkills()` 被调用
2. `matchSkills()` 根据关键词/标签/类别匹配 skills
3. 直接将匹配到的 skill 完整内容（instruction + examples）注入到 system prompt
4. LLM 获得完整的 skill 指令

**存在问题**：
- **Token 浪费**：完整的 skill 内容被注入，但 LLM 可能只需要部分信息
- **被动匹配**：系统决定哪些 skill 有用，而不是 LLM 自主判断
- **后续调用未处理**：只在用户消息后的第一次 LLM 调用时注入，tool_result 后的调用未处理

### 1.2 OpenSkills 参考设计

**OpenSkills 核心机制**：

```xml
<available_skills>
<skill>
  <name>pdf</name>
  <description>Comprehensive PDF manipulation toolkit...</description>
  <location>project</location>
</skill>
</available_skills>
```

**关键点**：
- **渐进式披露 (Progressive Disclosure)**：只列出 skill 元数据，不注入完整内容
- **按需加载**：通过 `npx openskills read <skill-name>` 命令按需读取
- **文件系统依赖**：依赖本地文件系统和 CLI 工具

### 1.3 浏览器环境差异

**限制**：
- 无法提供文件路径让 LLM 直接读取
- 没有 CLI 工具可用
- 需要通过 **Tool Calling** 机制实现按需加载

## 二、需求描述

### 2.1 核心需求

**目标**：将 skill 的完整内容注入改为"元数据列表 + 按需加载工具"的两阶段模式

1. **可用技能列表注入**：注入 `<available_skills>` 元数据块而非完整内容
2. **read_skill 工具设计**：让 LLM 可以主动调用工具加载 skill 内容
3. **索引匹配增强**：保留现有匹配逻辑，作为"推荐提示"告知 LLM
4. **多轮对话支持**：在 tool_result 后的调用中也要注入 skills 信息

### 2.2 详细需求

#### 2.2.1 Available Skills 注入格式

```xml
<skills_system priority="1">

## Available Skills

<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively.

How to use skills:
- Use the read_skill tool to load the full skill content
- The skill content will provide detailed instructions on how to complete the task
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context

Recommended skills: code-review, debugging, refactoring
</usage>

<available_skills>
<skill>
<name>code-review</name>
<displayName>Code Review</displayName>
<description>Systematic code review with focus on quality, security, and maintainability...</description>
<category>code-review</category>
<tags>review,quality,feedback</tags>
<triggers>
  <keywords>review,pr,feedback,inspect</keywords>
  <fileExtensions>.ts,.tsx,.js,.jsx</fileExtensions>
</triggers>
</skill>
<!-- ... more skills ... -->
</available_skills>

</skills_system>
```

**推荐列表规则**：
- 使用内联方式，放在 `<usage>` 块末尾
- 格式：`Recommended skills: skill1, skill2, skill3`
- Agent Loop 中只累加，不覆盖（维护会话级 Set）
- 不显示匹配度和匹配原因

#### 2.2.2 read_skill 工具定义

```typescript
{
  name: "read_skill",
  description: "Load the full content of a skill by its name. Use this when you need detailed instructions for a task that matches a skill's description.",
  parameters: {
    type: "object",
    properties: {
      skill_name: {
        type: "string",
        description: "The name of the skill to load (e.g., 'code-review', 'debugging')",
        enum: ["code-review", "debugging", "testing", "refactoring", ...] // 动态生成
      }
    },
    required: ["skill_name"]
  }
}
```

**工具返回格式**：
```
Reading: code-review
Base directory: [虚拟路径，用于资源解析]

[完整的 SKILL.md 内容]

Available Resources:
- references/api-docs.md (available, 1240 bytes)
- references/best-practices.md (available, 856 bytes)
- scripts/analyze.py (available, 2340 bytes)

Use read_skill_resource to load any resource.

Skill read: code-review
```

**错误处理**：
- Skill 不存在：`Error: Skill 'xxx' not found. Available skills: code-review, debugging, ...`
- 数据库失败：`Error: Failed to load skill 'xxx'. Please try again.`
- 大小写不敏感：`read_skill("Code-Review")` 和 `read_skill("code-review")` 等价

#### 2.2.3 索引匹配增强功能

保留现有的 `matchSkills()` 逻辑，结果用于：

1. **生成推荐列表**：将匹配到的 skills 添加到 `<usage>` 块的推荐行
2. **累加策略**：Agent Loop 中维护 Set，只新增不重复
3. **全部显示**：所有匹配到的 skills 都显示在推荐列表中

```xml
Recommended skills: code-review, debugging, refactoring
```

**推荐累加示例**：
```
第1轮用户消息: "帮我审查代码" → 推荐: code-review
第2轮用户消息: "发现一个 bug" → 推荐: code-review, debugging
第3轮用户消息: "重构一下"   → 推荐: code-review, debugging, refactoring
```

#### 2.2.4 多轮对话 Skill 注入

**场景**：用户消息 → LLM 调用工具 → 工具返回 → LLM 继续生成

**需求**：在 tool_result 后的新 LLM 调用中，检查是否有新的相关 skills

**实现方式**：
- 维护会话级 `Set<string> recommendedSkills`
- 每次用户消息后运行 `matchSkills()`，将新匹配的 skills 添加到 Set
- 将 Set 内容格式化为推荐列表：`Recommended skills: skill1, skill2, skill3`
- 不移除已推荐的 skills（只增不减）

### 2.3 数据结构

#### 2.3.1 Skill 元数据（SkillMetadata）

```typescript
interface SkillMetadata {
  id: string
  name: string              // 简短名称，用于工具调用
  displayName: string       // 显示名称
  description: string        // 简短描述（80-120字符）
  category: SkillCategory
  tags: string[]
  triggers: SkillTrigger
  enabled: boolean
  // 移除：instruction, examples, templates（这些按需加载）
}
```

#### 2.3.2 完整 Skill 数据（Skill）

```typescript
interface Skill extends SkillMetadata {
  instruction: string        // 主要指令内容
  examples?: string          // 示例
  templates?: string         // 模板片段
  resources?: SkillResource[] // 关联资源（文件路径等）
}
```

## 三、实现计划

### 3.1 Phase 1: 数据结构改造

1. 分离 `SkillMetadata` 和 `Skill`
2. 更新 `skill-storage.sqlite.ts` 支持分别获取元数据和完整内容
3. 更新 `skill-manager.ts` 的缓存策略

### 3.2 Phase 2: 注入逻辑重构

1. 修改 `buildAvailableSkillsBlock()` 生成元数据 XML
2. 添加 `buildRecommendedSkillsList()` 基于匹配生成推荐
3. 更新 `injectSkills()` 使用新格式

### 3.3 Phase 3: Tool 实现

1. 在 `tool-registry.ts` 中注册 `read_skill` 工具
2. 实现 `executeReadSkill()` 函数
3. 动态生成工具定义的 enum 列表

### 3.4 Phase 4: 多轮支持

1. 在 agent-loop 中每次调用 LLM 前判断是否需要更新 skills
2. 添加 `shouldRefreshSkills()` 上下文判断函数
3. 优化性能，避免重复计算

## 四、技术细节

### 4.1 Tool 枚举动态生成

```typescript
function generateReadSkillTool(enabledSkills: SkillMetadata[]): Tool {
  return {
    name: "read_skill",
    description: "Load the full content of a skill by its name...",
    parameters: {
      type: "object",
      properties: {
        skill_name: {
          type: "string",
          description: "The name of the skill to load",
          enum: enabledSkills.map(s => s.name) // 动态枚举
        }
      },
      required: ["skill_name"]
    }
  }
}
```

### 4.2 Skill 内容加载

```typescript
async function executeReadSkill(params: { skill_name: string }): Promise<string> {
  // 大小写不敏感匹配
  const skillName = params.skill_name.toLowerCase()
  const skill = await storage.getSkillByName(skillName)

  if (!skill) {
    const availableSkills = await storage.getAllEnabledSkillNames()
    return `Error: Skill '${params.skill_name}' not found. Available skills: ${availableSkills.join(', ')}`
  }

  // 获取关联资源
  const resources = await storage.getSkillResources(skill.id)

  // 格式化资源列表
  let resourcesSection = ''
  if (resources.length > 0) {
    resourcesSection = '\n\nAvailable Resources:\n'
    for (const r of resources) {
      resourcesSection += `- ${r.resourcePath} (${r.size} bytes)\n`
    }
    resourcesSection += '\nUse read_skill_resource to load any resource.'
  }

  // 格式化为 OpenSkills 风格
  return `Reading: ${skill.name}
Base directory: [skill base path]

${skill.instruction}

${skill.examples ? `### Examples\n${skill.examples}` : ''}${resourcesSection}

Skill read: ${skill.name}`
}
```

### 4.3 性能优化

1. **元数据缓存**：元数据常驻内存，完整内容按需加载
2. **最近使用记录**：记录最近加载的 skills，避免重复加载
3. **增量更新**：skills 变更时只更新必要的部分

## 五、Skill 资源处理

### 5.1 Skill 目录结构

**OpenSkills 标准结构**：
```
my-skill/
├── SKILL.md           # 主定义文件
├── references/       # 参考文档
│   ├── api-docs.md
│   └── best-practices.md
├── scripts/          # 可执行脚本
│   ├── analyze.py
│   └── check.sh
└── assets/           # 资源文件
    ├── templates/
    └── examples/
```

### 5.2 存储策略

由于浏览器环境的限制，需要将资源文件内容存储到数据库中：

**方案：新增 skill_resources 表**

```sql
CREATE TABLE IF NOT EXISTS skill_resources (
    id TEXT PRIMARY KEY,              -- 格式: {skill_id}:{resource_path}
    skill_id TEXT NOT NULL,          -- 关联的 skill ID
    resource_path TEXT NOT NULL,    -- 相对路径: "references/api-docs.md"
    resource_type TEXT NOT NULL,    -- 'reference' | 'script' | 'asset'
    content TEXT NOT NULL,          -- 文件内容
    content_type TEXT,               -- MIME type: 'text/markdown', 'text/x-python', etc.
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_resources_skill_id ON skill_resources(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_resources_type ON skill_resources(resource_type);
```

### 5.3 扫描逻辑改造

**当前问题**：
- `skill-scanner.ts` 只扫描 SKILL.md
- 资源文件被忽略

**改造方案**：

```typescript
async function scanSkillDirectory(
  skillDirHandle: FileSystemDirectoryHandle,
  skillId: string
): Promise<{ resources: SkillResource[]; errors: string[] }> {
  const resources: SkillResource[] = []
  const errors: string[] = []

  // 扫描标准目录
  const resourceDirs = ['references', 'scripts', 'assets']

  for (const dirName of resourceDirs) {
    const dirHandle = await resolveDirectory(skillDirHandle, [dirName])
    if (!dirHandle) continue

    await scanResourceDirectory(dirHandle, dirName, skillId, resources, errors)
  }

  return { resources, errors }
}

async function scanResourceDirectory(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string,
  skillId: string,
  resources: SkillResource[],
  errors: string[]
): Promise<void> {
  for await (const [name, entry] of dirHandle.entries()) {
    const resourcePath = `${basePath}/${name}`

    if (entry.kind === 'directory') {
      // 递归扫描子目录
      const subDirHandle = await dirHandle.getDirectoryHandle(name)
      await scanResourceDirectory(subDirHandle, resourcePath, skillId, resources, errors)
    } else {
      // 读取文件内容
      try {
        const file = await entry.getFile()
        const content = await file.text()

        resources.push({
          id: `${skillId}:${resourcePath}`,
          skillId,
          resourcePath,
          resourceType: getResourceType(basePath),
          content,
          contentType: getMimeType(name)
        })
      } catch (e) {
        errors.push(`${resourcePath}: ${e}`)
      }
    }
  }
}
```

### 5.4 read_skill 工具增强

当 LLM 调用 `read_skill` 时，返回的内容需要包含相关资源：

```typescript
async function executeReadSkill(params: { skill_name: string }): Promise<string> {
  const skill = await storage.getSkillByName(params.skill_name)
  if (!skill) {
    return `Error: Skill '${params.skill_name}' not found`
  }

  // 获取关联资源
  const resources = await storage.getSkillResources(skill.id)

  // 格式化为 OpenSkills 风格
  let output = `Reading: ${skill.name}
Base directory: [skill base path]

${skill.instruction}

${skill.examples ? `### Examples\n${skill.examples}` : ''}`

${resources.length > 0 ? `### Resources\n` + formatResources(resources) : ''}

Skill read: ${skill.name}`

  return output
}

function formatResources(resources: SkillResource[]): string {
  // 按资源类型分组显示
  const byType = groupBy(resources, 'resourceType')

  let output = ''
  for (const [type, items] of Object.entries(byType)) {
    output += `\n#### ${type}\n`
    for (const item of items) {
      output += `- \`${item.resourcePath}\`: ${getItemDescription(item)}\n`
      if (item.content.length < 500) {
        // 小文件直接内联内容
        output += `\n\`\`\`\n${item.content}\n\`\`\`\n`
      } else {
        // 大文件提示可用，不内联
        output += ` (available, ${item.content.length} bytes)\n`
      }
    }
  }
  return output
}
```

### 5.5 资源限制

**安全限制**（防止资源滥用）：

| 限制项 | 阈值 |
|--------|------|
| 单个资源文件最大大小 | 5MB |
| 单个 skill 最大资源数量 | 50 个 |
| 单个 skill 资源总大小 | 20MB |
| 资源加载超时 | 3 秒 |

**超限处理**：
- 超过大小限制：返回错误，不加载该资源
- 超过数量限制：只加载前 50 个资源
- 加载超时：返回已加载的资源 + 超时提示

### 5.6 资源大小策略

为了避免 token 浪费，需要制定资源加载策略：

**重要**：SKILL.md 的内容（instruction + examples）**完整加载**，不受阈值限制。阈值只适用于 `references/`、`scripts/`、`assets/` 中的资源文件。

| 资源类型 | 大小 | 处理方式 |
|---------|------|---------|
| SKILL.md | 任意 | 完整加载到 read_skill 返回中 |
| 资源文件 | < 500 字符 | 直接内联到 read_skill 返回中 |
| 资源文件 | 500 - 2000 字符 | 显示摘要 + 完整内容可用 |
| 资源文件 | > 2000 字符 | 只显示元数据，需要时可用 `read_skill_resource` 工具读取 |

### 5.7 资源显示策略

**read_skill 返回格式中的资源部分**：

```
Available Resources:
- references/api-docs.md (1240 bytes)
- references/best-practices.md (856 bytes)
- scripts/analyze.py (2340 bytes)

Use read_skill_resource to load any resource.
```

**设计要点**：
- 所有资源都显示在列表中，不占用太多 token
- 不区分大小，统一显示元数据格式
- LLM 可以根据资源名称和大小决定是否需要读取
- 使用 `read_skill_resource` 工具获取完整内容

### 5.8 read_skill_resource 工具

用于读取单个资源的完整内容：

```typescript
{
  name: "read_skill_resource",
  description: "Read a specific resource file from a skill (reference, script, or asset).\n\nAvailable resources are listed when you call read_skill.",
  parameters: {
    type: "object",
    properties: {
      skill_name: {
        type: "string",
        description: "The skill that owns this resource"
      },
      resource_path: {
        type: "string",
        description: "The path to the resource (e.g., 'references/api-docs.md', 'scripts/analyze.py')"
      }
    },
    required: ["skill_name", "resource_path"]
  }
}
```

**返回格式**：
```
Resource: code-review/references/api-docs.md

[完整的文件内容]
```

### 5.9 数据结构更新

```typescript
interface SkillMetadata {
  id: string
  name: string
  displayName: string
  description: string
  category: SkillCategory
  tags: string[]
  triggers: SkillTrigger
  enabled: boolean
  resourceCount?: number  // 资源文件数量，用于 UI 显示
}

interface Skill extends SkillMetadata {
  instruction: string
  examples?: string
  templates?: string
  // 移除 resources（改为独立表）
}

interface SkillResource {
  id: string
  skillId: string
  resourcePath: string         // 相对路径
  resourceType: 'reference' | 'script' | 'asset'
  content: string              // 文件内容
  contentType: string         // MIME type
  size: number                // 字节大小（用于判断是否内联）
}
```

## 六、实现计划

### 6.1 Phase 1: 数据结构改造

1. 分离 `SkillMetadata` 和 `Skill`
2. 创建 `skill_resources` 表
3. 更新 `skill-storage.sqlite.ts` 支持资源存储
4. 更新 `skill-scanner.ts` 扫描资源文件
5. 更新 `skill-manager.ts` 的缓存策略

### 6.2 Phase 2: 注入逻辑重构

1. 修改 `buildAvailableSkillsBlock()` 生成元数据 XML
2. 添加 `buildRecommendedSkillsList()` 基于匹配生成推荐
3. 更新 `injectSkills()` 使用新格式

### 6.3 Phase 3: Tool 实现

1. 在 `tool-registry.ts` 中注册 `read_skill` 工具
2. 实现 `executeReadSkill()` 函数，包含资源格式化
3. 动态生成工具定义的 enum 列表
4. 实现 `read_skill_resource` 工具，用于读取大型资源文件

### 6.4 Phase 4: 多轮支持

1. 在 SkillManager 中维护会话级 `recommendedSkills: Set<string>`
2. 每次用户消息后调用 `matchSkills()`，将新匹配的添加到 Set
3. 更新 `buildAvailableSkillsBlock()` 使用 Set 生成推荐列表
4. 优化性能：缓存已匹配的上下文，避免重复计算

## 七、已确认的设计决策

### 8.1 Skill 资源处理

**Q: Skill 可以引用项目中的文件吗？**

**A: 不支持**，skill 必须自包含。
- 简化实现，避免文件路径管理的复杂性
- skill 目录与项目解耦，更易于复用
- 如需引用项目内容，可以复制到 skill 目录

### 8.2 Builtin Skills 资源

**Q: 内置技能（code-review、test-generation 等）的资源如何处理？**

**A: 硬编码在 instruction 中**
- 内置技能在 `web/src/skills/builtin-skills.ts` 中定义
- `instruction` 和 `examples` 直接写在代码中
- 初始化时保存到数据库，没有额外的资源文件

### 8.3 缓存策略

**Q: 已加载的 Skill 如何缓存？**

**A: 会话级缓存**
- 使用 `Map<string, Skill>` 在内存中缓存已加载的 skills
- 避免重复从数据库读取
- 缓存键为 skill name 或 id

### 8.4 向后兼容

**Q: 是否保留旧的直接注入模式？**

**A: 完全替换**
- 移除旧的 `injectSkills()` 直接注入逻辑
- 全面采用 `<available_skills>` + `read_skill` 工具模式

### 8.5 多轮对话推荐策略

**Q: 多轮对话中推荐列表如何更新？**

**A: 累加策略，只增不减**
- 维护会话级 `Set<string> recommendedSkills`
- 每次用户消息后运行 `matchSkills()`，新匹配的添加到 Set
- 推荐列表格式：`Recommended skills: skill1, skill2, skill3`
- 不显示匹配度和匹配原因

**示例**：
```
第1轮: "帮我审查代码"     → 推荐: code-review
第2轮: "发现一个 bug"     → 推荐: code-review, debugging
第3轮: "重构一下"         → 推荐: code-review, debugging, refactoring
```

### 8.6 Tool 优先级

**Q: read_skill 工具是否应该在其他工具之前调用？**

**A: 无特殊优先级**
- LLM 根据任务自主判断何时调用 read_skill
- 通过推荐列表提示高优先级 skills
- 不强制调用顺序

### 8.7 错误处理策略

**Q: read_skill 失败时如何处理？**

**A: 返回清晰的错误消息**
```
Error: Skill 'xxx' not found. Available skills: code-review, debugging, ...
Error: Failed to load skill 'xxx'. Please try again.
```
- Skill 不存在：列出可用的 skills
- 数据库失败：提示重试
- 资源超时：返回已加载部分 + 超时提示

### 8.8 资源限制阈值

**Q: 如何防止资源滥用？**

**A: 设置资源限制**
| 限制项 | 阈值 |
|--------|------|
| 单个资源文件 | 5MB |
| 单个 skill 资源数 | 50 个 |
| 单个 skill 总大小 | 20MB |
| 资源加载超时 | 3 秒 |

### 8.9 资源列表显示

**Q: read_skill 返回时如何处理资源列表？**

**A: 统一显示元数据列表**
```
Available Resources:
- references/api-docs.md (1240 bytes)
- scripts/analyze.py (2340 bytes)

Use read_skill_resource to load any resource.
```
- 所有资源都显示，不区分大小
- 不内联资源内容
- LLM 自行决定是否需要读取

### 8.10 大小写敏感性

**Q: 技能名称是否区分大小写？**

**A: 大小写不敏感**
- `read_skill("Code-Review")` 等同于 `read_skill("code-review")`
- 内部统一转换为小写匹配

### 8.11 推荐列表上限

**Q: 推荐列表是否需要限制数量？**

**A: 不限制**
- 所有匹配到的 skills 都显示
- 匹配逻辑本身会过滤无关 skills
- 用户可禁用不需要的 skills
