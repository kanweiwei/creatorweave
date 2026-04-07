---
title: CI/CD 配置
order: 103
---

# CI/CD 配置

项目使用 GitHub Actions 进行持续集成和部署。

## CI 流程

每次 PR 和 push 到 main/develop 分支会触发 CI：

1. 安装依赖
2. 运行类型检查
3. 运行 ESLint
4. 运行单元测试
5. 运行 E2E 测试

## 本地验证

在提交前运行：

```bash
pnpm lint          # ESLint 检查
pnpm typecheck     # 类型检查
pnpm test          # 单元测试
pnpm test:e2e      # E2E 测试
```

## 相关文档

- [Pre-commit Hooks](pre-commit-hooks.md)
