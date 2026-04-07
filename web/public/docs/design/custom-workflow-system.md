# Custom Workflow System Design Specification

## 1. System Overview

### 1.1 Purpose
Enable users to create, edit, and manage custom AI workflows beyond the built-in templates. Users can design workflows visually in the canvas editor, configure node properties, and persist workflows locally.

### 1.2 Scope
- Workflow CRUD operations (create, read, update, delete, rename)
- Node type extension (5 basic + presets + custom)
- Local persistence (IndexedDB with localStorage fallback)
- Template selector enhancement
- Independent workflow management page

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI Layer                                 │
├─────────────────────────────────────────────────────────────────┤
│  WorkflowEditorDialog  │  WorkflowManagerPage  │  TemplateSelect │
├─────────────────────────────────────────────────────────────────┤
│                      Store Layer (Zustand)                       │
├─────────────────────────────────────────────────────────────────┤
│                    customWorkflowStore                           │
│  - workflows: Map<id, CustomWorkflow>                           │
│  - activeWorkflowId: string | null                              │
│  - actions: CRUD + import/export                                │
├─────────────────────────────────────────────────────────────────┤
│                      Storage Layer                               │
├─────────────────────────────────────────────────────────────────┤
│              WorkflowStorageAdapter                              │
│  - IndexedDB (primary)                                          │
│  - localStorage (fallback)                                      │
│  - Migration utilities                                          │
├─────────────────────────────────────────────────────────────────┤
│                    Core Types & Validation                       │
├─────────────────────────────────────────────────────────────────┤
│  CustomWorkflowTemplate, NodePreset, WorkflowValidator          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Module Structure

```
web/src/
├── agent/workflow/
│   ├── types.ts              # Extend with CustomWorkflowTemplate
│   ├── node-presets.ts       # Preset node configurations
│   ├── custom-workflow-validator.ts
│   └── ...
├── sqlite/
│   ├── repositories/
│   │   └── workflow.repository.ts  # SQLite repository (NEW)
│   ├── sqlite-schema.sql          # Add custom_workflows table
│   └── migrations/index.ts        # Add migration v4
├── store/
│   └── custom-workflow.store.ts   # Zustand store (uses repository)
├── components/agent/
│   ├── workflow-editor/      # Existing editor (enhanced)
│   └── workflow-manager/     # NEW: Management page
│       ├── WorkflowManagerPage.tsx
│       ├── WorkflowCard.tsx
│       └── WorkflowImportExport.tsx
```

---

## 3. Data Models

### 3.1 Extended Workflow Template

```typescript
// Extends existing WorkflowTemplate
interface CustomWorkflowTemplate extends WorkflowTemplate {
  // Metadata
  id: string                    // UUID v4
  name: string                  // User-defined name
  description?: string          // Optional description
  domain: WorkflowDomain | 'custom'
  createdAt: number             // Timestamp
  updatedAt: number             // Timestamp
  version: number               // For migration

  // Source tracking
  source: 'built-in' | 'user-created' | 'imported'

  // Extended node config
  nodes: CustomWorkflowNode[]
}

interface CustomWorkflowNode extends WorkflowNode {
  // Extended configuration
  modelConfig?: {
    provider?: 'glm' | 'claude' | 'openai'
    model?: string              // e.g., 'glm-4-flash', 'claude-sonnet-4'
    temperature?: number        // 0.0 - 2.0
    maxTokens?: number
  }

  // Prompt template with variables
  promptTemplate?: string       // Supports {{variable}} syntax

  // Preset reference (if derived from preset)
  presetId?: string
}
```

### 3.2 Node Presets

```typescript
interface NodePreset {
  id: string                    // e.g., 'translator', 'summarizer'
  label: string                 // Display name
  description: string
  icon: string                  // Lucide icon name

  // Default configuration
  defaultKind: WorkflowNodeKind
  defaultAgentRole: string
  defaultPromptTemplate: string
  defaultModelConfig?: ModelConfig

  // Category for organization
  category: 'basic' | 'content' | 'analysis' | 'utility'
}

// Preset definitions
const NODE_PRESETS: NodePreset[] = [
  // Basic (5 core types)
  { id: 'plan', label: '规划', category: 'basic', ... },
  { id: 'produce', label: '创作', category: 'basic', ... },
  { id: 'review', label: '审查', category: 'basic', ... },
  { id: 'repair', label: '修复', category: 'basic', ... },
  { id: 'assemble', label: '组装', category: 'basic', ... },

  // Content presets
  { id: 'translator', label: '翻译', category: 'content',
    defaultPromptTemplate: '将以下内容翻译为{{targetLanguage}}：\n{{input}}' },
  { id: 'polisher', label: '润色', category: 'content',
    defaultPromptTemplate: '润色以下文本，保持原意但提升表达：\n{{input}}' },
  { id: 'summarizer', label: '摘要', category: 'content',
    defaultPromptTemplate: '总结以下内容的要点：\n{{input}}' },
  { id: 'expander', label: '扩写', category: 'content',
    defaultPromptTemplate: '基于以下要点扩写成完整内容：\n{{input}}' },

  // Analysis presets
  { id: 'fact_checker', label: '事实核查', category: 'analysis', ... },
  { id: 'tone_analyzer', label: '语气分析', category: 'analysis', ... },

  // Utility presets
  { id: 'formatter', label: '格式化', category: 'utility', ... },
  { id: 'router', label: '路由分发', category: 'utility', ... },
]
```

