# 通用多智能体内容创作系统设计（v0）

日期：2026-03-30  
分支：`feat/multi-agent-generic-workflow-poc`

## 1. 背景与目标

当前很多内容创作问题（网文、营销、教育、企业文案）并不是单次生成能力不足，而是缺乏可控的生产流程：任务拆解、并行执行、规则评审、自动修复、人工接管。

本设计目标是构建一套跨行业复用的多智能体系统：

1. 用统一编排层管理多智能体协作，而不是写死单场景链路。
2. 将评审标准（Rubric）插件化，支持用户自定义。
3. 通过“自动修复 + 质量闭环”提高稳定性和可解释性。

## 2. 范围

### 2.1 MVP 范围

1. 通用工作流引擎（DAG 执行、依赖、并行、重试、超时）。
2. 多角色智能体运行时（Producer / Reviewer / Repairer）。
3. Rubric 引擎（规则执行、打分、失败原因输出）。
4. Repair Loop（最多 N 轮，默认 N=2）。
5. 运行控制台（节点状态、失败原因、人工接管）。

### 2.2 非目标（MVP 不做）

1. 全自动风格画像训练。
2. 跨工作区共享模型权重。
3. 全量行业模板市场。

## 3. 核心概念

1. **Task**：一次创作任务输入（目标、约束、素材、渠道、受众）。
2. **Workflow（DAG）**：任务执行图，节点间有依赖关系且无环。
3. **Agent Role**：节点角色（规划、写作、审核、修复、组装）。
4. **Artifact**：节点产物（正文、元数据、引用、版本）。
5. **Rubric**：评审规则集合（评分项、阈值、失败动作）。
6. **Run**：一次任务执行实例（含重试与日志）。

## 4. 系统架构

1. **Workflow Engine**
- 解析并执行 DAG。
- 调度并行节点。
- 控制重试、超时、失败路由。

2. **Agent Runtime**
- 将标准化 Task 下发到对应角色智能体。
- 统一收集输出为 Artifact。

3. **Rubric Engine**
- 执行规则检查器（结构、风格、事实、合规、平台格式）。
- 输出评分、违规证据、修复建议。

4. **Repair Loop**
- 对失败项进行“定向返工”，避免全量重写导致风格漂移。
- 达到上限仍失败则升级人工节点。

5. **Memory Layer**
- 项目长期记忆：风格偏好、历史决策。
- 任务中期记忆：当前任务约束和阶段产物。
- 轮次短期记忆：当前修复上下文。

## 5. 多智能体协作机制

## 5.1 协作模式

1. 并行：互不依赖节点同时执行（如多个渠道改写）。
2. 串行：强依赖路径顺序执行（写作 -> 审核 -> 修复）。
3. 分层：总控节点分配子任务，聚合结果。

## 5.2 失败闭环

1. Reviewer 未通过 -> 生成 violations + repairHints。
2. Repairer 仅修改违规片段。
3. 重新送审。
4. 轮次达到上限后，进入人工接管。

## 6. Rubric 插件化设计

## 6.1 规则模型

每条规则包含：

1. `id`：规则标识。
2. `checker`：检查器名称。
3. `params`：检查参数。
4. `weight`：权重。
5. `threshold`：通过阈值。
6. `failAction`：失败动作（自动修复、升级审核、人工介入、终止）。
7. `severity`：严重级别。

## 6.2 用户自定义方式

1. 表单模式：低门槛配置。
2. 自然语言模式：系统转规则并可回看。
3. DSL 模式：高级用户直接精细配置。

建议实现为“双向互转”：表单 <-> DSL，降低学习门槛。

## 6.3 DSL v0（示例）

```yaml
rubric: novel_daily_v1
pass_condition: "total_score >= 80 and hard_fail_count == 0"
rules:
  - id: narrative_paragraph_len
    checker: paragraph_sentence_count
    params:
      target: narrative
      min: 3
      max: 6
    weight: 0.25
    threshold:
      violation_rate_lte: 0.05
    fail_action: auto_repair
    severity: high

  - id: dialogue_policy
    checker: dialogue_paragraph_policy
    params:
      allow_single: true
    weight: 0.1
    threshold:
      pass_eq: true
    fail_action: auto_repair
    severity: medium

retry_policy:
  max_repair_rounds: 2
```

## 7. 交互设计

## 7.1 任务创建页

1. 输入目标、素材、渠道、约束、模板。
2. 选择运行策略（快速/平衡/严格）。
3. 选择 Rubric（默认模板或自定义）。

## 7.2 工作流编辑器

1. 可视化编辑 DAG 节点与依赖。
2. 节点配置 Agent 角色、模型、超时、重试策略。
3. 提供“拓扑校验”，阻止有环配置。

