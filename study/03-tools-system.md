# 阶段三：Tools 工具系统分析

## 1. 工具系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ToolRegistry                                 │
│  (packages/core/src/tools/tool-registry.ts)                         │
│  - 工具注册中心                                                       │
│  - 管理所有内置工具 + MCP 工具 + 发现的工具                            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Built-in     │     │  DiscoveredTool │     │ DiscoveredMCP   │
│  Tools        │     │  (命令行发现)     │     │ Tool (MCP服务器) │
└───────────────┘     └─────────────────┘     └─────────────────┘
```

## 2. 工具基类层次

```typescript
// 接口定义
interface ToolBuilder<TParams, TResult> {
  name: string;
  displayName: string;
  description: string;
  kind: Kind;
  schema: FunctionDeclaration;
  isOutputMarkdown: boolean;
  canUpdateOutput: boolean;
  build(params: TParams): ToolInvocation<TParams, TResult>;
}

// 抽象基类
abstract class DeclarativeTool<TParams, TResult>
  implements ToolBuilder<TParams, TResult> {
    // 提供基础实现
    abstract build(params: TParams): ToolInvocation<TParams, TResult>;
}

// 带验证的基类
abstract class BaseDeclarativeTool<TParams, TResult>
  extends DeclarativeTool<TParams, TResult> {
    // 自动进行 JSON Schema 验证
    build(params: TParams): ToolInvocation<TParams, TResult> {
      const validationError = this.validateToolParams(params);
      if (validationError) throw new Error(validationError);
      return this.createInvocation(params, ...);
    }

    abstract createInvocation(params, ...): ToolInvocation<TParams, TResult>;
}
```

## 3. 工具调用类

```typescript
interface ToolInvocation<TParams, TResult> {
  params: TParams;                    // 验证后的参数
  getDescription(): string;           // 获取操作描述
  toolLocations(): ToolLocation[];    // 影响的文件路径
  shouldConfirmExecute(): Promise<ToolCallConfirmationDetails | false>;
  execute(signal, updateOutput?, shellConfig?): Promise<TResult>;
}

abstract class BaseToolInvocation<TParams, TResult>
  implements ToolInvocation<TParams, TResult> {
    // 集成 MessageBus 进行权限确认
    protected getMessageBusDecision(): Promise<'ALLOW' | 'DENY' | 'ASK_USER'>;
}
```

## 4. 工具类型 (Kind)

```typescript
enum Kind {
  Read = 'read',       // 读取操作（无需确认）
  Edit = 'edit',       // 编辑操作（需确认）
  Delete = 'delete',   // 删除操作（需确认）
  Move = 'move',       // 移动操作（需确认）
  Search = 'search',   // 搜索操作（无需确认）
  Execute = 'execute', // 执行命令（需确认）
  Think = 'think',     // 思考操作
  Fetch = 'fetch',     // 网络获取
  Other = 'other',     // 其他
}

// 有副作用的操作
const MUTATOR_KINDS = [Kind.Edit, Kind.Delete, Kind.Move, Kind.Execute];
```

## 5. 内置工具清单

**位置**: `packages/core/src/tools/`

### 5.1 文件操作

| 工具 | 文件 | Kind | 说明 |
|------|------|------|------|
| ReadFile | `read-file.ts` | Read | 读取单个文件 |
| ReadManyFiles | `read-many-files.ts` | Read | 批量读取文件 |
| WriteFile | `write-file.ts` | Edit | 写入文件 |
| Edit | `edit.ts` | Edit | 编辑文件（diff） |
| Ls | `ls.ts` | Read | 列出目录 |
| Glob | `glob.ts` | Search | 文件模式匹配 |

### 5.2 搜索

| 工具 | 文件 | Kind | 说明 |
|------|------|------|------|
| Grep | `grep.ts` | Search | 内容搜索 |
| RipGrep | `ripGrep.ts` | Search | 使用 ripgrep |

### 5.3 执行

| 工具 | 文件 | Kind | 说明 |
|------|------|------|------|
| Shell | `shell.ts` | Execute | 执行 Shell 命令 |
| WebFetch | `web-fetch.ts` | Fetch | 获取网页内容 |
| WebSearch | `web-search.ts` | Search | 网络搜索 |

### 5.4 MCP 扩展

| 工具 | 文件 | Kind | 说明 |
|------|------|------|------|
| MCPTool | `mcp-tool.ts` | Other | MCP 服务器工具 |
| MCPClient | `mcp-client.ts` | - | MCP 客户端管理 |

### 5.5 其他

| 工具 | 文件 | Kind | 说明 |
|------|------|------|------|
| MemoryTool | `memoryTool.ts` | Other | 记忆管理 |
| WriteTodos | `write-todos.ts` | Edit | 待办事项 |

## 6. ToolRegistry 工具注册中心

**位置**: `packages/core/src/tools/tool-registry.ts:190`

### 6.1 主要方法

```typescript
class ToolRegistry {
  private allKnownTools: Map<string, AnyDeclarativeTool>;

