# Python 文件处理功能 - Agent 智能化实施方案

> 基于 Agent 专家团队讨论结果
>
> 参与专家：agent-architect, product-manager, tool-engineer

---

## 一、问题诊断

### 1.1 核心问题

**用户输入**: "分析 sales.csv"

**当前行为**: Agent 不知道如何找到文件，或要求用户提供完整路径

**期望行为**: Agent 自动发现文件并执行分析

### 1.2 根本原因

| 问题 | 描述 | 位置 |
|------|------|------|
| 提示词误导 | "Files are automatically available in /mnt/" 是错误的 | `agent-loop.ts:48` |
| 工具编排缺失 | 没有教 Agent 先用 glob 找文件，再用 run_python_code | `agent-loop.ts` |
| 工具描述不足 | run_python_code 的 description 没有强调工作流 | `python.tool.ts` |

---

## 二、解决方案：THINK → SEARCH → ACT

### 2.1 核心设计理念

```
用户意图 → 需要文件发现 → 需要Python执行 → 需要结果呈现
   ↓            ↓              ↓              ↓
意图识别    glob工具      run_python_code   格式化输出
```

### 2.2 Agent 推理过程（ReAct 模式）

```
Thought 1: 用户提到 "sales.csv"，我需要先确认文件是否存在
Action 1: glob(pattern="**/*sales*.csv")
Observation 1: 找到 data/sales.csv

Thought 2: 文件存在，用 pandas 读取分析
Action 2: run_python_code(code="...", files=[{path: "data/sales.csv"}])
Observation 2: 返回分析结果

Final Answer: [分析报告]
```

---

## 三、实施计划

### Phase 1: 提示词工程（P0 - 立即执行）

**改动文件**: `web/src/agent/agent-loop.ts`

**修改内容**:

```typescript
const DEFAULT_SYSTEM_PROMPT = `You are a powerful AI assistant running in the browser with full access to the user's local project files through tools.

## Core Philosophy: THINK → SEARCH → ACT

When users ask to analyze or process files, ALWAYS follow this workflow:

### 1. FILE DISCOVERY (Critical First Step)
- If user mentions a filename: use glob(pattern="**/*filename*") to find it
- If user mentions a file type: use glob(pattern="**/*.extension")
- NEVER assume a file path is correct without verifying

### 2. FILE CONFIRMATION
- If glob returns no results: tell user the file wasn't found
- If glob returns exact match: proceed with the file path
- If glob returns multiple matches: ask user which one

### 3. THEN ACT
- For data analysis: run_python_code with files parameter
- The files parameter is REQUIRED when accessing user data
- File paths MUST be from glob results, not guessed

Available built-in tools:
- file_read: Read file contents by path
- file_write: Write/create files
- edit: Apply text replacements to files
- glob: Search for files by pattern (e.g. "**/*.ts", "**/*.csv")
- grep: Search file contents with regex
- list_files: List directory structure as a tree
- run_python_code: Execute Python code with pandas, numpy, matplotlib, openpyxl

## Python Execution Workflow (IMPORTANT)

⚠️ CRITICAL: Files are NOT automatically available. You MUST discover them first.

Correct workflow:
1. User says "analyze sales.csv"
2. You call: glob(pattern="**/*sales*.csv") → returns "data/sales.csv"
3. You call: run_python_code(
     code="import pandas as pd; df = pd.read_csv('/mnt/sales.csv'); print(df.describe())",
     files=[{path: "data/sales.csv"}]  ← Use the EXACT path from glob
   )

Python packages available: pandas, numpy, matplotlib, openpyxl
Output files written to /mnt/ are saved back to workspace

Always read files before editing them. Be concise and helpful.`
```

---

### Phase 2: 工具描述优化（P0 - 立即执行）

**改动文件**: `web/src/agent/tools/python.tool.ts`

**修改内容**:

```typescript
export const pythonCodeDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'run_python_code',
    description: `Execute Python code in the browser using Pyodide.

⚠️ CRITICAL: Files MUST be specified in the 'files' parameter BEFORE use.
Workflow: user mentions "sales.csv" → you glob("**/sales.csv") → get path → run_python_code(files=[{path: "found/path"}])

Available packages: pandas, numpy, matplotlib, openpyxl (auto-detected from imports)

Examples:
- Analyze CSV: run_python_code(code="import pandas as pd; df = pd.read_csv('/mnt/file.csv'); print(df.describe())", files=[{path: "data/file.csv"}])
- Create chart: run_python_code(code="import matplotlib.pyplot as plt; plt.plot([1,2,3]); plt.savefig('/mnt/chart.png')")

