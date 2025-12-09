# 阶段一：入口与启动流程分析

## 1. 启动入口链

```
npm start
    ↓
scripts/start.js          # 启动脚本
    ↓
packages/cli/src/gemini.tsx   # CLI 主入口 (main 函数)
    ↓
packages/core/src/index.ts    # Core 模块导出
```

## 2. scripts/start.js 分析

**位置**: `scripts/start.js`

**职责**:
- 检查构建状态 (`check-build-status.js`)
- 处理沙箱配置 (`sandbox_command.js`)
- 设置调试模式 (`--inspect-brk`)
- 设置环境变量 (`CLI_VERSION`, `DEV=true`)
- 启动子进程运行 `packages/cli`

**关键代码**:
```javascript
const child = spawn('node', nodeArgs, { stdio: 'inherit', env });
// nodeArgs = [...nodeArgs, 'packages/cli', ...process.argv.slice(2)]
```

## 3. gemini.tsx main() 函数流程

**位置**: `packages/cli/src/gemini.tsx:289`

### 3.1 初始化阶段

```
1. patchStdio()              - 补丁标准输入输出
2. loadSettings()            - 加载用户设置
3. migrateDeprecatedSettings() - 迁移旧配置
4. parseArguments()          - 解析命令行参数
5. dns.setDefaultResultOrder() - 设置 DNS 解析顺序
6. themeManager.loadCustomThemes() - 加载自定义主题
```

### 3.2 沙箱处理

```
如果未在沙箱内 (!process.env['SANDBOX']):
    ↓
计算内存参数 (getNodeMemoryArgs)
    ↓
加载沙箱配置 (loadSandboxConfig)
    ↓
如果启用沙箱:
    - 验证认证
    - 读取 stdin
    - start_sandbox() 启动沙箱
否则:
    - relaunchAppInChildProcess() 重启为子进程
```

### 3.3 主逻辑

```
loadCliConfig()              - 加载 CLI 配置
    ↓
initializeApp()              - 初始化应用
    ↓
分支判断:
├── config.isInteractive() === true
│       ↓
│   startInteractiveUI()     - 启动交互式 UI
│
└── config.isInteractive() === false
        ↓
    runNonInteractive()      - 运行非交互模式
```

## 4. startInteractiveUI() 分析

**位置**: `packages/cli/src/gemini.tsx:175`

### 4.1 UI 组件树

```jsx
<SettingsContext.Provider>
  <KeypressProvider>           // 键盘事件
    <MouseProvider>            // 鼠标事件
      <ScrollProvider>         // 滚动控制
        <SessionStatsProvider> // 会话统计
          <VimModeProvider>    // Vim 模式
            <AppContainer />   // 主应用容器
          </VimModeProvider>
        </SessionStatsProvider>
      </ScrollProvider>
    </MouseProvider>
  </KeypressProvider>
</SettingsContext.Provider>
```

### 4.2 Ink render 配置

```javascript
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

## 5. Core 模块导出结构

**位置**: `packages/core/src/index.ts`

### 5.1 主要导出分类

| 类别 | 路径 | 说明 |
|------|------|------|
| Config | `./config/*` | 配置管理 |
| Core Logic | `./core/*` | 核心逻辑（client, chat, prompts） |
| Tools | `./tools/*` | 内置工具（文件、Shell、搜索等） |
| Services | `./services/*` | 服务层（文件发现、Git、会话记录） |
| MCP | `./mcp/*` | MCP 协议实现 |
| Hooks | `./hooks/*` | Hook 系统 |
| Utils | `./utils/*` | 工具函数 |
| Telemetry | `./telemetry/*` | 遥测数据 |

### 5.2 核心工具列表

```typescript
// 文件操作
export * from './tools/read-file.js';
export * from './tools/write-file.js';
export * from './tools/edit.js';
export * from './tools/ls.js';
export * from './tools/glob.js';

// 搜索
export * from './tools/grep.js';
export * from './tools/ripGrep.js';
export * from './tools/web-search.js';

// 执行
export * from './tools/shell.js';
export * from './tools/web-fetch.js';

// MCP
export * from './tools/mcp-client.js';
export * from './tools/mcp-tool.js';
```

## 6. 关键设计模式

### 6.1 Context Provider 模式
使用 React Context 实现全局状态管理：
- `SettingsContext` - 设置
- `KeypressProvider` - 键盘事件
- `VimModeProvider` - Vim 模式状态

### 6.2 事件驱动
- `coreEvents` - 核心事件总线
- `appEvents` - 应用事件总线
- 使用 EventEmitter 模式解耦组件

### 6.3 清理注册机制
```javascript
registerCleanup(() => { ... });      // 异步清理
registerSyncCleanup(() => { ... });  // 同步清理
runExitCleanup();                    // 执行清理
```

## 7. 重要环境变量

| 变量 | 作用 |
|------|------|
| `DEBUG` | 启用调试模式 |
| `SANDBOX` | 标识在沙箱内运行 |
| `CLI_VERSION` | CLI 版本号 |
| `DEV` | 开发模式标识 |
| `GEMINI_CLI_NO_RELAUNCH` | 禁止重启子进程 |

## 8. 下一步学习

- [ ] 深入 `AppContainer` 组件
- [ ] 分析 `loadCliConfig` 配置加载
- [ ] 研究 `initializeApp` 初始化流程
- [ ] 理解 `runNonInteractive` 非交互模式