### 3.3 Store State

```typescript
interface CustomWorkflowState {
  // Data
  workflows: Map<string, CustomWorkflowTemplate>
  activeWorkflowId: string | null

  // UI state
  isLoading: boolean
  error: string | null

  // Actions
  loadWorkflows: () => Promise<void>
  saveWorkflow: (workflow: CustomWorkflowTemplate) => Promise<void>
  deleteWorkflow: (id: string) => Promise<void>
  renameWorkflow: (id: string, newName: string) => Promise<void>
  duplicateWorkflow: (id: string) => Promise<void>

  // Import/Export
  exportWorkflow: (id: string) => string  // JSON string
  importWorkflow: (json: string) => Promise<void>

  // Selection
  setActiveWorkflow: (id: string | null) => void

  // Hydration
  hydrate: () => Promise<void>
}
```

---

## 4. Storage Layer

### 4.1 Storage Strategy

**Unified SQLite Storage** - 与现有数据（conversations, skills, workspaces）统一存储

```
Storage: SQLite WASM (OPFS)
  - 与现有架构统一
  - ACID 事务支持
  - 强大的 SQL 查询能力
  - 统一备份/迁移
  - 可与 conversation 关联（记录使用了哪个工作流）
```

### 4.2 Repository Pattern

遵循现有 `SkillRepository` 模式：

```typescript
// web/src/sqlite/repositories/workflow.repository.ts
export class WorkflowRepository {
  async findAll(): Promise<CustomWorkflowTemplate[]>
  async findById(id: string): Promise<CustomWorkflowTemplate | null>
  async save(workflow: CustomWorkflowTemplate): Promise<void>
  async delete(id: string): Promise<void>
  async search(keyword: string): Promise<CustomWorkflowTemplate[]>
  // ...
}

export function getWorkflowRepository(): WorkflowRepository
```

### 4.3 SQLite Schema

添加到 `sqlite-schema.sql`:

```sql
-- ============================================================================
-- Custom Workflows Table (用户自定义工作流)
-- ============================================================================
CREATE TABLE IF NOT EXISTS custom_workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    domain TEXT NOT NULL DEFAULT 'custom',
    source TEXT NOT NULL DEFAULT 'user-created',  -- 'built-in' | 'user-created' | 'imported'
    entry_node_id TEXT NOT NULL,
    nodes_json TEXT NOT NULL DEFAULT '[]',        -- JSON array of CustomWorkflowNode
    edges_json TEXT NOT NULL DEFAULT '[]',        -- JSON array of WorkflowEdge
    rubric_json TEXT,                             -- Optional RubricDefinition
    version INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,           -- BOOLEAN
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_custom_workflows_domain ON custom_workflows(domain);
CREATE INDEX IF NOT EXISTS idx_custom_workflows_source ON custom_workflows(source);
CREATE INDEX IF NOT EXISTS idx_custom_workflows_enabled ON custom_workflows(enabled);
CREATE INDEX IF NOT EXISTS idx_custom_workflows_updated_at ON custom_workflows(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_workflows_name_lower ON custom_workflows(lower(name));
```

### 4.4 Migration

添加增量迁移到 `migrations/index.ts`:

```typescript
{
  version: 4,
  name: 'add_custom_workflows_table',
  up: `
    CREATE TABLE IF NOT EXISTS custom_workflows (...);
    CREATE INDEX IF NOT EXISTS ...;
    PRAGMA user_version = 4;
  `
}
```

---

## 5. UI Components

### 5.1 Template Selector Enhancement

Location: `WorkflowEditorDialog.tsx` header

```tsx
// Enhanced dropdown with sections
<BrandSelect>
  <BrandSelectGroup label="内置模板">
    {builtInTemplates.map(t => <SelectItem ... />)}
  </BrandSelectGroup>
  <BrandSelectSeparator />
  <BrandSelectGroup label="我的工作流">
    {customWorkflows.map(t => <SelectItem ... />)}
    <SelectItem value="__new__">
      <Plus className="h-3 w-3" />
      新建工作流
    </SelectItem>
  </BrandSelectGroup>
</BrandSelect>
```

