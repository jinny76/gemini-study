/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WebSocket Handler
 * Handles real-time communication for chat streaming
 */

import type { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { SessionManager, WebStreamEvent } from './session.js';
import { isValidToken } from './auth.js';

interface WSMessage {
  type: string;
  payload?: unknown;
}

// Logger utility
function log(category: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [WS:${category}]`;
  if (data !== undefined) {
    console.log(prefix, message, JSON.stringify(data, null, 2));
  } else {
    console.log(prefix, message);
  }
}

function logError(category: string, message: string, error?: unknown) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [WS:${category}] ERROR:`;
  console.error(prefix, message, error);
}

export function setupWebSocket(
  wss: WebSocketServer,
  sessionManager: SessionManager,
) {
  log('Setup', 'WebSocket server initialized');

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // Validate token from query string
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    log('Connect', `New connection attempt`, {
      hasToken: !!token,
      tokenPreview: token ? `${token.substring(0, 8)}...` : null,
      ip: req.socket.remoteAddress,
    });

    if (!token || !isValidToken(token)) {
      log('Connect', 'Connection rejected: invalid token');
      ws.close(1008, 'Unauthorized');
      return;
    }

    log('Connect', 'Connection accepted');

    ws.on('message', async (data: Buffer) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());
        log('Message', `Received: ${message.type}`, {
          payloadType: typeof message.payload,
          payloadPreview:
            typeof message.payload === 'string'
              ? message.payload.substring(0, 50)
              : message.payload !== undefined
                ? '(object)'
                : undefined,
        });
        await handleMessage(ws, message, sessionManager);
      } catch (error) {
        logError('Message', 'Failed to parse message', error);
        sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', (code, reason) => {
      log('Connect', `Client disconnected`, {
        code,
        reason: reason.toString(),
      });
    });

    ws.on('error', (error) => {
      logError('Connect', 'WebSocket error', error);
    });

    // Send initial connection status
    log('Connect', 'Sending connected event');
    send(ws, { type: 'connected' });

    // Send current session info if any
    const session = sessionManager.getSession();
    if (session) {
      log('Connect', 'Sending existing session info', {
        id: session.id,
        projectPath: session.projectPath,
      });
      send(ws, {
        type: 'session_info',
        payload: {
          id: session.id,
          projectPath: session.projectPath,
        },
      });
    }
  });
}

async function handleMessage(
  ws: WebSocket,
  message: WSMessage,
  sessionManager: SessionManager,
) {
  switch (message.type) {
    case 'chat':
      await handleChatMessage(ws, message.payload as string, sessionManager);
      break;

    case 'confirm_tool': {
      const { confirmed } = message.payload as { confirmed: boolean };
      log('Handler', `Tool confirmation: ${confirmed}`);
      sessionManager.confirmTool(confirmed);
      break;
    }

    case 'cancel':
      log('Handler', 'Cancel request received');
      sessionManager.cancelCurrentRequest();
      send(ws, { type: 'cancelled' });
      break;

    case 'ping':
      send(ws, { type: 'pong' });
      break;

    default:
      log('Handler', `Unknown message type: ${message.type}`);
      sendError(ws, `Unknown message type: ${message.type}`);
  }
}

async function handleChatMessage(
  ws: WebSocket,
  message: string,
  sessionManager: SessionManager,
) {
  log('Chat', `Chat message received, length: ${message?.length || 0}`);
  log('Chat', `Session active: ${sessionManager.isSessionActive()}`);

  if (!sessionManager.isSessionActive()) {
    log('Chat', 'No active session');
    sendError(ws, 'No active session. Please select a project first.');
    return;
  }

  if (!message || typeof message !== 'string') {
    log('Chat', 'Invalid message');
    sendError(ws, 'Message is required');
    return;
  }

  let eventCount = 0;

  try {
    log('Chat', 'Starting sendMessage...');
    await sessionManager.sendMessage(message, (event: WebStreamEvent) => {
      eventCount++;
      log(
        'Chat',
        `[${eventCount}] Stream event: ${event.type}`,
        event.type === 'content'
          ? { length: event.text.length }
          : event.type === 'error'
            ? { message: event.message }
            : event.type === 'tool_call'
              ? { tool: event.toolName }
              : event.type === 'tool_result'
                ? {
                    tool: event.toolName,
                    hasResult: event.result !== undefined,
                  }
                : undefined,
      );
      send(ws, { type: 'stream', payload: event });
    });
    log('Chat', `sendMessage completed, total events: ${eventCount}`);
  } catch (error) {
    logError('Chat', 'sendMessage error', error);
    sendError(ws, error instanceof Error ? error.message : 'Chat error');
  }
}

function send(ws: WebSocket, data: unknown) {
  if (ws.readyState === ws.OPEN) {
    const json = JSON.stringify(data);
    ws.send(json);
    // Don't log every send to avoid too much noise, but log important ones
    const parsed = data as { type?: string };
    if (parsed.type && !['pong'].includes(parsed.type)) {
      log('Send', `Sent: ${parsed.type}`, { size: json.length });
    }
  } else {
    log('Send', `Cannot send, WebSocket not open (state: ${ws.readyState})`);
  }
}

function sendError(ws: WebSocket, message: string) {
  log('Send', `Sending error: ${message}`);
  send(ws, { type: 'error', payload: { message } });
}
