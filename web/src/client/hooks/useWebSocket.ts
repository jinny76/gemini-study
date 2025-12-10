/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface SessionInfo {
  id: string;
  projectPath: string;
}

interface WSMessage {
  type: string;
  payload?: unknown;
}

type MessageHandler = (message: WSMessage) => void;

export function useWebSocket(token: string | null) {
  const [connected, setConnected] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const tokenRef = useRef(token);

  // Keep token ref updated
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const connect = useCallback(() => {
    if (!tokenRef.current) {
      console.log('No token, skipping WebSocket connection');
      return;
    }

    // Build WebSocket URL from current location
    const wsUrl = new URL('/ws', window.location.href);
    wsUrl.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl.searchParams.set('token', tokenRef.current);

    console.log('Connecting to WebSocket:', wsUrl.toString());
    const ws = new WebSocket(wsUrl.toString());

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      // Reconnect after delay
      setTimeout(connect, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);

        // Handle internal messages
        if (message.type === 'session_info') {
          setSessionInfo(message.payload as SessionInfo);
        }

        // Notify all handlers
        handlersRef.current.forEach((handler) => handler(message));
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    if (token) {
      connect();
    }
    return () => {
      wsRef.current?.close();
    };
  }, [connect, token]);

  const sendMessage = useCallback((type: string, payload?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  const subscribe = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return {
    connected,
    sessionInfo,
    sendMessage,
    subscribe,
  };
}
