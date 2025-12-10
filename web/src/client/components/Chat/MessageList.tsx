/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage, ToolCall } from '../../hooks/useChat';

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="p-4 space-y-6">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} animate-fade-in`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        {isUser ? (
          <div className="avatar-user">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
        ) : (
          <div className="avatar-assistant">
            <svg
              className="w-5 h-5 text-primary-600"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Message content */}
      <div className={`flex-1 ${isUser ? 'flex justify-end' : ''}`}>
        <div
          className={`max-w-[95%] px-4 py-3 ${
            isUser ? 'message-user' : 'message-assistant'
          }`}
        >
          {/* Text content */}
          {message.content && (
            <div className="message-content">
              {isUser ? (
                <p className="m-0 text-[15px]">{message.content}</p>
              ) : (
                <ReactMarkdown>{message.content}</ReactMarkdown>
              )}
            </div>
          )}

          {/* Tool calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.toolCalls.map((tool) => (
                <ToolCallCard key={tool.id} toolCall={tool} />
              ))}
            </div>
          )}

          {/* Streaming indicator */}
          {message.isStreaming && !message.content && (
            <div className="flex items-center gap-1.5 py-1">
              <span className="loading-dot" />
              <span className="loading-dot" />
              <span className="loading-dot" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const statusConfig = {
    pending: { class: 'tool-badge-pending', icon: '○', label: 'Pending' },
    running: { class: 'tool-badge-running', icon: '◎', label: 'Running' },
    completed: { class: 'tool-badge-completed', icon: '✓', label: 'Done' },
    cancelled: { class: 'tool-badge-cancelled', icon: '✕', label: 'Cancelled' },
    confirm: { class: 'tool-badge-confirm', icon: '?', label: 'Confirm' },
  };

  const config = statusConfig[toolCall.status];
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="tool-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`tool-badge ${config.class}`}>
            <span>{config.icon}</span>
            <span>{toolCall.name}</span>
          </span>
        </div>
        {(Object.keys(toolCall.args).length > 0 || toolCall.result) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-zinc-500 hover:text-zinc-700 flex items-center gap-1"
          >
            {expanded ? 'Hide' : 'Show'} details
            <svg
              className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 animate-fade-in">
          {/* Args */}
          {Object.keys(toolCall.args).length > 0 && (
            <div>
              <div className="text-xs text-zinc-500 mb-1 font-medium">
                Arguments
              </div>
              <div className="tool-card-content">
                <pre className="m-0 whitespace-pre-wrap break-all text-[11px]">
                  {JSON.stringify(toolCall.args, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Result */}
          {toolCall.result !== undefined && toolCall.status === 'completed' && (
            <div>
              <div className="text-xs text-zinc-500 mb-1 font-medium">
                Result
              </div>
              <div className="tool-card-content max-h-40 overflow-y-auto">
                <pre className="m-0 whitespace-pre-wrap break-all text-[11px]">
                  {typeof toolCall.result === 'string'
                    ? toolCall.result.slice(0, 1000)
                    : JSON.stringify(toolCall.result, null, 2).slice(0, 1000)}
                  {(typeof toolCall.result === 'string'
                    ? toolCall.result.length
                    : JSON.stringify(toolCall.result).length) > 1000 && '...'}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