Parameters:
- code: Python code (files are accessible at /mnt/{filename})
- files: Array of {path: string} - workspace file paths to inject into /mnt/
- packages: Optional - pandas, numpy, matplotlib, openpyxl
- timeout: Execution timeout in milliseconds (default: 30000)`,
    // ... rest of definition
  }
}
```

---

### Phase 3: 错误处理增强（P1）

**改动文件**: `web/src/agent/tools/python.tool.ts`

**修改内容**: 在执行前验证文件存在性

```typescript
export const pythonCodeExecutor: ToolExecutor = async (args, _context) => {
  // ... existing code ...

  // Validate files exist before execution
  if (files && files.length > 0) {
    const { useAgentStore } = await import('@/store/agent.store')
    const { useOPFSStore } = await import('@/store/opfs.store')
    const directoryHandle = useAgentStore.getState().directoryHandle

    if (directoryHandle) {
      const { readFile } = useOPFSStore.getState()
      const missingFiles: string[] = []

      for (const fileSpec of files) {
        try {
          await readFile(fileSpec.path, directoryHandle)
        } catch {
          missingFiles.push(fileSpec.path)
        }
      }

      if (missingFiles.length > 0) {
        return JSON.stringify({
          error: `File(s) not found: ${missingFiles.join(', ')}`,
          hint: `Use glob(pattern="**/*.csv") to find correct file paths`,
          _debug: "File discovery required before Python execution"
        })
      }
    }
  }

  // ... rest of execution ...
}
```

---

## 四、后续优化（P1-P2）

### 4.1 产品经理建议的增强功能

| 优先级 | 功能 | 描述 |
|--------|------|------|
| P1 | 文件模糊匹配 | "sales.csv" 能匹配 "sales_2024.csv" |
| P1 | 错误引导 | 文件不存在时，显示相似文件列表 |
| P1 | 意图显化 | 让用户看到 Agent 的思考过程 |
| P2 | 文件索引缓存 | 避免重复搜索 |
| P2 | 多文件批量操作 | "分析所有 csv" |

### 4.2 工具工程师建议的组合工具

```typescript
// 可选：针对高频场景的便捷工具
{
  name: "analyze_file",
  description: "Quick analysis of CSV/Excel/JSON files. Handles file discovery automatically.",
  parameters: {
    filename: string,      // File name (supports glob pattern)
    operation?: "describe" | "head" | "plot" | "stats"
  }
  // 内部实现：glob → run_python_code
}
```

---

## 五、验证测试

### 5.1 测试场景

| 场景 | 用户输入 | 期望行为 |
|------|----------|----------|
| 单文件分析 | "分析 sales.csv" | glob → run_python_code |
| 模糊文件名 | "看看数据文件" | glob("**/*.csv") → 让用户选择 |
| 文件不存在 | "分析 missing.csv" | 提示文件不存在，建议使用 glob |
| 多文件 | "统计所有 csv 行数" | glob("**/*.csv") → 批量处理 |

### 5.2 验收标准

- Agent 能够主动使用 glob 发现文件
- 不再要求用户提供完整路径
- 文件不存在时给出友好提示
- Python 执行成功率 > 90%

---

## 六、实施优先级总结

| 阶段 | 任务 | 改动量 | 预期效果 |
|------|------|--------|----------|
| **P0** | 修改 system prompt | 1 文件 | Agent 学会正确工作流 |
| **P0** | 优化 tool description | 1 文件 | 工具使用更清晰 |
| **P1** | 增强错误处理 | 1 文件 | 更好的错误提示 |
| **P1** | 添加意图显化 UI | 新功能 | 用户看到 Agent 思考过程 |
| **P2** | 组合工具 | 新文件 | 高频场景更便捷 |

---

## 七、专家共识

**一致同意**:
1. ✅ 核心问题是**编排逻辑**，不是工具能力不足
2. ✅ 优先用**提示词工程**解决，而非修改工具参数
3. ✅ 保持工具职责单一：glob 负责查找，run_python_code 负责执行
4. ✅ 渐进式改进：P0 → P1 → P2

**分歧点**:
- 是否需要 `analyze_file` 组合工具：工具工程师建议可选，产品经理建议观察 P0 效果后再决定

---

## 八、下一步行动

1. **立即执行 P0**：修改 `agent-loop.ts` 和 `python.tool.ts`
2. **测试验证**：用测试场景验证 Agent 行为
3. **收集反馈**：观察用户实际使用情况
4. **迭代优化**：根据反馈决定 P1/P2 实施内容
