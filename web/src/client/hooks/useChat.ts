/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'confirm';
}

export interface PendingConfirmation {
  toolName: string;
  args: Record<string, unknown>;
  details: unknown;
}

type SendMessageFn = (type: string, payload?: unknown) => void;
type SubscribeFn = (
  handler: (message: { type: string; payload?: unknown }) => void,
) => () => void;

interface StreamEvent {
  type: string;
  text?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  details?: unknown;
  message?: string;
}

export function useChat(wsSend: SendMessageFn, wsSubscribe: SubscribeFn) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const currentMessageRef = useRef<string>('');
  const currentToolCallsRef = useRef<ToolCall[]>([]);

  const _updateCurrentMessage = useCallback(() => {
    setMessages((prev) => {
      const withoutCurrent = prev.filter((m) => !m.isStreaming);
      if (currentMessageRef.current || currentToolCallsRef.current.length > 0) {
        return [
          ...withoutCurrent,
          {
            id: 'streaming',
            role: 'assistant' as const,
            content: currentMessageRef.current,
            timestamp: new Date(),
            toolCalls: [...currentToolCallsRef.current],
            isStreaming: true,
          },
        ];
      }
      return withoutCurrent;
    });
  }, []);

  const _finalizeCurrentMessage = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming
          ? {
              ...m,
              id: `msg-${Date.now()}`,
              isStreaming: false,
            }
          : m,
      ),
    );
    currentMessageRef.current = '';
    currentToolCallsRef.current = [];
  }, []);

  // Handle WebSocket messages via subscription
  useEffect(() => {
    const handleStreamEvent = (event: StreamEvent) => {
      console.log('[useChat] Stream event:', event.type, event);

      switch (event.type) {
        case 'content':
          currentMessageRef.current += event.text || '';
          console.log('[useChat] Content accumulated:', {
            newText: event.text,
            totalLength: currentMessageRef.current.length,
            preview: currentMessageRef.current.substring(0, 100),
          });
          setMessages((prev) => {
            const withoutCurrent = prev.filter((m) => !m.isStreaming);
            const newMsg = {
              id: 'streaming',
              role: 'assistant' as const,
              content: currentMessageRef.current,
              timestamp: new Date(),
              toolCalls: [...currentToolCallsRef.current],
              isStreaming: true,
            };
            console.log('[useChat] Setting message:', {
              contentLength: newMsg.content.length,
              toolCallsCount: newMsg.toolCalls.length,
            });
            return [...withoutCurrent, newMsg];
          });
          break;

        case 'thought':
          console.log('[useChat] Thought:', event.text);
          break;

        case 'tool_call': {
          const toolCall: ToolCall = {
            id: `${Date.now()}-${event.toolName}`,
            name: event.toolName || '',
            args: event.args || {},
            status: 'running',
          };
          currentToolCallsRef.current.push(toolCall);
          setMessages((prev) => {
            const withoutCurrent = prev.filter((m) => !m.isStreaming);
            return [
              ...withoutCurrent,
              {
                id: 'streaming',
                role: 'assistant' as const,
                content: currentMessageRef.current,
                timestamp: new Date(),
                toolCalls: [...currentToolCallsRef.current],
                isStreaming: true,
              },
            ];
          });
          break;
        }

        case 'tool_result': {
          console.log(
            '[useChat] tool_result received:',
            event.toolName,
            event.result,
          );
          // Find tool by name (any status, as it might have been updated)
          const lastTool = currentToolCallsRef.current.find(
            (t) => t.name === event.toolName,
          );
          if (lastTool) {
            lastTool.result = event.result;
            lastTool.status = 'completed';
            console.log('[useChat] Updated tool:', lastTool);
          } else {
            // Tool not found, create a new entry
            console.log('[useChat] Tool not found, creating new entry');
            currentToolCallsRef.current.push({
              id: `${Date.now()}-${event.toolName}`,
              name: event.toolName || '',
              args: {},
              result: event.result,
              status: 'completed',
            });
          }
          setMessages((prev) => {
            const withoutCurrent = prev.filter((m) => !m.isStreaming);
            return [
              ...withoutCurrent,
              {
                id: 'streaming',
                role: 'assistant' as const,
                content: currentMessageRef.current,
                timestamp: new Date(),
                toolCalls: [...currentToolCallsRef.current],
                isStreaming: true,
              },
            ];
          });
          break;
        }

        case 'tool_confirm_request':
          setPendingConfirmation({
            toolName: event.toolName || '',
            args: event.args || {},
            details: event.details,
          });
          break;

        case 'tool_cancelled': {
          const cancelledTool = currentToolCallsRef.current.find(
            (t) => t.name === event.toolName && t.status === 'running',
          );
          if (cancelledTool) {
            cancelledTool.status = 'cancelled';
            setMessages((prev) => {
              const withoutCurrent = prev.filter((m) => !m.isStreaming);
              return [
                ...withoutCurrent,
                {
                  id: 'streaming',
                  role: 'assistant' as const,
                  content: currentMessageRef.current,
                  timestamp: new Date(),
                  toolCalls: [...currentToolCallsRef.current],
                  isStreaming: true,
                },
              ];
            });
          }
          break;
        }

        case 'error':
          setIsLoading(false);
          setMessages((prev) => {
            const updated = prev.map((m) =>
              m.isStreaming
                ? { ...m, id: `msg-${Date.now()}`, isStreaming: false }
                : m,
            );
            return [
              ...updated,
              {
                id: `error-${Date.now()}`,
                role: 'assistant' as const,
                content: `Error: ${event.message}`,
                timestamp: new Date(),
              },
            ];
          });
          currentMessageRef.current = '';
          currentToolCallsRef.current = [];
          break;

        case 'finished':
        case 'cancelled':
          console.log('[useChat] Finalizing message', {
            currentContent: currentMessageRef.current.substring(0, 100),
            currentContentLength: currentMessageRef.current.length,
            toolCallsCount: currentToolCallsRef.current.length,
          });
          setIsLoading(false);
          setMessages((prev) => {
            console.log('[useChat] Before finalize, messages:', prev.map(m => ({
              id: m.id,
              role: m.role,
              contentLength: m.content.length,
              isStreaming: m.isStreaming,
            })));
            const result = prev.map((m) =>
              m.isStreaming
                ? { ...m, id: `msg-${Date.now()}`, isStreaming: false }
                : m,
            );
            console.log('[useChat] After finalize, messages:', result.map(m => ({
              id: m.id,
              role: m.role,
              contentLength: m.content.length,
              isStreaming: m.isStreaming,
            })));
            return result;
          });
          currentMessageRef.current = '';
          currentToolCallsRef.current = [];
          break;

        default:
          break;
      }
    };

    const unsubscribe = wsSubscribe((message) => {
      if (message.type === 'stream') {
        handleStreamEvent(message.payload as StreamEvent);
      }
    });
    return unsubscribe;
  }, [wsSubscribe]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || isLoading) return;

      // Add user message
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      currentMessageRef.current = '';
      currentToolCallsRef.current = [];

      // Send via WebSocket
      wsSend('chat', content);
    },
    [wsSend, isLoading],
  );

  const confirmTool = useCallback(
    (confirmed: boolean) => {
      wsSend('confirm_tool', { confirmed });
      setPendingConfirmation(null);
    },
    [wsSend],
  );

  const cancelRequest = useCallback(() => {
    wsSend('cancel');
  }, [wsSend]);

  return {
    messages,
    isLoading,
    pendingConfirmation,
    sendMessage,
    confirmTool,
    cancelRequest,
  };
}
