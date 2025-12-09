# Gemini CLI 深度学习指南

## 项目结构总览

```
gemini-cli/
├── packages/
│   ├── core/                 # 核心逻辑库（重点学习）
│   │   └── src/
│   │       ├── agents/       # Agent 代理系统
│   │       ├── commands/     # 命令处理
│   │       ├── config/       # 配置管理
│   │       ├── core/         # 核心引擎
│   │       ├── hooks/        # Hook 系统
│   │       ├── mcp/          # MCP 协议实现
│   │       ├── prompts/      # Prompt 模板
│   │       ├── services/     # 服务层
│   │       ├── tools/        # 内置工具（文件、Shell、搜索等）
│   │       └── utils/        # 工具函数
│   │
│   ├── cli/                  # CLI 入口和 UI
│   │   └── src/
│   │       ├── gemini.tsx    # 主入口（React/Ink）
│   │       ├── ui/           # 终端 UI 组件
│   │       ├── commands/     # CLI 命令定义
│   │       └── services/     # CLI 服务
│   │
│   ├── a2a-server/           # Agent-to-Agent 服务
│   ├── vscode-ide-companion/ # VS Code 集成
│   └── test-utils/           # 测试工具
│
├── docs/                     # 官方文档
├── integration-tests/        # 集成测试
├── schemas/                  # JSON Schema 定义
└── scripts/                  # 构建脚本
```

---

## 学习路线

### 阶段一：快速上手（Day 1-2）

#### 1. 安装和运行
```bash
cd gemini-cli
npm install
npm run build
npm run dev   # 开发模式运行
```

#### 2. 阅读入门文档
- `README.md` - 项目介绍
- `docs/` 目录 - 详细文档
- `CONTRIBUTING.md` - 贡献指南
- `GEMINI.md` - 项目上下文（给 AI 看的）

---

### 阶段二：核心架构（Day 3-7）

#### 重点文件阅读顺序

| 优先级 | 文件路径 | 说明 |
|--------|----------|------|
| 1 | `packages/cli/src/gemini.tsx` | CLI 主入口，理解启动流程 |
| 2 | `packages/core/src/index.ts` | Core 模块导出，了解核心 API |
| 3 | `packages/core/src/core/` | 核心引擎实现 |
| 4 | `packages/core/src/tools/` | 工具系统（文件、Shell、搜索） |
| 5 | `packages/core/src/agents/` | Agent 系统设计 |
| 6 | `packages/core/src/mcp/` | MCP 协议扩展 |
| 7 | `packages/core/src/prompts/` | System Prompt 设计 |

---

### 阶段三：核心模块深入（Day 8-14）

#### 1. 工具系统 (Tools)
```
packages/core/src/tools/
├── file/          # 文件读写
├── shell/         # Shell 命令执行
├── search/        # 搜索功能
├── web/           # 网页获取
└── index.ts       # 工具注册
```

**学习要点：**
- 工具如何定义和注册
- 工具调用的参数校验
- 工具执行结果的处理

#### 2. Agent 系统
```
packages/core/src/agents/
```

**学习要点：**
- Agent 生命周期
- 对话上下文管理
- 流式响应处理

#### 3. MCP 协议
```
packages/core/src/mcp/
```

**学习要点：**
- MCP Server 连接管理
- 自定义 Tool 扩展
- 资源和 Prompt 共享

---

### 阶段四：UI 层（Day 15-18）

#### CLI UI 技术栈
- **Ink** - React for CLI
- **React Hooks** - 状态管理

```
packages/cli/src/ui/
├── components/    # UI 组件
├── hooks/         # 自定义 Hooks
└── themes/        # 主题配置
```

---

### 阶段五：实践项目（Day 19+）

#### 练习任务

1. **添加自定义 Tool**
   - 在 `packages/core/src/tools/` 添加新工具
   - 例如：添加一个时间查询工具

2. **创建 MCP Server**
   - 使用 `@modelcontextprotocol/sdk`
   - 实现一个简单的资源服务

3. **修改 System Prompt**
   - 在 `packages/core/src/prompts/` 中调整
   - 观察行为变化

4. **贡献开源**
   - 查看 GitHub Issues
   - 提交一个 PR

---

## 调试技巧

### VS Code 调试配置
项目已包含 `.vscode/` 配置，可直接使用 F5 调试。

### 日志观察
```bash
# 开发模式会输出详细日志
npm run dev
```

### 测试运行
```bash
npm run test              # 运行所有测试
npm run test -- --watch   # 监听模式
```

---

## 与 Claude Code 对比

| 特性 | Gemini CLI | Claude Code |
|------|------------|-------------|
| 模型 | Gemini 2.5 Pro | Claude |
| 上下文 | 1M tokens | 200K tokens |
| 扩展机制 | MCP | MCP |
| UI 框架 | Ink (React) | Ink (React) |
| 语言 | TypeScript | TypeScript |
| 认证 | OAuth/API Key/Vertex | OAuth/API Key |

---

## 推荐资源

- [Gemini CLI 官方文档](https://github.com/google-gemini/gemini-cli/tree/main/docs)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Ink - React for CLI](https://github.com/vadimdemedes/ink)
- [Google Gemini API](https://ai.google.dev/)

---

## 学习进度追踪

- [x] 阶段一：入口与启动流程 → `01-entry-and-startup.md`
- [x] 阶段二：Core 核心模块 → `02-core-architecture.md`
- [x] 阶段三：Tools 工具系统 → `03-tools-system.md`
- [x] 阶段四：MCP 协议实现 → `04-mcp-protocol.md`
- [x] 阶段五：UI 层与 Ink → `05-ui-ink-framework.md`

## 学习笔记目录

```
study/
├── GEMINI_CLI_STUDY_GUIDE.md   # 学习指南
├── 01-entry-and-startup.md     # 入口与启动流程
├── 02-core-architecture.md     # Core 核心架构
├── 03-tools-system.md          # Tools 工具系统
├── 04-mcp-protocol.md          # MCP 协议实现
└── 05-ui-ink-framework.md      # UI 层与 Ink 框架
```
