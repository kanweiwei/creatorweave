# Python 工具文件发现技术方案

## 一、问题分析

### 1.1 当前实现

| 工具 | 功能 | 限制 |
|------|------|------|
| `list_files` | 列出目录树形结构 | 返回所有文件，不筛选 |
| `file_read` | 读取单个文件内容 | 需要知道具体路径 |
| `run_python_code` | 执行 Python 代码 | **需要显式指定 `files` 参数** |

### 1.2 核心问题

```
用户: "分析一下销售数据"
      ↓
Agent: 不知道有哪些数据文件
      ↓
Agent: 需要多轮工具调用 (list_files → glob → run_python_code)
      ↓
用户体验: 慢、复杂
```

### 1.3 技术挑战

1. **文件发现**: Agent 如何知道工作区有哪些数据文件？
2. **智能注入**: 哪些文件应该自动注入 Python 环境？
3. **性能平衡**: 自动扫描 vs 用户显式指定
4. **大文件处理**: 如何避免注入过大的文件？

---

## 二、技术方案

### 方案对比矩阵

| 方案 | 复杂度 | 用户体验 | 性能影响 | 推荐度 |
|------|--------|----------|----------|--------|
| A. Prompt 优化 | 低 | 中 | 无 | ⭐⭐⭐ |
| B. 新增数据文件工具 | 中 | 高 | 无 | ⭐⭐⭐⭐⭐ |
| C. 智能自动注入 | 高 | 最高 | 有 | ⭐⭐⭐⭐ |

---

### 方案 A: System Prompt 优化

**实现方式**: 修改 `agent-loop.ts` 中的 `DEFAULT_SYSTEM_PROMPT`

```typescript
const PYTHON_DATA_ANALYSIS_GUIDE = `
When the user requests data analysis or processing:
1. Use list_files or glob to discover data files (e.g., "**/*.csv", "**/*.xlsx")
2. Use file_read to preview file structure if needed
3. Pass discovered file paths to run_python_code via the files parameter

Example workflow:
- User: "Analyze sales data"
- Agent: list_files() → finds "data/sales.csv"
- Agent: run_python_code(code="...", files=[{path:"data/sales.csv"}])
`
```

**优点**:
- 零代码修改，仅调整提示词
- 立即生效
- 保持工具语义清晰

**缺点**:
- Agent 可能不严格遵守
- 仍需多轮工具调用

---

### 方案 B: 新增 `list_data_files` 工具 (推荐)

**工具定义**:

```typescript
export const listDataFilesDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_data_files',
    description:
      'List data files (CSV, Excel, JSON, Parquet) in the workspace.' +
      '\nReturns file paths with metadata that can be directly passed to run_python_code.' +
      '\nUse this BEFORE run_python_code to discover available data files.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Subdirectory to search (default: project root)',
        },
        types: {
          type: 'array',
          items: { type: 'string', enum: ['csv', 'xlsx', 'json', 'parquet', 'all'] },
          description: 'File types to include (default: ["csv", "xlsx"])',
        },
        max_size_mb: {
          type: 'number',
          description: 'Maximum file size in MB (default: 50)',
        },
      },
    },
  },
}
```

**返回格式**:

```json
{
  "files": [
    {
      "path": "data/sales.csv",
      "name": "sales.csv",
      "size": 1234567,
      "size_human": "1.2MB",
      "type": "csv"
    },
    {
      "path": "reports/2024.xlsx",
      "name": "2024.xlsx",
      "size": 524288,
      "size_human": "512KB",
      "type": "xlsx"
    }
  ],
  "total_files": 2,
  "total_size_mb": 1.7,
  "python_files_param": "[{path: \"data/sales.csv\"}, {path: \"reports/2024.xlsx\"}]"
}
```

**实现要点**:

