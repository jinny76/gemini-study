# Gemini CLI 交互式输入处理机制分析

## 概述

Gemini CLI 使用 `node-pty` (伪终端) 实现对交互式工具（如 Python 的 `input()`、vim、node REPL 等）的支持。本文档分析其实现架构和关键代码。

## 整体架构

```
用户键盘输入 (Terminal)
        ↓
useKeypress() hook 捕获按键
        ↓
keyToAnsi() 转换为 ANSI 序列
        ↓
ShellInputPrompt 组件
        ↓
ShellExecutionService.writeToPty()
        ↓
node-pty 伪终端
        ↓
运行的 Shell 进程 (bash/powershell)
        ↓
工具进程 (Python, vim, node REPL, etc.)
        ↓
输出通过 PTY 返回
        ↓
xterm 终端模拟器渲染
        ↓
React UI 显示
```

## 核心组件

### 1. Shell 执行服务

**文件**: `packages/core/src/services/shellExecutionService.ts`

Shell 执行有两种模式：

#### 非交互模式（默认）
```typescript
// stdio: ['ignore', 'pipe', 'pipe'] - stdin 被忽略
const child = spawn(executable, args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  // ...
});
```

#### 交互模式（PTY）
```typescript
// 使用 node-pty 创建伪终端
const ptyProcess = ptyInfo.module.spawn(executable, args, {
  name: 'xterm-256color',
  cols: 120,
  rows: 30,
  cwd: options.cwd,
  env: {
    ...getSanitizedEnv(),
    GEMINI_CLI: '1',
    TERM: 'xterm-256color',
    PAGER: 'cat',
    GIT_PAGER: 'cat',
  }
});
```

### 2. PTY 进程管理

```typescript
// 活跃 PTY 追踪
private static activePtys = new Map<number, ActivePty>();

interface ActivePty {
  ptyProcess: IPty;
  // ...
}

// 写入 PTY
static writeToPty(pid: number, input: string): void {
  if (!this.isPtyActive(pid)) {
    return;
  }
  const activePty = this.activePtys.get(pid);
  if (activePty) {
    activePty.ptyProcess.write(input);  // 直接写入 PTY stdin
  }
}
```

### 3. 按键到 ANSI 转换

**文件**: `packages/cli/src/ui/hooks/keyToAnsi.ts`

将用户按键转换为终端控制序列：

```typescript
export function keyToAnsi(key: Key): string {
  // 箭头键
  if (key.name === 'up') return '\x1b[A';
  if (key.name === 'down') return '\x1b[B';
  if (key.name === 'right') return '\x1b[C';
  if (key.name === 'left') return '\x1b[D';

  // 特殊键
  if (key.name === 'tab') return '\t';
  if (key.name === 'backspace') return '\x7f';
  if (key.name === 'delete') return '\x1b[3~';
  if (key.name === 'return') return '\r';
  if (key.name === 'escape') return '\x1b';

  // Ctrl 组合键
  if (key.ctrl && key.name) {
    const charCode = key.name.charCodeAt(0);
    if (charCode >= 97 && charCode <= 122) {  // a-z
      return String.fromCharCode(charCode - 96);  // Ctrl+A = 0x01, etc.
    }
  }

  // 普通字符
  return key.sequence || '';
}
```

常见 ANSI 序列：
| 按键 | ANSI 序列 |
|------|-----------|
| Up | `\x1b[A` |
| Down | `\x1b[B` |
| Right | `\x1b[C` |
| Left | `\x1b[D` |
| Tab | `\t` |
| Backspace | `\x7f` |
| Delete | `\x1b[3~` |
| Ctrl+C | `\x03` |
| Ctrl+D | `\x04` |
| Enter | `\r` |

### 4. 输入捕获组件

**文件**: `packages/cli/src/ui/components/ShellInputPrompt.tsx`

```typescript
export function ShellInputPrompt({ ptyId }: { ptyId: number }) {
  useKeypress((key) => {
    const ansi = keyToAnsi(key);
    if (ansi) {
      ShellExecutionService.writeToPty(ptyId, ansi);
    }
  });

  return null;  // 无视觉输出，只捕获输入
}
```

### 5. Shell 焦点管理

**文件**: `packages/cli/src/ui/components/messages/ShellToolMessage.tsx`

