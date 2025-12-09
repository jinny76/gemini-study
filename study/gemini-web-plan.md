# Gemini Web CLI - 基于 Gemini CLI 源码的 Web UI

## 核心理念

**不改或尽量少改 Gemini CLI 代码，只替换 UI 层**

- 完全复用 `packages/core`（工具系统、对话管理、MCP 等）
- 新建 `packages/web` 作为 Web 前端
- Gemini CLI 升级时，只需 `git pull`，自动获得新能力

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     Mobile Browser                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 React Web UI                           │  │
│  │   (替代 packages/cli 的 Ink 终端 UI)                    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │ WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    packages/web                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Web Server (Express)                      │  │
│  │  - 静态文件服务                                         │  │
│  │  - WebSocket 代理                                       │  │
│  │  - 认证管理                                             │  │
│  └───────────────────────────────────────────────────────┘  │
│                              │                               │
│                              ▼                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           直接调用 packages/core                        │  │
│  │  - GeminiClient (对话)                                  │  │
│  │  - ToolRegistry (工具)                                  │  │
│  │  - Config (配置)                                        │  │
│  │  - 所有现有能力...                                      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    packages/core                             │
│                    (完全不修改)                               │
│  - tools/ (文件、Shell、搜索、网页抓取...)                    │
│  - core/ (GeminiClient, GeminiChat, Turn...)                │
│  - mcp/ (MCP 协议支持)                                       │
│  - prompts/ (System Prompt)                                  │
│  - services/ (各种服务)                                      │
└─────────────────────────────────────────────────────────────┘
```

## 目录结构

```
gemini-cli/                    # 原始仓库（git submodule 或直接 fork）
├── packages/
│   ├── core/                  # 不修改！直接复用
│   ├── cli/                   # 不修改！保留原有 CLI
│   │
│   └── web/                   # 新增！Web UI 包
│       ├── src/
│       │   ├── server/        # Web 服务端
│       │   │   ├── index.ts   # 入口
│       │   │   ├── websocket.ts
│       │   │   ├── auth.ts
│       │   │   └── session.ts
│       │   │
│       │   └── client/        # React 前端
│       │       ├── main.tsx
│       │       ├── App.tsx
│       │       ├── components/
│       │       │   ├── Chat/
│       │       │   ├── ToolConfirm/
│       │       │   └── Layout/
│       │       ├── hooks/
│       │       └── styles/
│       │
│       ├── public/            # 静态资源
│       │   ├── manifest.json  # PWA
│       │   └── icons/
│       │
│       ├── package.json
│       ├── vite.config.ts
│       └── tsconfig.json
│
├── package.json               # workspace 配置（需小改，添加 web）
└── ...
```

## 关键改动点

### 1. 根 package.json（极小改动）

```json
{
  "workspaces": [
    "packages/core",
    "packages/cli",
    "packages/web"    // 新增
  ]
}
```

### 2. packages/web/package.json

```json
{
  "name": "@anthropic/gemini-web",
  "dependencies": {
    "@anthropic/gemini-core": "workspace:*",  // 复用 core
    "express": "^4.18.0",
    "ws": "^8.0.0"
  },
  "devDependencies": {
    "react": "^18.0.0",
    "vite": "^5.0.0",
    "tailwindcss": "^3.0.0"
  }
}
```

## 核心实现思路

### 1. 复用 Core 的方式

```typescript
// packages/web/src/server/session.ts
import {
  Config,
  GeminiClient,
  ToolRegistry,
  // ... 所有需要的导出
} from '@anthropic/gemini-core';

// 创建配置（复用 core 的配置系统）
const config = new Config({
  workingDirectory: projectPath,
  // ...
});

// 创建客户端（完全复用）
const client = new GeminiClient(config);
await client.initialize();

// 发送消息（完全复用）
for await (const event of client.sendMessageStream(message, signal, promptId)) {
  // 转发到 WebSocket
  ws.send(JSON.stringify(event));
}
```

### 2. 工具确认机制

```typescript
// 监听工具调用事件
for await (const event of client.sendMessageStream(...)) {
  if (event.type === 'ToolCall') {
    // 发送到前端等待确认
    ws.send(JSON.stringify({
      type: 'tool_confirm',
      tool: event.value.name,
      args: event.value.args,
    }));

    // 等待前端响应
    const decision = await waitForConfirmation();
    // ...
  }
}
```

### 3. 前端 UI（移动端优化）

参考原计划中的 UI 设计，实现：
- 消息列表（Markdown 渲染）
- 工具确认弹窗
- 文件浏览器
- 底部导航

## 实现步骤

### Phase 1: 项目设置
1. Fork gemini-cli 或作为 submodule
2. 在 packages/ 下创建 web 目录
3. 配置 workspace
4. 验证可以导入 @anthropic/gemini-core

### Phase 2: 服务端骨架
1. Express 服务器 + WebSocket
2. 创建 Session 管理（复用 Config, GeminiClient）
3. 实现消息转发

### Phase 3: 前端基础
1. Vite + React + Tailwind
2. WebSocket 连接
3. 基础消息展示

### Phase 4: 核心功能
1. 流式消息渲染
2. 工具调用展示
3. 工具确认交互

### Phase 5: 移动端 + PWA
1. 响应式布局
2. 触摸优化
3. PWA manifest + Service Worker

## 升级策略

```bash
# Gemini CLI 发布新版本时
cd gemini-cli
git pull origin main

# packages/web 保持不变
# 自动获得 core 的新能力
npm install
npm run build
```

## 优势

1. **最小改动**: 只新增 packages/web，不修改现有代码
2. **自动升级**: core 更新时自动获得新工具、新功能
3. **完全兼容**: 原有 CLI 仍可正常使用
4. **维护简单**: 只需维护 Web UI 层
