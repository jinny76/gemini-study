# 阶段五：UI 层与 Ink 框架分析

## 1. UI 技术栈

| 技术 | 说明 |
|------|------|
| **Ink** | React for CLI - 在终端渲染 React 组件 |
| **React 19** | 函数式组件 + Hooks |
| **React Compiler** | 自动优化，无需手动 memo |

## 2. UI 目录结构

```
packages/cli/src/ui/
├── App.tsx              # 应用根组件
├── AppContainer.tsx     # 主容器组件
├── components/          # UI 组件库
│   ├── Input/          # 输入组件
│   ├── Message/        # 消息显示
│   ├── ToolCall/       # 工具调用 UI
│   ├── Confirmation/   # 确认对话框
│   └── ...
├── contexts/           # React Context
├── hooks/              # 自定义 Hooks
├── layouts/            # 布局组件
├── themes/             # 主题配置
├── state/              # 状态管理
└── auth/               # 认证 UI
```

## 3. 核心组件层次

```
<SettingsContext.Provider>
  <KeypressProvider>           // 键盘事件
    <MouseProvider>            // 鼠标事件
      <ScrollProvider>         // 滚动控制
        <SessionStatsProvider> // 会话统计
          <VimModeProvider>    // Vim 模式
            <AppContainer>     // 主应用容器
              <App />          // 核心应用
            </AppContainer>
          </VimModeProvider>
        </SessionStatsProvider>
      </ScrollProvider>
    </MouseProvider>
  </KeypressProvider>
</SettingsContext.Provider>
```

## 4. Ink render 配置

```typescript
// packages/cli/src/gemini.tsx
render(<AppWrapper />, {
  stdout: inkStdout,
  stdin: process.stdin,
  exitOnCtrlC: false,           // 手动处理 Ctrl+C
  isScreenReaderEnabled: ...,   // 无障碍支持
  alternateBuffer: ...,         // 备用缓冲区
  incrementalRendering: ...,    // 增量渲染
  onRender: ({ renderTime }) => { ... }  // 渲染性能监控
});
```

## 5. 主要 Context

### 5.1 SettingsContext
管理用户设置和主题

### 5.2 KeypressProvider
处理键盘输入事件

### 5.3 VimModeProvider
Vim 模式状态管理

### 5.4 ScrollProvider
终端滚动控制

### 5.5 SessionStatsProvider
会话统计信息

## 6. 核心 Hooks

| Hook | 功能 |
|------|------|
| `useInput` | Ink 提供的输入处理 |
| `useApp` | 访问 Ink App 实例 |
| `useStdout` | 访问标准输出 |
| `useKeypress` | 自定义键盘事件 |
| `useVimMode` | Vim 模式操作 |
| `useScroll` | 滚动控制 |

## 7. 主题系统

**位置**: `packages/cli/src/ui/themes/`

```typescript
// 语义化颜色
const semanticColors = {
  text: {
    primary: '#ffffff',
    secondary: '#888888',
    muted: '#666666',
  },
  background: {
    default: '#000000',
    elevated: '#1a1a1a',
  },
  // ...
};
```

## 8. 消息渲染流程

```
1. 用户输入
       ↓
2. Input 组件捕获
       ↓
3. 调用 GeminiClient.sendMessageStream()
       ↓
4. 流式响应处理
       │
       ├── TextDelta → Message 组件更新
       ├── ThoughtDelta → 思考展示
       └── ToolCall → ToolCall 组件
              ↓
5. 工具确认 → Confirmation 组件
              ↓
6. 执行结果 → 结果显示
```

## 9. 组件示例

### 9.1 消息组件
```tsx
// 伪代码示例
function Message({ content, role }) {
  return (
    <Box flexDirection="column">
      <Text color={role === 'user' ? 'blue' : 'green'}>
        {role === 'user' ? '> ' : '🤖 '}
      </Text>
      <Markdown>{content}</Markdown>
    </Box>
  );
}
```

### 9.2 输入组件
```tsx
function InputBox({ onSubmit }) {
  const [value, setValue] = useState('');

  useInput((input, key) => {
    if (key.return) {
      onSubmit(value);
      setValue('');
    }
  });

  return <TextInput value={value} onChange={setValue} />;
}
```

## 10. 非交互模式

**位置**: `packages/cli/src/nonInteractiveCli.ts`

用于 CI/CD 和脚本场景：
- 无 UI 渲染
- 直接输出到 stdout
- 支持管道输入

## 11. Ink 关键概念

### 11.1 Box (Flexbox 布局)
```tsx
<Box flexDirection="column" padding={1}>
  <Text>Hello</Text>
  <Text>World</Text>
</Box>
```

### 11.2 Text (文本渲染)
```tsx
<Text color="green" bold>Success!</Text>
```

### 11.3 useApp (应用控制)
```tsx
const { exit } = useApp();
// 退出应用
exit();
```

## 12. 测试方法

```typescript
// 使用 ink-testing-library
import { render } from 'ink-testing-library';

test('renders message', () => {
  const { lastFrame } = render(<Message content="Hello" />);
  expect(lastFrame()).toContain('Hello');
});
```

## 13. 学习资源

- [Ink 官方文档](https://github.com/vadimdemedes/ink)
- [React Hooks 文档](https://react.dev/reference/react)
- [Flexbox 布局指南](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)

## 14. 总结

Gemini CLI 的 UI 层采用了现代 React 架构：

1. **Ink** 提供终端渲染能力
2. **Context + Hooks** 管理全局状态
3. **组件化设计** 实现 UI 复用
4. **主题系统** 支持自定义外观
5. **非交互模式** 支持自动化场景