```typescript
export const listDataFilesExecutor: ToolExecutor = async (args, context) => {
  const { useOPFSStore } = await import('@/store/opfs.store')
  const { traverseDirectory } = await import('@/services/traversal.service')

  // 1. 解析参数
  const subPath = (args.path as string) || ''
  const types = (args.types as string[]) || ['csv', 'xlsx']
  const maxSizeMB = (args.max_size_mb as number) || 50

  // 2. 遍历目录，过滤数据文件
  const dataExtensions = new Set(
    types.flatMap((t) => {
      if (t === 'all') return ['csv', 'xlsx', 'json', 'parquet']
      if (t === 'xlsx') return ['xlsx', 'xls']
      return [t]
    })
  )

  const files: Array<FileMeta> = []
  const maxSizeBytes = maxSizeMB * 1024 * 1024

  for await (const entry of traverseDirectory(context.directoryHandle)) {
    if (entry.type !== 'file') continue

    const ext = entry.path.split('.').pop()?.toLowerCase()
    if (!ext || !dataExtensions.has(ext)) continue

    if (entry.size > maxSizeBytes) continue

    files.push({
      path: entry.path,
      name: entry.path.split('/').pop() || entry.path,
      size: entry.size,
      size_human: formatSize(entry.size),
      type: ext,
    })
  }

  // 3. 返回结构化结果
  return JSON.stringify({
    files,
    total_files: files.length,
    total_size_mb: (files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2),
    python_files_param: JSON.stringify(files.map((f) => ({ path: f.path }))),
  })
}
```

**优点**:
- 语义清晰：专门用于数据文件发现
- Agent 一键获取所有可用数据文件
- 返回值可直接用于 `run_python_code`
- 性能可控：大小限制、类型过滤

**缺点**:
- 与 `list_files` 功能有轻微重叠

---

### 方案 C: 智能自动注入 (高级)

**思路**: 当 `run_python_code` 未指定 `files` 时，自动扫描并注入数据文件。

**修改 `python.tool.ts`**:

```typescript
export const pythonCodeExecutor: ToolExecutor = async (args, _context) => {
  const code = args.code as string
  let files = args.files as Array<{ path: string }> | undefined

  // 🆕 自动文件发现
  if (!files || files.length === 0) {
    const discoveredFiles = await autoDiscoverDataFiles(_context.directoryHandle)
    if (discoveredFiles.length > 0) {
      files = discoveredFiles.map((f) => ({ path: f.path }))
      console.log(`[Python Tool] Auto-injected ${files.length} data files`)
    }
  }

  // ... 原有逻辑
}

// 🆕 自动发现辅助函数
async function autoDiscoverDataFiles(
  directoryHandle: FileSystemDirectoryHandle
): Promise<Array<{ path: string; size: number }>> {
  const MAX_SIZE = 10 * 1024 * 1024 // 10MB
  const MAX_FILES = 5
  const EXTS = ['csv', 'xlsx', 'json', 'parquet']

  const files: Array<{ path: string; size: number }> = []

  for await (const entry of traverseDirectory(directoryHandle)) {
    if (files.length >= MAX_FILES) break
    if (entry.type !== 'file') continue

    const ext = entry.path.split('.').pop()?.toLowerCase()
    if (!ext || !EXTS.includes(ext)) continue
    if (entry.size > MAX_SIZE) continue

    files.push({ path: entry.path, size: entry.size })
  }

  return files
}
```

**安全措施**:
1. **大小限制**: 单个文件 ≤10MB
2. **数量限制**: 最多注入 5 个文件
3. **类型白名单**: 仅 csv, xlsx, json, parquet
4. **透明反馈**: 返回值中告知注入了哪些文件

**返回值增强**:

```json
{
  "stdout": "...",
  "injected_files": [
    {"path": "data/sales.csv", "size": "1.2MB"}
  ],
  "note": "Automatically injected 1 data file. Specify files parameter to override."
}
```

**优点**:
- 用户体验最佳：无需手动指定文件
- 智能：自动发现常用数据格式

**缺点**:
- 意外行为：可能注入不需要的文件
- 性能开销：每次执行都扫描目录
- 可预测性差：Agent 不知道哪些文件被注入

---

## 三、推荐实施路径

### 阶段 1: 立即实施 (方案 A)

**时间**: 1 小时
**工作**: 修改 `agent-loop.ts` 的 System Prompt

```typescript
const DEFAULT_SYSTEM_PROMPT = `... existing content ...

