# 阶段四：MCP 协议实现分析

## 1. MCP 概述

**MCP (Model Context Protocol)** 是一个开放协议，允许 AI 应用连接外部工具和数据源。

```
┌──────────────────┐          ┌──────────────────┐
│   Gemini CLI     │   MCP    │   MCP Server     │
│   (MCP Client)   │◄────────►│  (第三方服务)     │
└──────────────────┘ Protocol └──────────────────┘
```

## 2. 核心类结构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        McpClientManager                              │
│  管理多个 MCP Server 连接                                            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ 管理
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          McpClient                                   │
│  (packages/core/src/tools/mcp-client.ts)                            │
│  单个 MCP Server 的客户端                                            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ 发现
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       DiscoveredMCPTool                              │
│  (packages/core/src/tools/mcp-tool.ts)                              │
│  从 MCP Server 发现的工具                                            │
└─────────────────────────────────────────────────────────────────────┘
```

## 3. MCP Server 配置

**位置**: 用户配置文件 `settings.json`

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@example/mcp-server"],
      "env": {
        "API_KEY": "xxx"
      },
      "timeout": 60000,
      "trust": true
    }
  }
}
```

### 3.1 配置选项

| 字段 | 类型 | 说明 |
|------|------|------|
| `command` | string | 启动命令 |
| `args` | string[] | 命令参数 |
| `env` | object | 环境变量 |
| `timeout` | number | 超时时间(ms)，默认 10 分钟 |
| `trust` | boolean | 是否信任（跳过确认） |
| `url` | string | HTTP/SSE 模式的 URL |
| `transportType` | string | 传输类型：stdio/sse/http |

## 4. McpClient 实现分析

**位置**: `packages/core/src/tools/mcp-client.ts:103`

### 4.1 连接状态

```typescript
enum MCPServerStatus {
  DISCONNECTED = 'disconnected',    // 已断开
  DISCONNECTING = 'disconnecting',  // 断开中
  CONNECTING = 'connecting',        // 连接中
  CONNECTED = 'connected',          // 已连接
}
```

### 4.2 核心方法

```typescript
class McpClient {
  private client: Client | undefined;      // MCP SDK Client
  private transport: Transport | undefined; // 传输层

  // 连接到 MCP Server
  async connect(): Promise<void>;

  // 发现工具、提示词、资源
  async discover(cliConfig: Config): Promise<void>;

  // 断开连接
  async disconnect(): Promise<void>;

  // 读取资源
  async readResource(uri: string): Promise<ReadResourceResult>;
}
```

### 4.3 连接流程

```
1. connect()
   │
   ├── 检查当前状态 (必须是 DISCONNECTED)
   │
   ├── 更新状态 → CONNECTING
   │
   ├── connectToMcpServer()  // 建立传输连接
   │       │
   │       ├── StdioClientTransport (stdio 模式)
   │       ├── SSEClientTransport (SSE 模式)
   │       └── StreamableHTTPClientTransport (HTTP 模式)
   │
   ├── registerNotificationHandlers()  // 注册通知处理
   │
   └── 更新状态 → CONNECTED

2. discover()
   │
   ├── discoverPrompts()    // 发现提示词
   ├── discoverTools()      // 发现工具
   └── discoverResources()  // 发现资源
```

## 5. 传输层 (Transport)

### 5.1 Stdio 模式

```typescript
// 通过子进程标准输入输出通信
const transport = new StdioClientTransport({
  command: serverConfig.command,
  args: serverConfig.args,
  env: { ...process.env, ...serverConfig.env },
  cwd: workingDirectory,
});
```

### 5.2 SSE 模式

```typescript
// 通过 Server-Sent Events 通信
const transport = new SSEClientTransport(url, options);
```

### 5.3 HTTP 模式

```typescript
// 通过 HTTP Streaming 通信
const transport = new StreamableHTTPClientTransport(url, options);
```

## 6. DiscoveredMCPTool 工具实现

**位置**: `packages/core/src/tools/mcp-tool.ts:215`

### 6.1 类结构

```typescript
class DiscoveredMCPTool extends BaseDeclarativeTool<ToolParams, ToolResult> {
  constructor(
    private readonly mcpTool: CallableTool,  // MCP SDK 提供的可调用工具
    readonly serverName: string,              // 服务器名称
    readonly serverToolName: string,          // 原始工具名
    description: string,
    parameterSchema: unknown,
    readonly trust?: boolean,                 // 是否信任
    nameOverride?: string,                    // 名称覆盖
    private readonly cliConfig?: Config,
  ) {}

  // 获取完全限定前缀
  getFullyQualifiedPrefix(): string {
    return `${this.serverName}__`;
  }

  // 转换为完全限定名称的工具
  asFullyQualifiedTool(): DiscoveredMCPTool;
}
```

### 6.2 工具调用执行

