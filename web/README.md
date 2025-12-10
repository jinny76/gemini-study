# Gemini CLI Web Interface

Mobile-friendly web interface for Gemini CLI, reusing the core logic from
`@google/gemini-cli-core`.

## Architecture

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
│  └───────────────────────────────────────────────────────┘  │
│                              │                               │
│                              ▼                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           直接调用 packages/core                        │  │
│  │  - Config (配置)                                        │  │
│  │  - GeminiClient (对话)                                  │  │
│  │  - ToolRegistry (工具)                                  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### Project Roots

默认配置的项目根目录：

- `G:\projects`
- `J:\projects`

可通过环境变量覆盖：

```bash
# 设置多个根目录（逗号分隔）
set PROJECT_ROOTS=D:\code,E:\workspace
```

或修改 `src/server/config.ts` 中的 `defaultRoots`。

## Setup

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Build the core package:

   ```bash
   npm run build -w @google/gemini-cli-core
   ```

3. Run the web server in development mode:

   ```bash
   npm run dev -w @google/gemini-cli-web
   ```

4. Open http://localhost:14001 in your browser (Vite dev server)
   - API requests are proxied to http://localhost:14000

## Production Build

```bash
npm run build -w @google/gemini-cli-web
npm run start -w @google/gemini-cli-web
```

## Features

- **Project Selection**: Choose a project directory to work with
- **Chat Interface**: Send messages and receive streaming responses
- **Tool Execution**: View and confirm tool calls (file operations, shell
  commands)
- **Mobile Optimized**: Responsive design for mobile devices
- **PWA Support**: Install as a progressive web app

## API Endpoints

### Session

- `GET /api/session` - Get current session info
- `POST /api/session` - Create/change project session
- `DELETE /api/session` - Close session

### Chat

- `GET /api/chat/history` - Get chat history
- `POST /api/chat/reset` - Reset chat
- `POST /api/chat/cancel` - Cancel current request

### Tools

- `POST /api/tool/confirm` - Confirm/cancel tool execution

### Files

- `GET /api/files` - List files in project
- `GET /api/files/content` - Read file content

### WebSocket

- `ws://localhost:14000/ws` - Real-time chat streaming

## Project Structure

```
packages/web/
├── src/
│   ├── server/           # Express + WebSocket server
│   │   ├── index.ts      # Entry point
│   │   ├── routes.ts     # API routes
│   │   ├── session.ts    # Session management
│   │   └── websocket.ts  # WebSocket handler
│   │
│   └── client/           # React frontend
│       ├── main.tsx      # Entry point
│       ├── App.tsx       # Main app component
│       ├── components/   # UI components
│       │   ├── Chat/     # Chat interface
│       │   ├── Layout/   # Header, navigation
│       │   └── ToolConfirm/  # Tool confirmation modal
│       ├── hooks/        # React hooks
│       └── styles/       # Tailwind CSS
│
├── public/               # Static assets
│   ├── manifest.json     # PWA manifest
│   └── icons/            # App icons
│
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Upgrading

When Gemini CLI releases a new version:

```bash
cd gemini-cli
git pull origin main
npm install
npm run build
```

The web package automatically benefits from new features in `packages/core`.