  // 注册工具
  registerTool(tool: AnyDeclarativeTool): void;

  // 发现工具（命令行 + MCP）
  async discoverAllTools(): Promise<void>;

  // 获取工具声明（供 Gemini API 使用）
  getFunctionDeclarations(): FunctionDeclaration[];

  // 获取单个工具
  getTool(name: string): AnyDeclarativeTool | undefined;

  // 按服务器获取工具
  getToolsByServer(serverName: string): AnyDeclarativeTool[];

  // 排序工具（内置 → 发现 → MCP）
  sortTools(): void;
}
```

### 6.2 工具排序优先级

```
1. Built-in Tools (内置工具)
2. Discovered Tools (命令行发现)
3. MCP Tools (按服务器名排序)
```

### 6.3 工具发现机制

```typescript
// 从命令行发现工具
private async discoverAndRegisterToolsFromCommand(): Promise<void> {
  const discoveryCmd = this.config.getToolDiscoveryCommand();
  // 执行命令，解析 JSON 输出
  // 注册为 DiscoveredTool
}
```

## 7. 工具确认流程

### 7.1 确认类型

```typescript
type ToolCallConfirmationDetails =
  | ToolEditConfirmationDetails    // 编辑确认（显示 diff）
  | ToolExecuteConfirmationDetails // 执行确认（显示命令）
  | ToolMcpConfirmationDetails     // MCP 工具确认
  | ToolInfoConfirmationDetails;   // 信息确认
```

### 7.2 确认选项

```typescript
enum ToolConfirmationOutcome {
  ProceedOnce = 'proceed_once',           // 本次允许
  ProceedAlways = 'proceed_always',       // 总是允许
  ProceedAlwaysServer = 'proceed_always_server',  // 允许该服务器
  ProceedAlwaysTool = 'proceed_always_tool',      // 允许该工具
  ModifyWithEditor = 'modify_with_editor', // 用编辑器修改
  Cancel = 'cancel',                       // 取消
}
```

### 7.3 确认流程

```
1. BaseToolInvocation.shouldConfirmExecute()
       │
       ▼
2. getMessageBusDecision() → 查询 PolicyEngine
       │
       ├── ALLOW  → 直接执行
       ├── DENY   → 抛出错误
       └── ASK_USER → 显示确认 UI
              │
              ▼
3. getConfirmationDetails() → 返回确认信息
       │
       ▼
4. UI 显示确认对话框
       │
       ▼
5. 用户选择 → onConfirm() 回调
```

## 8. ToolResult 返回结构

```typescript
interface ToolResult {
  // 给 LLM 看的内容（加入历史记录）
  llmContent: PartListUnion;

  // 给用户看的内容（UI 显示）
  returnDisplay: ToolResultDisplay;

  // 错误信息（可选）
  error?: {
    message: string;
    type?: ToolErrorType;
  };
}

type ToolResultDisplay =
  | string          // 普通文本
  | FileDiff        // 文件差异
  | AnsiOutput      // 终端输出
  | TodoList;       // 待办列表
```

## 9. 工具错误类型

```typescript
// packages/core/src/tools/tool-error.ts
enum ToolErrorType {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_TOOL_PARAMS = 'INVALID_TOOL_PARAMS',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  DISCOVERED_TOOL_EXECUTION_ERROR = 'DISCOVERED_TOOL_EXECUTION_ERROR',
  // ...
}
```

## 10. 实现一个自定义工具示例

```typescript
import { BaseDeclarativeTool, BaseToolInvocation, Kind, ToolResult } from './tools.js';

interface MyToolParams {
  input: string;
}

class MyToolInvocation extends BaseToolInvocation<MyToolParams, ToolResult> {
  getDescription(): string {
    return `Processing: ${this.params.input}`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    // 实现工具逻辑
    const result = `Processed: ${this.params.input}`;
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }
}

export class MyTool extends BaseDeclarativeTool<MyToolParams, ToolResult> {
  constructor() {
    super(
      'my_tool',           // name
      'My Custom Tool',    // displayName
      'A custom tool',     // description
      Kind.Other,          // kind
      {                    // parameterSchema
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Input text' },
        },
        required: ['input'],
      },
    );
  }

  protected createInvocation(params: MyToolParams): MyToolInvocation {
    return new MyToolInvocation(params);
  }
}
```

## 11. 下一步学习

- [ ] 分析 Shell 工具的沙箱实现
- [ ] 研究 Edit 工具的 diff 生成
- [ ] 理解 MCP 工具的集成方式
- [ ] 学习 PolicyEngine 权限控制
