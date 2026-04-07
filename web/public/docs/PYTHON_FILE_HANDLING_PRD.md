# Python 文件处理功能 - 产品需求文档 (PRD)

## 一、问题陈述

### 1.1 当前问题

用户希望在浏览器中让 Agent 用 Python 分析本地文件，但当前实现存在以下问题：

| 问题 | 描述 | 影响 |
|------|------|------|
| **提示词误导** | "Files are automatically available in /mnt/" 是错误的 | 用户/Agent 期望文件自动可用 |
| **发现机制缺失** | Agent 不知道用户工作区中有哪些文件 | Agent 无法主动找到文件 |
| **工具链不完整** | 没有明确的文件发现→Python执行工作流 | Agent 不知道如何组合工具 |
| **参数设计问题** | `files` 参数需要明确路径 `{path: "data/sales.csv"}` | Agent 不知道文件路径 |

### 1.2 用户痛点

```
用户: "分析 sales.csv 的数据"
Agent: "我需要知道 sales.csv 的完整路径..."
```

用户期望：Agent 应该能自动找到文件
实际行为：Agent 不知道文件在哪里

---

## 二、用户场景分析

### 场景 1: 分析单个数据文件

**用户需求**:
```
"分析 sales.csv 的数据"
"用 Python 统计 data.xlsx 的行数"
"看看 transactions.json 里有多少条记录"
```

**期望行为**:
1. Agent 自动发现用户提到的文件（如 sales.csv）
2. 读取文件并分析
3. 返回分析结果

**当前缺失**: 文件自动发现机制

---

### 场景 2: 批量处理多个文件

**用户需求**:
```
"统计所有 CSV 文件的总行数"
"把所有 JSON 文件合并成一个"
"找出所有日志文件中的错误行"
```

**期望行为**:
1. Agent 使用 glob/list_files 找到所有匹配文件
2. 对每个文件执行 Python 代码
3. 汇总结果

**当前缺失**: 批量处理工作流

---

### 场景 3: 数据可视化

**用户需求**:
```
"画出 sales.csv 中销售额的趋势图"
"用 Python 制作 data.xlsx 的直方图"
"生成各月份销售额的对比图"
```

**期望行为**:
1. Agent 找到数据文件
2. 生成 matplotlib 图表
3. 展示图片给用户

**当前缺失**: 图片展示机制（虽已生成但未渲染）

---

### 场景 4: 数据转换

**用户需求**:
```
"把这个 Excel 文件转成 CSV"
"把所有 JSON 转换成 CSV"
"清洗一下 data.csv 中的空值"
```

**期望行为**:
1. Agent 读取输入文件
2. 用 Python 处理
3. 保存输出文件
4. 通知用户文件已保存

**当前部分实现**: 输出文件已保存，但用户无感知

---

## 三、解决方案设计

### 3.1 方案 A: 改进提示词 + Agent 工作流指导 (推荐)

**改动最小，风险最低**

#### 具体实现

**1. 修正提示词中的误导性描述**

```typescript
// agent-loop.ts
// 修改前:
Python execution:
- Files are automatically available in /mnt/ directory

// 修改后:
Python execution:
- To analyze files, you MUST specify them in the files parameter
- Typical workflow: glob("*.csv") → run_python_code(code="...", files=[{path: "..."}])
- Output files written to /mnt/ are saved back to workspace
```

**2. 在 python.tool.ts 的 description 中添加示例**

```typescript
description: `Execute Python code in the browser using Pyodide.

**Workflow for file analysis:**
1. First, use glob() or list_files() to discover files in the workspace
2. Then use run_python_code() with the files parameter

**Example:**
User: "Analyze sales.csv"
Agent steps:
  1. glob(pattern="**/*sales*.csv")  // Find the file
  2. run_python_code(
       code="import pandas as pd; df = pd.read_csv('/mnt/sales.csv'); print(df.describe())",
       files=[{path: "data/sales.csv"}]  // Use exact path from glob
     )`
```

**3. 在系统提示词中添加 Python 分析工作流**

```typescript
When the user asks for data analysis or Python tasks:
1. First, use glob or list_files to find relevant files
2. Read a sample to understand the structure if needed
3. Construct Python code that reads from /mnt/{filename}
4. Call run_python_code with files parameter set to the workspace paths
5. Output files will be automatically saved to workspace
```

---

### 3.2 方案 B: 智能文件名匹配 (增强体验)

**中等改动，提升用户体验**

#### 具体实现

在 `python.tool.ts` 中添加文件名自动匹配：

```typescript
// 如果用户提到文件名（如 "sales.csv"），自动搜索匹配
const userMentionedFile = extractFileNameFromCode(code)
if (userMentionedFile && !files) {
  // 使用 glob 搜索匹配的文件
  const matches = await glob(`**/*${userMentionedFile}*`)
  if (matches.length === 1) {
    // 自动注入找到的文件
    files = [{path: matches[0]}]
  } else if (matches.length > 1) {
    // 多个匹配，返回提示
    return `Found multiple files matching ${userMentionedFile}: ${matches.join(', ')}
            Please specify which one to use.`
  }
}
```

---

### 3.3 方案 C: 自动文件注入 (激进方案)

**改动最大，但用户体验最好**

#### 具体实现

修改 `pythonCodeExecutor`，在执行前自动注入所有小文件：

```typescript
// 自动发现并注入所有 <100KB 的文本/数据文件
const allFiles = await glob("**/*.{csv,json,txt,xlsx,xls}")
const smallFiles = allFiles.filter(f => f.size < 100 * 1024)

// 注入到 /mnt/
for (const file of smallFiles) {
  await injectFile(file)
}
```

**问题**: 可能注入太多文件，性能和内存问题

---

## 四、推荐的实施计划

### Phase 1: 修复提示词 (必须)

| 任务 | 文件 | 改动 |
|------|------|------|
| 修正误导性描述 | `agent-loop.ts` | 修改 "Files are automatically available" |
| 添加工作流指导 | `agent-loop.ts` | 添加 glob → run_python_code 流程 |
| 改进 tool description | `python.tool.ts` | 添加文件分析示例 |

**预期效果**: Agent 能够正确理解如何使用工具

---

### Phase 2: 智能文件匹配 (建议)

| 任务 | 文件 | 改动 |
|------|------|------|
| 文件名提取 | `python.tool.ts` | 从代码中提取文件名 |
| 自动搜索 | `python.tool.ts` | 使用 glob 搜索匹配文件 |
| 自动注入 | `python.tool.ts` | 单匹配时自动注入 |

**预期效果**: 用户体验显著提升，减少对话轮次

---

### Phase 3: 结果展示增强 (后续)

| 任务 | 说明 |
|------|------|
| 图片展示 | matplotlib 生成的图片在 UI 中渲染 |
| 输出文件通知 | 告知用户输出文件已保存 |
| 进度指示 | Python 执行时显示进度 |

---

## 五、成功指标

| 指标 | 目标 |
|------|------|
| 用户意图识别准确率 | >90% |
| 工具调用正确率 | >95% |
| 平均对话轮次 (简单分析) | <3 轮 |
| 文件自动发现成功率 | >80% |

---

## 六、开放问题

1. **大文件处理**: >100MB 的文件如何处理？
2. **二进制文件**: 如何处理图片、PDF 等？
3. **错误恢复**: Python 执行失败后如何恢复？
4. **并发执行**: 多个 Python 任务的队列管理？
