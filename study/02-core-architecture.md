# 阶段二：Core 核心模块架构分析

## 1. 核心类关系图

```
┌─────────────────────────────────────────────────────────────────────┐
│                          GeminiClient                                │
│  (packages/core/src/core/client.ts)                                 │
│  - 最高层抽象，管理整个对话会话                                        │
│  - 处理消息发送、工具调用、上下文压缩                                   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ 使用
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          GeminiChat                                  │
│  (packages/core/src/core/geminiChat.ts)                             │
│  - 管理对话历史                                                      │
│  - 处理流式响应                                                      │
│  - 重试逻辑                                                          │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ 使用
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       ContentGenerator                               │
│  (packages/core/src/core/contentGenerator.ts)                       │
│  - 接口定义：generateContent, generateContentStream, countTokens     │
│  - 实现类：LoggingContentGenerator, FakeContentGenerator            │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. GeminiClient 核心方法分析

**位置**: `packages/core/src/core/client.ts:68`

### 2.1 主要属性

```typescript
class GeminiClient {
  private chat?: GeminiChat;              // 对话管理
  private sessionTurnCount = 0;           // 会话轮次计数
  private loopDetector: LoopDetectionService;  // 循环检测
  private compressionService: ChatCompressionService;  // 上下文压缩
  private currentSequenceModel: string | null = null;  // 当前模型
}
```

### 2.2 核心方法

| 方法 | 作用 |
|------|------|
| `initialize()` | 初始化 chat 会话 |
| `startChat()` | 创建新的 GeminiChat 实例 |
| `sendMessageStream()` | 发送消息并获取流式响应（核心！） |
| `generateContent()` | 非流式内容生成 |
| `tryCompressChat()` | 尝试压缩对话历史 |
| `resetChat()` | 重置会话 |
| `resumeChat()` | 恢复历史会话 |

### 2.3 sendMessageStream() 流程

```
1. 触发 BeforeAgent Hook
2. 检查循环检测 (loopDetector)
3. 计算 token 数量，检查上下文窗口
4. 尝试压缩历史 (tryCompressChat)
5. 处理 IDE 上下文
6. 路由选择模型 (ModelRouter)
7. 应用可用性策略 (applyModelSelection)
8. 执行 Turn.run() 获取响应
9. 处理工具调用
10. 检查 NextSpeaker（是否需要继续）
11. 触发 AfterAgent Hook
```

## 3. GeminiChat 对话管理

**位置**: `packages/core/src/core/geminiChat.ts:210`

### 3.1 主要职责

```typescript
class GeminiChat {
  private sendPromise: Promise<void>;      // 消息发送锁
  private chatRecordingService: ChatRecordingService;  // 会话记录
  private lastPromptTokenCount: number;    // token 计数

  private systemInstruction: string;       // 系统指令
  private tools: Tool[];                   // 可用工具
  private history: Content[];              // 对话历史
}
```

### 3.2 流式响应处理

```typescript
async sendMessageStream(
  modelConfigKey: ModelConfigKey,
  message: PartListUnion,
  prompt_id: string,
  signal: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>>
```

**流程**:
1. 等待上一条消息处理完成 (`await this.sendPromise`)
2. 创建 user content 并加入历史
3. 带重试的 API 调用 (`retryWithBackoff`)
4. 处理流式响应 (`processStreamResponse`)
5. 验证响应有效性 (`isValidResponse`)
6. 记录工具调用和思考过程

### 3.3 重试机制

```typescript
const INVALID_CONTENT_RETRY_OPTIONS = {
  maxAttempts: 2,        // 1 次初始 + 1 次重试
  initialDelayMs: 500,   // 初始延迟
};
```

**重试条件**:
- `InvalidStreamError` (NO_FINISH_REASON, NO_RESPONSE_TEXT, MALFORMED_FUNCTION_CALL)
- 网络错误 (isRetryableError)
- 429 配额错误 (触发 fallback)

## 4. ContentGenerator 内容生成器

**位置**: `packages/core/src/core/contentGenerator.ts`

### 4.1 接口定义

```typescript
interface ContentGenerator {
  generateContent(request, userPromptId): Promise<GenerateContentResponse>;
  generateContentStream(request, userPromptId): AsyncGenerator<...>;
  countTokens(request): Promise<CountTokensResponse>;
  embedContent(request): Promise<EmbedContentResponse>;
  userTier?: UserTierId;
}
```

### 4.2 认证类型

```typescript
enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',     // OAuth 个人账号
  USE_GEMINI = 'gemini-api-key',            // Gemini API Key
  USE_VERTEX_AI = 'vertex-ai',              // Vertex AI
  LEGACY_CLOUD_SHELL = 'cloud-shell',       // 旧版 Cloud Shell
  COMPUTE_ADC = 'compute-default-credentials', // 计算默认凭证
}
```

### 4.3 实现类层次

```
ContentGenerator (接口)
    │
    ├── LoggingContentGenerator    # 添加日志的装饰器
    │       └── 包装 GoogleGenAI.models 或 CodeAssistContentGenerator
    │
    ├── RecordingContentGenerator  # 记录响应用于回放
    │
    └── FakeContentGenerator       # 测试用假响应