DATA ANALYSIS WORKFLOW:
When the user asks to analyze, process, or visualize data:
1. Use list_data_files() to discover available data files
2. Use run_python_code() with the files parameter to inject data
3. DO NOT manually specify file paths - use the discovered paths from list_data_files()

Example:
- list_data_files() → returns {files: [{path: "data/sales.csv"}]}
- run_python_code(code="import pandas as pd; df=pd.read_csv('/mnt/sales.csv'); print(df.describe())", files=[{path:"data/sales.csv"}])`
```

### 阶段 2: 核心方案 (方案 B)

**时间**: 4 小时
**工作**: 实现 `list_data_files` 工具

**文件**:
- 新建: `web/src/agent/tools/list-data-files.tool.ts`
- 修改: `web/src/agent/tool-registry.ts` (注册工具)

**验收**:
- [ ] 工具能正确列出 CSV/XLSX/JSON 文件
- [ ] 返回格式与 `run_python_code` 的 files 参数兼容
- [ ] 支持类型和大小过滤
- [ ] Agent 能正确使用该工具

### 阶段 3: 可选增强 (方案 C)

**时间**: 6 小时
**工作**: 实现智能自动注入

**前提**: 方案 B 已完成且稳定

**决策点**:
- 如果用户反馈经常忘记指定文件 → 启用方案 C
- 如果用户更喜欢显式控制 → 保持方案 B

---

## 四、工具协同流程

### 理想流程 (方案 B 实施后)

```
┌─────────────────────────────────────────────────────────┐
│ 用户: "分析一下销售数据的趋势"                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Agent 调用: list_data_files()                           │
│ ────────────────────────────────────────────────────    │
│ 返回: {files: [{path: "data/sales.csv", size: "1.2MB"}]}│
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Agent 调用: run_python_code(                            │
│   code = "import pandas as pd..."                       │
│   files = [{path: "data/sales.csv"}]  ← 使用发现的路径   │
│ )                                                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Python 执行并返回分析结果                                │
└─────────────────────────────────────────────────────────┘
```

### 工具职责划分

| 工具 | 职责 | 不负责 |
|------|------|--------|
| `list_files` | 项目结构概览 | 数据文件筛选 |
| `list_data_files` | **数据文件发现** | 文件内容读取 |
| `file_read` | 读取文件内容 | 文件发现 |
| `run_python_code` | Python 代码执行 | 自动文件发现 |

---

## 五、边缘情况处理

### 5.1 大文件

**策略**: 在 `list_data_files` 中标记大文件，但不返回

```typescript
if (entry.size > maxSizeBytes) {
  // 返回警告但不包含在结果中
  warnings.push(`Skipped large file: ${entry.path} (${formatSize(entry.size)})`)
}
```

### 5.2 无数据文件

**策略**: 返回空列表，引导用户

```json
{
  "files": [],
  "message": "No data files found in the workspace. Upload CSV, Excel, or JSON files to analyze.",
  "hint": "Use list_files to see all project files."
}
```

### 5.3 混合数据类型

**策略**: 按类型分组返回

```json
{
  "files": {
    "csv": [{path: "data/a.csv"}, {path: "data/b.csv"}],
    "xlsx": [{path: "reports/c.xlsx"}]
  }
}
```

---

## 六、性能考虑

### 6.1 扫描优化

- 使用 OPFS 缓存的元数据，避免重复读取
- 限制递归深度（默认 3 层）
- 限制返回数量（默认 50 个文件）

### 6.2 内存控制

```typescript
// 方案 C 的安全限制
const AUTO_INJECT_LIMITS = {
  maxFiles: 5,
  maxTotalSize: 10 * 1024 * 1024, // 10MB
  maxSingleFileSize: 5 * 1024 * 1024, // 5MB
}
```

---

## 七、总结

| 维度 | 方案 A | 方案 B | 方案 C |
|------|--------|--------|--------|
| 实施难度 | 低 | 中 | 高 |
| 用户体验 | 中 | 高 | 最高 |
| 可控性 | 高 | 高 | 中 |
| 性能影响 | 无 | 无 | 有 |
| 推荐场景 | 快速修复 | 标准方案 | 高级用户 |

**最终推荐**: 先实施方案 A (立即) + 方案 B (短期)，根据用户反馈决定是否实施方案 C。