### 5.2 Workflow Manager Page

Route: `/workflows` (new page)

Layout:
```
┌──────────────────────────────────────────────────────────────┐
│ Header: 工作流管理                    [导入] [新建工作流]     │
├──────────────────────────────────────────────────────────────┤
│ Search: [________________]  Filter: [全部 ▼]  Sort: [更新时间]│
├──────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│ │ WorkflowCard│ │ WorkflowCard│ │ WorkflowCard│              │
│ │             │ │             │ │             │              │
│ │ [Edit][Del] │ │ [Edit][Del] │ │ [Edit][Del] │              │
│ └─────────────┘ └─────────────┘ └─────────────┘              │
│                                                              │
│ ┌─────────────┐ ┌─────────────┐                              │
│ │ WorkflowCard│ │ WorkflowCard│                              │
│ └─────────────┘ └─────────────┘                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 Workflow Card Component

```tsx
interface WorkflowCardProps {
  workflow: CustomWorkflowTemplate
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onExport: (id: string) => void
}

// Visual design
<div className="workflow-card">
  <div className="header">
    <Icon /> {name}
  </div>
  <div className="meta">
    {nodeCount} 节点 · {domain}
  </div>
  <div className="preview">
    {/* Mini DAG preview */}
  </div>
  <div className="footer">
    更新于 {relativeTime(updatedAt)}
    <DropdownMenu>
      <Edit />
      <Duplicate />
      <Export />
      <Delete />
    </DropdownMenu>
  </div>
</div>
```

### 5.4 Node Type Selector Enhancement

Location: `AddNodeToolbar.tsx` and context menu

```tsx
// Grouped node selector
<DropdownMenu>
  <DropdownMenuGroup label="基础节点">
    {BASIC_NODES.map(n => <NodeItem ... />)}
  </DropdownMenuGroup>
  <DropdownMenuGroup label="内容处理">
    {CONTENT_NODES.map(n => <NodeItem ... />)}
  </DropdownMenuGroup>
  <DropdownMenuGroup label="分析">
    {ANALYSIS_NODES.map(n => <NodeItem ... />)}
  </DropdownMenuGroup>
  <DropdownMenuSeparator />
  <DropdownMenuItem>
    <Plus /> 自定义节点...
  </DropdownMenuItem>
</DropdownMenu>
```

---

## 6. Node Configuration Panel

### 6.1 Enhanced Properties Panel

Extend `NodePropertiesPanel.tsx`:

```tsx
// New fields
<Field label="模型">
  <ModelSelector
    value={data.modelConfig}
    onChange={(config) => handleChange({ modelConfig: config })}
  />
</Field>

<Field label="提示词模板">
  <PromptTemplateEditor
    value={data.promptTemplate}
    variables={['input', 'context', 'previousOutput']}
    onChange={(template) => handleChange({ promptTemplate: template })}
  />
</Field>

<Field label="温度">
  <Slider
    min={0} max={2} step={0.1}
    value={data.modelConfig?.temperature ?? 0.7}
  />
</Field>

<Field label="最大Token">
  <Input type="number" min={100} max={32000} />
</Field>
```

### 6.2 Model Selector Component

```tsx
interface ModelSelectorProps {
  value?: ModelConfig
  onChange: (config: ModelConfig) => void
}

// Options grouped by provider
<Select>
  <SelectGroup label="GLM">
    <SelectItem value="glm-4-flash">GLM-4-Flash (快速)</SelectItem>
    <SelectItem value="glm-4-plus">GLM-4-Plus (均衡)</SelectItem>
    <SelectItem value="glm-5">GLM-5 (智能)</SelectItem>
  </SelectGroup>
  <SelectGroup label="Claude">
    <SelectItem value="claude-sonnet-4">Claude Sonnet 4</SelectItem>
    <SelectItem value="claude-opus-4">Claude Opus 4</SelectItem>
  </SelectGroup>
</Select>
```

---

## 7. Integration Points

### 7.1 With Existing WorkflowEditor

```typescript
// useWorkflowEditor.ts enhancement
interface UseWorkflowEditorOptions {
  initialWorkflowId?: string
  onSave?: (workflow: CustomWorkflowTemplate) => void
}

function useWorkflowEditor(options?: UseWorkflowEditorOptions) {
  // ... existing logic ...

  // New: Load custom workflow
  const loadCustomWorkflow = useCallback(async (id: string) => {
    const workflow = await customWorkflowStore.getById(id)
    if (workflow) {
      loadTemplate(workflow)
    }
  }, [])

  // New: Save to store
  const saveCustomWorkflow = useCallback(async () => {
    const template = exportTemplate()
    await customWorkflowStore.save({
      ...template,
      source: 'user-created',
      updatedAt: Date.now(),
    })
  }, [exportTemplate])

  return {
    // ... existing returns ...
    loadCustomWorkflow,
    saveCustomWorkflow,
  }
}
```

### 7.2 With Template System

```typescript
// templates.ts enhancement
export function getAllWorkflowBundles(): WorkflowTemplateBundle[] {
  const builtIn = listWorkflowTemplateBundles()
  const custom = customWorkflowStore.getWorkflowsAsBundles()
  return [...builtIn, ...custom]
}
```

---

## 8. Validation Rules

### 8.1 Workflow Validation

```typescript
interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

