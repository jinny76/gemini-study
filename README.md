# Gemini CLI Study

Gemini CLI 源码学习与实验项目。

## 项目结构

```
├── study/          # 源码学习笔记
├── web/            # Web 界面实验 (基于 gemini-cli-core)
└── gemini-cli/     # Gemini CLI 源码 (gitignore)
```

## 学习笔记

| 文件 | 内容 |
|------|------|
| [01-entry-and-startup.md](study/01-entry-and-startup.md) | 入口与启动流程 |
| [02-core-architecture.md](study/02-core-architecture.md) | 核心架构分析 |
| [03-tools-system.md](study/03-tools-system.md) | 工具系统 |
| [04-mcp-protocol.md](study/04-mcp-protocol.md) | MCP 协议 |
| [05-ui-ink-framework.md](study/05-ui-ink-framework.md) | Ink UI 框架 |
| [06-gemini-cli-ui-architecture.md](study/06-gemini-cli-ui-architecture.md) | UI 架构深入分析 |
| [07-gemini-cli-stdin-handling.md](study/07-gemini-cli-stdin-handling.md) | 标准输入处理 |
| [GEMINI_CLI_STUDY_GUIDE.md](study/GEMINI_CLI_STUDY_GUIDE.md) | 学习指南 |

## Web 界面

基于 `@google/gemini-cli-core` 实现的 Web 版本，详见 [web/README.md](web/README.md)。

### 功能

- Chat 对话界面
- 工具调用确认
- 文件浏览器
- 登录认证
- 模型自动降级 (配额用尽时自动切换)

### 运行

```bash
cd web
npm install
npm run dev
```

## 相关链接

- [Gemini CLI](https://github.com/anthropics/claude-code) - 官方仓库
- [Gemini API](https://ai.google.dev/) - API 文档