## 7.3 Rubric 配置中心

1. 表单配置规则项。
2. 自然语言转规则并可编辑。
3. DSL 编辑器（语法校验、错误定位、示例模板）。
4. 试跑样本，预览评分结果。

## 7.4 运行控制台

1. 实时状态流：排队、执行中、通过、失败、重试。
2. 节点级日志：输入摘要、输出摘要、耗时、模型调用。
3. Reviewer 失败时展示违规证据与修复建议。
4. 人工接管：手动修改后继续执行。

## 7.5 结果对比页

1. 最终稿与历史轮次 diff。
2. 规则命中统计与失败热区。
3. 导出交付版本与运行报告。

## 8. 数据模型（首版）

1. `tasks`：任务元信息。
2. `workflow_templates`：工作流模板。
3. `workflow_nodes` / `workflow_edges`：DAG 定义。
4. `rubrics` / `rubric_versions` / `rubric_rules`：规则定义与版本。
5. `runs`：执行实例。
6. `artifacts`：节点产物版本。
7. `review_reports`：评分与违规列表。
8. `decision_logs`：关键决策与操作轨迹。

## 9. API（MVP）

1. `POST /v1/tasks`：创建任务。
2. `POST /v1/runs`：启动执行。
3. `GET /v1/runs/{runId}`：查询状态。
4. `GET /v1/runs/{runId}/events`：SSE 实时事件流。
5. `GET /v1/runs/{runId}/artifacts`：获取产物与版本。
6. `POST /v1/runs/{runId}/actions/approve`：人工放行。
7. `POST /v1/runs/{runId}/actions/retry`：人工触发重试。
8. `POST /v1/rubrics` / `PUT /v1/rubrics/{id}`：规则管理。

## 10. 指标体系

1. 首轮通过率。
2. 最终通过率（含重试）。
3. 平均修复轮次。
4. 人工修改字数占比。
5. 任务平均耗时与单位成本。
6. 模板复用率与留存。

## 11. 风险与控制

1. 风格漂移：只允许定向修复违规片段。
2. 延迟与成本：并行执行 + 缓存 + 模式降级。
3. 规则复杂度过高：提供规则测试集与版本回滚。
4. 可解释性不足：每条失败必须给出证据片段。

## 12. 分阶段推进

### Phase 1（2 周）

1. 工作流与运行实例基础模型。
2. DAG 校验与执行状态机。

### Phase 2（2 周）

1. Rubric 引擎与规则执行管线。
2. ReviewReport 标准化。

### Phase 3（2 周）

1. Repair Loop（最多 2 轮）。
2. 人工接管节点。

### Phase 4（2 周）

1. 运行控制台与结果对比页。
2. 首个模板上线：网文日更。

## 13. 通用协作协议（跨行业统一）

无论是小说、短视频、课程稿还是企业文案，统一采用以下运行协议：

1. `Plan`：结构化目标、受众、限制条件。
2. `Produce`：生成初稿 Artifact。
3. `Review`：按 Rubric 输出评分 + 违规证据 + 修复建议。
4. `Repair`：仅针对违规片段返工，保留未违规内容。
5. `Assemble`：组装最终交付稿与元数据。
6. `Human Gate`：达到上限仍失败时转人工决策。

## 14. 跨行业模板映射（v0）

| 模板 ID | 行业 | 典型输入 | 核心规则（示例） | 交付物 |
| --- | --- | --- | --- | --- |
| `novel_daily_v1` | 网文创作 | 人设、剧情线、禁忌词 | 叙事段落句数、对话段策略 | 章节正文 |
| `short_video_script_v1` | 短视频营销 | 产品卖点、渠道、时长 | 前 3 秒钩子、CTA 完整性 | 分镜脚本包 |
| `education_lesson_note_v1` | 教育内容 | 课程目标、受众水平、时长 | 目标可测性、讲解段落完整性 | 讲义草稿 |

## 15. 用户交互时序（从创建到交付）

1. 用户在任务页选择模板 + Rubric（可选自定义）。
2. 系统做 DAG 校验与 Rubric 校验，失败则阻止启动并提示定位。
3. 运行控制台显示节点状态流和当前执行节点。
4. 若 Review 失败，控制台展示违规证据并触发定向 Repair。
5. 若 Repair 超过上限，进入 Human Gate，用户可手改并继续。
6. 最终在结果页查看“最终稿 vs 修复前草稿”diff 与规则命中报告。

---

该文档作为当前分支基线设计，代码实现遵循“通用编排层 + 模板层 + 可配置评审层”分离原则推进。
