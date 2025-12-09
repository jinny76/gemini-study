# Gemini CLI UI 架构深度分析

## 1. 项目结构概览

```
packages/cli/src/ui/
├── App.tsx                 # React 应用入口
├── AppContainer.tsx        # 主容器组件 (~52k行，核心逻辑)
├── hooks/                  # React Hooks
│   ├── useGeminiStream.ts  # 流处理核心 (~1400行)
│   ├── useReactToolScheduler.ts  # 工具调度
│   ├── slashCommandProcessor.ts  # 斜杠命令处理
│   ├── shellCommandProcessor.ts  # Shell命令处理
│   └── atCommandProcessor.ts     # @命令处理
├── components/             # UI组件
│   ├── InputPrompt.tsx    # 输入框
│   ├── MainContent.tsx    # 主内容区
│   └── ...
├── contexts/              # React Context
│   ├── UIStateContext.js  # UI状态
│   └── StreamingContext.js # 流状态
├── layouts/               # 布局组件
│   ├── DefaultAppLayout.tsx
│   └── ScreenReaderAppLayout.tsx
└── state/                 # 状态管理
```

## 2. 核心数据流

### 2.1 消息发送流程

```
用户输入 (InputPrompt)
    ↓
submitQuery (useGeminiStream)
    ↓
prepareQueryForGemini
    ├── 处理 /slash 命令
    ├── 处理 @ 命令
    └── 处理 shell 命令
    ↓
geminiClient.sendMessageStream()
    ↓
processGeminiStreamEvents
    ├── Content → handleContentEvent → 更新pendingHistoryItem
    ├── Thought → setThought
    ├── ToolCallRequest → scheduleToolCalls
    ├── Error → handleErrorEvent
    └── Finished → handleFinishedEvent
```

### 2.2 工具执行流程

```
ToolCallRequest 事件
    ↓
scheduleToolCalls (useReactToolScheduler)
    ↓
CoreToolScheduler.schedule()
    ↓
工具执行状态变化:
    scheduled → validating → awaiting_approval → executing → success/error/cancelled
    ↓
onAllToolCallsComplete 回调
    ↓
handleCompletedTools
    ↓
submitQuery(toolResponseParts, { isContinuation: true })
    ↓
继续下一轮对话
```

## 3. 关键组件分析

### 3.1 useGeminiStream Hook

**核心职责:**
- 管理 Gemini API 流式响应
- 处理用户输入和命令
- 协调工具调用生命周期
- 管理历史记录

**关键状态:**
```typescript
const [isResponding, setIsResponding] = useState(false);
const [thought, setThought] = useState<ThoughtSummary | null>(null);
const [pendingHistoryItem, ...] = useStateAndRef<HistoryItemWithoutId | null>(null);
const [toolCalls, scheduleToolCalls, ...] = useReactToolScheduler(...);
```

**流处理关键代码 (processGeminiStreamEvents):**
```typescript
for await (const event of stream) {
  switch (event.type) {
    case ServerGeminiEventType.Content:
      // 累积文本内容，智能分割避免重渲染
      geminiMessageBuffer = handleContentEvent(event.value, ...);
      break;
    case ServerGeminiEventType.ToolCallRequest:
      // 收集工具调用请求
      toolCallRequests.push(event.value);
      break;
    // ... 其他事件处理
  }
}
// 流结束后，调度收集到的工具
if (toolCallRequests.length > 0) {
  scheduleToolCalls(toolCallRequests, signal);
}
```

### 3.2 useReactToolScheduler Hook

**核心职责:**
- 维护工具调用的 UI 状态
- 与 CoreToolScheduler 桥接
- 处理工具输出更新

**关键设计:**
```typescript
const scheduler = useMemo(() =>
  new CoreToolScheduler({
    outputUpdateHandler,           // 实时输出更新
    onAllToolCallsComplete,        // 所有工具完成回调
    onToolCallsUpdate,             // 状态变更回调
    getPreferredEditor,            // 编辑器偏好
    config,
  }), [...]);
```

**工具状态生命周期:**
```
scheduled → validating → awaiting_approval → executing → success/error/cancelled
    ↓           ↓              ↓               ↓              ↓
  Pending   Executing    Confirming      Executing     Success/Error/Canceled
```

### 3.3 handleCompletedTools 关键逻辑

```typescript
const handleCompletedTools = useCallback(async (completedTools) => {
  // 1. 过滤已完成且有响应的工具
  const geminiTools = completedTools.filter(
    t => !t.request.isClientInitiated && t.response?.responseParts
  );

  // 2. 如果全部取消，不发送响应
  if (geminiTools.every(tc => tc.status === 'cancelled')) {
    // 手动添加取消的函数响应到历史
    geminiClient.addHistory({ role: 'user', parts: combinedParts });
    return;
  }

  // 3. 提取响应部分，继续对话
  const responsesToSend = geminiTools.flatMap(tc => tc.response.responseParts);
  submitQuery(responsesToSend, { isContinuation: true }, prompt_id);
}, [...]);
```