function validateCustomWorkflow(workflow: CustomWorkflowTemplate): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  // Required fields
  if (!workflow.name?.trim()) {
    errors.push({ field: 'name', message: '工作流名称不能为空' })
  }

  // DAG validation (existing)
  const dagResult = validateWorkflowDag(workflow)
  if (!dagResult.valid) {
    errors.push(...dagResult.errors.map(e => ({ field: 'structure', message: e })))
  }

  // Node validation
  workflow.nodes.forEach(node => {
    if (!node.agentRole?.trim()) {
      errors.push({ field: `nodes.${node.id}.agentRole`, message: '角色名称不能为空' })
    }
    if (node.modelConfig?.temperature && (node.modelConfig.temperature < 0 || node.modelConfig.temperature > 2)) {
      warnings.push({ field: `nodes.${node.id}.temperature`, message: '温度应在 0-2 之间' })
    }
  })

  return { valid: errors.length === 0, errors, warnings }
}
```

---

## 9. Import/Export Format

### 9.1 Export Format

```json
{
  "version": 1,
  "type": "creatorweave-workflow",
  "exportedAt": "2025-03-31T10:00:00Z",
  "workflow": {
    "id": "uuid-here",
    "name": "My Custom Workflow",
    "domain": "custom",
    "nodes": [...],
    "edges": [...]
  }
}
```

### 9.2 Import Validation

```typescript
async function importWorkflow(json: string): Promise<CustomWorkflowTemplate> {
  const data = JSON.parse(json)

  // Validate format
  if (data.type !== 'creatorweave-workflow') {
    throw new Error('Invalid workflow file format')
  }

  // Validate version compatibility
  if (data.version > CURRENT_EXPORT_VERSION) {
    throw new Error('Workflow version not supported')
  }

  // Validate workflow structure
  const validation = validateCustomWorkflow(data.workflow)
  if (!validation.valid) {
    throw new Error(`Invalid workflow: ${validation.errors[0].message}`)
  }

  // Generate new ID to avoid conflicts
  return {
    ...data.workflow,
    id: generateUUID(),
    source: 'imported',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}
```

---

## 10. Implementation Phases

### Phase 1: Foundation (1-2 days)
- [ ] Create `CustomWorkflowTemplate` type extensions in `types.ts`
- [ ] Add `custom_workflows` table to `sqlite-schema.sql`
- [ ] Create migration v4 in `migrations/index.ts`
- [ ] Implement `WorkflowRepository` following `SkillRepository` pattern
- [ ] Create `customWorkflowStore` with basic CRUD (uses repository)

### Phase 2: Editor Integration (2-3 days)
- [ ] Enhance `useWorkflowEditor` to load/save custom workflows
- [ ] Update template selector with custom workflow section
- [ ] Add "Save As" functionality
- [ ] Implement node presets system

### Phase 3: Management Page (2-3 days)
- [ ] Create `WorkflowManagerPage` component
- [ ] Implement `WorkflowCard` with actions
- [ ] Add search/filter/sort functionality
- [ ] Implement import/export

### Phase 4: Enhanced Configuration (1-2 days)
- [ ] Add model selector to node properties
- [ ] Implement prompt template editor
- [ ] Add advanced parameters (temperature, max tokens)

### Phase 5: Polish & Testing (1-2 days)
- [ ] Write unit tests for repository and store
- [ ] Write E2E tests for workflow management
- [ ] UX polish and error handling
- [ ] Documentation

---

## 11. Open Decisions

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Model per node vs workflow | A) Per-node B) Workflow-level | A (Per-node) - more flexibility |
| Version history | A) Full history B) Last 5 versions C) None | B (Last 5) - balance storage/feature |
| Workflow sharing | A) File export only B) Community marketplace | A first, B as future enhancement |
| Node type extension | A) Presets only B) Full custom types | A first, B as Phase 2 |

---

## 12. Future Enhancements

1. **Workflow Versioning**: Track changes, allow rollback
2. **Community Marketplace**: Share and discover workflows
3. **Custom Node Types**: Define entirely new node behaviors
4. **Workflow Templates**: Pre-built workflows for common use cases
5. **Execution Metrics**: Track workflow performance and success rates
6. **Conditional Routing**: Add branching logic to edges
7. **Sub-workflows**: Nest workflows within workflows
