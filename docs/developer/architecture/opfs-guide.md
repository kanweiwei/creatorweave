---
title: OPFS 使用指南
order: 202
---

# OPFS 使用场景指南

## 什么是 OPFS？

**OPFS** = **Origin Private File System**（源站私有文件系统）

浏览器提供的一个私有、高性能的文件存储 API，特点：

| 特性 | 说明 |
|------|------|
| 私有性 | 只有页面源站可访问，对用户不可见 |
| 高性能 | 支持同步读写（`FileSystemSyncAccessHandle`） |
| 大容量 | 配额动态分配，远超 localStorage |
| 持久化 | 数据持久保存，不因关闭浏览器而丢失 |

## 适用场景

### 大文件分析结果缓存

**需求**：分析 10,000 个文件的结果可能是几 MB 的 JSON 数据

| 方案 | 问题 |
|------|------|
| localStorage | 只有 5MB，不够用 |
| IndexedDB | 可行，但读取需要反序列化整个对象 |
| **OPFS** | 适合大数据，流式读写 |

### 插件处理大文件的临时存储

背景：MD5 插件、行数统计插件需要读取文件内容

```
用户选择 100MB 的 log 文件 → 插件需要分析
     ↓
当前方案：每次重新读取全文（慢）
OPFS 方案：首次读取后缓存到 OPFS，插件直接从 OPFS 读取
```

优势：
- 避免重复请求用户授权
- 插件可以在 Web Worker 中同步读取

### AI Agent 的工作目录

背景：项目有 AI Agent 功能（`web/src/agent/`）

OPFS 可以像真实文件系统一样操作（mkdir, writeFile, readFile），Agent 执行完可以清理临时目录。

### 文件索引/搜索加速

建立索引阶段：遍历文件夹 → 提取文件元数据/关键词 → 写入 OPFS 索引文件

搜索阶段：直接从 OPFS 索引文件读取

### 批量操作的断点续传

场景：批量重命名 10,000 个文件，中途崩溃

使用 OPFS 记录进度：每处理 100 个文件，checkpoint 写入 OPFS，重启后从 checkpoint 恢复。

## 不适合的场景

| 场景 | 原因 | 更好的方案 |
|------|------|-----------|
| 小配置存储 | 太重 | localStorage |
| 文件句柄持久化 | OPFS 存不了句柄对象 | IndexedDB |
| 需要复杂查询 | OPFS 是文件系统，不是数据库 | IndexedDB |
| 简单键值存储 | 过度设计 | localStorage / IndexedDB |

## 实现注意事项

### 浏览器兼容性检查

```typescript
export function isOFPSSupported(): boolean {
  return 'getDirectory' in navigator.storage
}
```

### 错误处理

```typescript
async function safeOPFSOperation<T>(
  operation: () => Promise<T>,
  fallback: () => Promise<T>
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    console.error('OPFS error:', error)
    return await fallback()
  }
}
```

### 存储配额管理

```typescript
async function checkOPFSQuota(): Promise<{ usage: number; quota: number }> {
  const estimate = await navigator.storage.estimate()
  return {
    usage: estimate.usage || 0,
    quota: estimate.quota || 0
  }
}
```

## 参考资源

- [MDN - Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API#Origin_private_file_system)
- [Chrome Developers - File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)

## 相关文档

- [架构概览](overview.md)