```

## 5. Turn 轮次管理

**位置**: `packages/core/src/core/turn.ts`

### 5.1 事件类型

```typescript
enum GeminiEventType {
  TextDelta = 'TextDelta',
  ThoughtDelta = 'ThoughtDelta',
  ToolCall = 'ToolCall',
  ToolCallCancel = 'ToolCallCancel',
  TurnComplete = 'TurnComplete',
  Error = 'Error',
  InvalidStream = 'InvalidStream',
  LoopDetected = 'LoopDetected',
  ChatCompressed = 'ChatCompressed',
  ContextWindowWillOverflow = 'ContextWindowWillOverflow',
  MaxSessionTurns = 'MaxSessionTurns',
  ModelInfo = 'ModelInfo',
}
```

### 5.2 Turn 流程

```
Turn.run()
    │
    ├── 调用 chat.sendMessageStream()
    │
    ├── 解析响应流
    │       ├── 文本增量 → TextDelta
    │       ├── 思考内容 → ThoughtDelta
    │       └── 函数调用 → ToolCall
    │
    └── 返回 pendingToolCalls[]
```

## 6. 模型路由与可用性

### 6.1 模型选择流程

```typescript
// client.ts:537-558
// 1. 检查模型粘性 (currentSequenceModel)
if (this.currentSequenceModel) {
  modelToUse = this.currentSequenceModel;
} else {
  // 2. 通过路由器选择模型
  const router = await this.config.getModelRouterService();
  const decision = await router.route(routingContext);
  modelToUse = decision.model;
}

// 3. 应用可用性策略
const { model: finalModel } = applyModelSelection(
  this.config,
  modelToUse,
  ...
);
```

### 6.2 Fallback 降级机制

```typescript
// 当遇到 429 错误时
handleFallback(this.config, currentAttemptModel, authType, error);

// 降级到 Flash 模型
DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash'
```

## 7. Hook 系统集成

### 7.1 Agent 级别 Hook

```typescript
// BeforeAgent - 消息发送前
fireBeforeAgentHook(messageBus, request);

// AfterAgent - 响应完成后
fireAfterAgentHook(messageBus, request, responseText);
```

### 7.2 Model 级别 Hook

```typescript
// BeforeModel - API 调用前
fireBeforeModelHook(messageBus, { model, config, contents });

// BeforeToolSelection - 工具选择前
fireBeforeToolSelectionHook(messageBus, { model, config, contents });

// AfterModel - API 响应后
fireAfterModelHook(messageBus, originalRequest, chunk);
```

## 8. 关键设计模式总结

### 8.1 装饰器模式
- `LoggingContentGenerator` 装饰 `ContentGenerator`
- `RecordingContentGenerator` 装饰用于测试

### 8.2 策略模式
- `ModelRouter` 选择模型策略
- `PolicyEngine` 工具权限策略

### 8.3 观察者模式
- `coreEvents` 事件总线
- `MessageBus` 消息发布订阅

### 8.4 Builder 模式
- `ToolBuilder` 构建工具调用

## 9. 下一步学习

- [ ] 深入分析 Tools 系统实现
- [ ] 研究 MCP 协议集成
- [ ] 理解 PolicyEngine 权限控制
- [ ] 分析 ChatRecordingService 会话持久化