## 4. 状态管理模式

### 4.1 StreamingState 枚举

```typescript
enum StreamingState {
  Idle,                    // 空闲
  Responding,              // 正在响应
  WaitingForConfirmation,  // 等待用户确认工具
}
```

**状态计算逻辑:**
```typescript
const streamingState = useMemo(() => {
  if (toolCalls.some(tc => tc.status === 'awaiting_approval')) {
    return StreamingState.WaitingForConfirmation;
  }
  if (isResponding || toolCalls.some(tc =>
    tc.status === 'executing' || tc.status === 'scheduled' || ...)) {
    return StreamingState.Responding;
  }
  return StreamingState.Idle;
}, [isResponding, toolCalls]);
```

### 4.2 历史记录管理

**消息类型:**
```typescript
type HistoryItem =
  | { type: 'user'; text: string }
  | { type: 'gemini' | 'gemini_content'; text: string }
  | { type: 'tool_group'; tools: IndividualToolCallDisplay[] }
  | { type: 'info' | 'error'; text: string }
  | { type: 'model'; model: string };
```

**分割优化:**
```typescript
// 大消息分割以避免重渲染性能问题
const splitPoint = findLastSafeSplitPoint(geminiMessageBuffer);
if (splitPoint < geminiMessageBuffer.length) {
  addItem({ type: 'gemini', text: beforeText }, timestamp);
  setPendingHistoryItem({ type: 'gemini_content', text: afterText });
}
```

## 5. 取消机制

### 5.1 用户取消流程

```typescript
const cancelOngoingRequest = useCallback(() => {
  // 1. 标记取消
  turnCancelledRef.current = true;

  // 2. 发送中断信号
  abortControllerRef.current.abort();

  // 3. 取消所有工具调用
  cancelAllToolCalls(abortControllerRef.current.signal);

  // 4. 保存当前进度到历史
  if (pendingHistoryItemRef.current) {
    addItem(pendingHistoryItemRef.current, Date.now());
  }

  // 5. 显示取消消息
  addItem({ type: MessageType.INFO, text: 'Request cancelled.' }, Date.now());
}, [...]);
```

## 6. 与 Web UI 的关键差异

| 特性 | CLI (Ink) | Web UI |
|------|-----------|--------|
| 工具执行 | CoreToolScheduler + React状态 | 简单循环执行 |
| 用户确认 | awaiting_approval状态 + UI | WebSocket等待 |
| 消息渲染 | Static + 动态分离 | 简单列表 |
| 取消机制 | AbortController + 工具取消 | AbortController |
| 状态管理 | useReducer + Hooks | useState |

## 7. 学习要点

### 7.1 CLI 的工具执行特点

1. **异步调度**: 工具请求先收集，流结束后批量调度
2. **状态驱动**: 通过状态变化驱动 UI 更新
3. **确认机制**: 危险操作需要用户确认
4. **实时输出**: Shell 等工具支持实时输出流

### 7.2 Web UI 简化实现

Web UI 采用同步循环方式执行工具:
```typescript
while (turnCount < maxTurns) {
  // 1. 发送消息，收集工具请求
  for await (const event of stream) {
    if (event.type === ToolCallRequest) {
      toolCallRequests.push(event.value);
    }
  }

  // 2. 执行工具
  if (toolCallRequests.length > 0) {
    for (const request of toolCallRequests) {
      const result = await executeToolCall(config, request, signal);
      toolResponseParts.push(...result.response.responseParts);
    }
    currentMessage = toolResponseParts;
  } else {
    // 3. 无工具调用，结束
    return;
  }
}
```

## 8. 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        App.tsx                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                 StreamingContext                        │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │              DefaultAppLayout                     │  │  │
│  │  │  ┌────────────────────────────────────────────┐  │  │  │
│  │  │  │            AppContainer                     │  │  │  │
│  │  │  │                                             │  │  │  │
│  │  │  │  useGeminiStream ←──→ GeminiClient          │  │  │  │
│  │  │  │       ↓                                     │  │  │  │
│  │  │  │  useReactToolScheduler                      │  │  │  │
│  │  │  │       ↓                                     │  │  │  │
│  │  │  │  CoreToolScheduler (core包)                 │  │  │  │
│  │  │  │       ↓                                     │  │  │  │
│  │  │  │  Tool Execution                             │  │  │  │
│  │  │  │                                             │  │  │  │
│  │  │  └────────────────────────────────────────────┘  │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```
