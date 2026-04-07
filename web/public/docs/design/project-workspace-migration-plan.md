# Project -> Workspace 迁移执行方案

目标：在不破坏现有能力的前提下，将当前“全局目录句柄 + workspace”演进为  
`Project（目录与索引边界） -> Workspace（任务与视图边界）`。

---

## 1. 当前状态（基于现有实现）

1. 目录句柄是全局态（`agent.store.ts`），非 workspace 绑定。
2. workspace 在存储层是核心实体（`workspaces` 表 + `active_workspace`）。
3. `workspace.store.ts` 中存在大量“conversationId == workspaceId”的逻辑耦合。
4. `file_metadata/pending_changes/undo_records` 全部以 `workspace_id` 作为数据边界。

这意味着：现在直接做多 Project 会引发会话、权限、索引、缓存全链路耦合问题。

---

## 2. 目标模型

### 2.1 领域模型

1. `Project`：数据/权限边界（绑定目录句柄、索引、权限状态）。
2. `Workspace`：任务边界（会话、规则、视图配置、结果卡），属于某个 Project。

### 2.2 关键关系

1. 一个 Project 可有多个 Workspace。
2. Workspace 不直接持有目录句柄。
3. 文件索引缓存优先按 Project 归档；Workspace 仅定义过滤与视图。

---

## 3. 迁移原则

1. 先加模型，后迁移行为。
2. 首先保持单 Project 运行（默认 project），不改用户外部体验。
3. 迁移过程必须支持回退（schema + store 双层回退）。
4. 先打通读路径，再切换写路径，最后清理旧字段。

---

## 4. 分阶段实施

## Phase 1：引入 Project 基础模型（兼容模式）

范围：

1. 新增 `projects` 表与 `active_project` 表。
2. 为 `workspaces` 增加 `project_id`（默认填充）。
3. 应用层维持“看起来是原样”。

涉及文件：

1. `web/src/sqlite/sqlite-schema.sql`
2. `web/src/sqlite/migrations/index.ts`（新增 migration）
3. `web/src/sqlite/sqlite-database.ts`（若有 schema 校验逻辑）
4. `web/src/sqlite/repositories/workspace.repository.ts`
5. 新增 `web/src/sqlite/repositories/project.repository.ts`
6. `web/src/sqlite/index.ts`（导出 project repo）

验收标准：

1. 老数据可自动升级，不丢 workspace。
2. 所有 workspace 均有 `project_id`（默认 project）。
3. lint/typecheck/test 全通过。

---

## Phase 2：状态层切换为 “activeProject + activeWorkspace”

范围：

1. 新增 `project.store.ts`（activeProject、列表、切换）。
2. `workspace.store.ts` 查询与写入都带 `projectId`。
3. 将“全局目录句柄语义”改为“activeProject 目录句柄”。

涉及文件：

1. 新增 `web/src/store/project.store.ts`
2. `web/src/store/workspace.store.ts`
3. `web/src/store/agent.store.ts`（directoryHandle 语义层调整）
4. `web/src/App.tsx`（初始化顺序加入 activeProject 恢复）
5. `web/src/native-fs/directory-handle-manager.ts`（按 projectId 存句柄）

验收标准：

1. 单 Project 体验与当前一致。
2. 刷新后目录权限恢复指向 activeProject。
3. 不再出现 workspace 直接管理目录句柄的新逻辑。

---

## Phase 3：数据边界下沉到 Project（索引与缓存）

范围：

1. 将文件元数据、待同步变更、撤销记录从 workspace 边界迁移到 project 边界。
2. Workspace 仅保留“视图选择 + 任务状态”。

建议策略（低风险）：

1. 先新增 `project_id` 列并双写（workspace_id + project_id）。
2. 稳定后再逐步弱化 `workspace_id` 依赖。

涉及文件：

1. `web/src/sqlite/sqlite-schema.sql`（新增列/索引）
2. `web/src/sqlite/migrations/index.ts`
3. `web/src/sqlite/repositories/workspace.repository.ts`（可能拆分部分查询）
4. 新增或扩展 `project.repository.ts`
5. `web/src/opfs/session/*`（统计与索引查询路径）

验收标准：

1. 同一 Project 下多 Workspace 共享文件索引结果。
2. Workspace 切换不重复重建 Project 级索引。
3. 历史 undo/pending 数据可追溯。

---

## Phase 4：UI 与产品语义升级

范围：

1. 顶层增加 Project 选择器。
2. Workspace 创建入口移动到 Project 内部。
3. 错误与权限提示文案改为“项目权限”。

涉及文件（示例）：

1. `web/src/components/layout/WorkspaceLayout.tsx`
2. `web/src/components/workspace/*`
3. `web/src/components/settings/*`（项目管理入口）
4. i18n 文案资源

验收标准：

1. 用户能理解“先选 Project，再切 Workspace”。
2. 权限失效提示与恢复路径准确。

---

## 5. 数据迁移细节（建议）

推荐 migration 步骤：

1. 创建 `projects`（默认插入 `default-project`）。
2. `workspaces` 增加 `project_id`，并回填 `default-project`。
3. 创建 `active_project`，默认值指向 `default-project`。
4. 增加 `workspaces(project_id, last_accessed_at)` 复合索引。

注意：

1. 迁移必须幂等（`IF NOT EXISTS`、安全回填）。
2. 迁移失败时保留旧数据，拒绝进入“半迁移状态”。

---

## 6. 风险与缓解

风险：

1. 旧逻辑大量假设 `workspaceId == conversationId`。
2. 句柄恢复流程依赖浏览器激活时机，迁移后容易出错。
3. OPFS session manager 与 SQLite 元数据不一致时，切换逻辑会出现幽灵 workspace。

缓解：

1. 先引入适配层函数：`resolveWorkspaceProject(workspaceId)`。
2. 加迁移专用健康检查：schema version + orphan records 检查。
3. 增加端到端回归用例：创建/切换/刷新/权限恢复/删除。

---

## 7. 建议里程碑（3 周）

1. 第 1 周：Phase 1 完成并上线（内部验证）。
2. 第 2 周：Phase 2 完成（状态语义切换）。
3. 第 3 周：Phase 3 的双写与查询改造 + 最小 UI 升级。

---

## 8. Definition of Done

1. 数据层：`projects` 全量生效，workspace 必有 project_id。
2. 状态层：activeProject/activeWorkspace 双状态稳定。
3. 行为层：目录权限恢复基于 Project。
4. 质量层：`pnpm -C web lint && pnpm -C web typecheck` 通过；关键回归测试通过。

---

最后更新：2026-02-28