```typescript
// 判断 shell 是否可交互
const isThisShellFocusable =
  (name === SHELL_COMMAND_NAME || name === SHELL_NAME) &&
  status === ToolCallStatus.Executing &&
  config?.getEnableInteractiveShell();
```

通过 `ShellFocusContext` 管理哪个 shell 当前获得焦点，用户可以点击 shell 输出区域来切换焦点。

### 6. 命令处理器

**文件**: `packages/cli/src/ui/hooks/shellCommandProcessor.ts`

```typescript
// 追踪活跃的 shell PID
const [activeShellPtyId, setActiveShellPtyId] = useState<number | null>(null);

// 执行时设置 PID
if (pid) {
  setActiveShellPtyId(pid);
}
```

## 启动时 Stdin 读取

**文件**: `packages/cli/src/utils/readStdin.ts`

CLI 启动时读取管道输入：

```typescript
export async function readStdin(): Promise<string> {
  const maxSize = 8 * 1024 * 1024;  // 8MB 限制
  const timeout = 500;  // 500ms 超时防止挂起

  return new Promise((resolve) => {
    let data = '';

    const timer = setTimeout(() => {
      resolve(data);  // 超时返回已读取的内容
    }, timeout);

    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
        if (data.length > maxSize) {
          clearTimeout(timer);
          resolve(data.slice(0, maxSize));
          return;
        }
      }
    });

    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
```

## 环境配置

执行 shell 时设置的环境变量：

```typescript
env: {
  ...getSanitizedEnv(),
  GEMINI_CLI: '1',           // 标识在 Gemini CLI 中运行
  TERM: 'xterm-256color',    // 终端类型
  PAGER: 'cat',              // 禁用分页器
  GIT_PAGER: 'cat',          // Git 不分页
}
```

## 输出渲染

- **文本内容**: 通过 xterm headless 终端渲染，支持 ANSI 颜色
- **二进制检测**: 自动检测二进制输出，切换到进度模式
- **滚动缓冲**: 最多 300,000 行的滚动历史

## 进程管理

```typescript
// Unix: 使用进程组
kill(-pid, 'SIGTERM');  // 负数 PID 发送给整个进程组

// Windows: 使用 taskkill
exec(`taskkill /pid ${pid} /T /F`);

// 优雅关闭流程
1. 发送 SIGTERM
2. 等待超时
3. 发送 SIGKILL
```

## 已知限制

1. **Sandbox 模式**: 在 Docker/Podman sandbox 中，stdin 转发有问题
2. **非 TTY 环境**: 当 `process.stdin.isTTY` 为 false 时，使用超时机制避免挂起

## 关键文件索引

| 文件 | 用途 |
|------|------|
| `packages/core/src/services/shellExecutionService.ts` | Shell/PTY 执行引擎 |
| `packages/core/src/tools/shell.ts` | Shell 工具定义 |
| `packages/cli/src/ui/components/ShellInputPrompt.tsx` | 输入捕获组件 |
| `packages/cli/src/ui/hooks/keyToAnsi.ts` | 按键转 ANSI |
| `packages/cli/src/ui/hooks/shellCommandProcessor.ts` | Shell UI 编排 |
| `packages/cli/src/ui/components/messages/ShellToolMessage.tsx` | Shell 输出渲染 |
| `packages/cli/src/utils/readStdin.ts` | 启动时 stdin 读取 |

## Web 版本实现思路

如果要在 Web UI 中支持交互式输入，需要：

1. **服务端**:
   - 启用 PTY 模式执行 shell
   - 暴露 `writeToPty` 接口
   - 追踪活跃的 PTY 进程

2. **WebSocket 协议**:
   - 新增 `stdin_input` 消息类型
   - 新增 `stdin_request` 事件（通知前端进程等待输入）

3. **前端**:
   - 检测工具执行状态
   - 显示输入框或捕获按键
   - 发送输入到服务端

```
前端                    服务端                   进程
  │                        │                      │
  │   stdin_request        │                      │
  │<───────────────────────│  (进程等待输入)       │
  │                        │                      │
  │   [显示输入框]          │                      │
  │                        │                      │
  │   stdin_input          │                      │
  │───────────────────────>│───pty.write()───────>│
  │                        │                      │
```