```typescript
class DiscoveredMCPToolInvocation extends BaseToolInvocation<...> {
  async execute(signal: AbortSignal): Promise<ToolResult> {
    // 1. 构建函数调用
    const functionCalls: FunctionCall[] = [{
      name: this.serverToolName,
      args: this.params,
    }];

    // 2. 调用 MCP 工具
    const rawResponseParts = await this.mcpTool.callTool(functionCalls);

    // 3. 检查错误
    if (this.isMCPToolError(rawResponseParts)) {
      return { /* 错误结果 */ };
    }

    // 4. 转换响应格式
    const transformedParts = transformMcpContentToParts(rawResponseParts);

    return {
      llmContent: transformedParts,
      returnDisplay: getStringifiedResultForDisplay(rawResponseParts),
    };
  }
}
```

## 7. MCP 内容类型

### 7.1 支持的内容块

```typescript
type McpContentBlock =
  | McpTextBlock         // 文本: { type: 'text', text: string }
  | McpMediaBlock        // 媒体: { type: 'image'|'audio', mimeType, data }
  | McpResourceBlock     // 资源: { type: 'resource', resource: {...} }
  | McpResourceLinkBlock;// 链接: { type: 'resource_link', uri, title }
```

### 7.2 内容转换

```typescript
// MCP 响应 → Gemini API Part 格式
function transformMcpContentToParts(sdkResponse: Part[]): Part[] {
  const mcpContent = funcResponse?.response?.['content'];

  return mcpContent.flatMap((block) => {
    switch (block.type) {
      case 'text':
        return { text: block.text };
      case 'image':
      case 'audio':
        return [{
          text: `[Tool provided ${block.type}...]`,
        }, {
          inlineData: { mimeType: block.mimeType, data: block.data },
        }];
      // ...
    }
  });
}
```

## 8. 工具确认机制

### 8.1 允许列表

```typescript
class DiscoveredMCPToolInvocation {
  // 静态允许列表
  private static readonly allowlist: Set<string> = new Set();

  protected async getConfirmationDetails(): Promise<...> {
    // 检查信任配置
    if (this.cliConfig?.isTrustedFolder() && this.trust) {
      return false; // 无需确认
    }

    // 检查服务器/工具是否已允许
    if (DiscoveredMCPToolInvocation.allowlist.has(serverAllowListKey)) {
      return false;
    }

    // 需要确认
    return {
      type: 'mcp',
      title: 'Confirm MCP Tool Execution',
      serverName: this.serverName,
      toolName: this.serverToolName,
      onConfirm: async (outcome) => {
        // 根据选择添加到允许列表
      },
    };
  }
}
```

### 8.2 确认选项

```typescript
enum ToolConfirmationOutcome {
  ProceedOnce = 'proceed_once',               // 本次允许
  ProceedAlwaysServer = 'proceed_always_server', // 允许该服务器所有工具
  ProceedAlwaysTool = 'proceed_always_tool',     // 允许该特定工具
  Cancel = 'cancel',
}
```

## 9. 动态更新支持

### 9.1 通知处理

```typescript
private registerNotificationHandlers(): void {
  const capabilities = this.client.getServerCapabilities();

  // 工具列表变更通知
  if (capabilities?.tools?.listChanged) {
    this.client.setNotificationHandler(
      ToolListChangedNotificationSchema,
      async () => {
        await this.refreshTools();
      },
    );
  }

  // 资源列表变更通知
  if (capabilities?.resources?.listChanged) {
    this.client.setNotificationHandler(
      ResourceListChangedNotificationSchema,
      async () => {
        await this.refreshResources();
      },
    );
  }
}
```

## 10. OAuth 认证支持

**位置**: `packages/core/src/mcp/oauth-provider.ts`

### 10.1 认证提供者

```typescript
// 支持的认证类型
enum AuthProviderType {
  GOOGLE = 'google',           // Google OAuth
  OAUTH = 'oauth',             // 标准 OAuth 2.0
  SA_IMPERSONATION = 'sa-impersonation', // 服务账号模拟
}
```

### 10.2 Token 存储

```typescript
// packages/core/src/mcp/oauth-token-storage.ts
class MCPOAuthTokenStorage {
  // 存储和管理 OAuth tokens
  // 支持刷新 token
}
```

## 11. 工具名称处理

```typescript
// 生成有效的工具名称（符合 Gemini API 限制）
function generateValidName(name: string) {
  // 替换无效字符
  let validToolname = name.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // 限制长度 63 字符
  if (validToolname.length > 63) {
    validToolname = validToolname.slice(0, 28) + '___' + validToolname.slice(-32);
  }
  return validToolname;
}

// 完全限定名格式: serverName__toolName
getFullyQualifiedPrefix(): string {
  return `${this.serverName}__`;
}
```

## 12. 实践：添加 MCP Server

### 12.1 配置示例

```json
// settings.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"],
      "trust": true
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-token"
      }
    }
  }
}
```

### 12.2 常用 MCP Servers

| 服务器 | 功能 |
|--------|------|
| `@modelcontextprotocol/server-filesystem` | 文件系统访问 |
| `@modelcontextprotocol/server-github` | GitHub API |
| `@modelcontextprotocol/server-postgres` | PostgreSQL 数据库 |
| `@modelcontextprotocol/server-brave-search` | Brave 搜索 |

## 13. 下一步学习

- [ ] 分析 UI 层 Ink 框架实现
- [ ] 研究 PolicyEngine 权限系统
- [ ] 了解 ChatRecordingService 会话持久化
- [ ] 学习 Prompt Registry 提示词管理
