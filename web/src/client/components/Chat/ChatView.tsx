/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useEffect } from 'react';
import { MessageList } from './MessageList';
import { InputBar } from './InputBar';
import { ToolConfirmModal } from '../ToolConfirm/ToolConfirmModal';
import type { ChatMessage, PendingConfirmation } from '../../hooks/useChat';

interface ChatViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
  pendingConfirmation?: PendingConfirmation | null;
  onSendMessage: (message: string) => void;
  onConfirmTool: (confirmed: boolean) => void;
  onCancel: () => void;
}

export function ChatView({
  messages,
  isLoading,
  pendingConfirmation,
  onSendMessage,
  onConfirmTool,
  onCancel,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Get last message content for scroll trigger
  const lastMessage = messages[messages.length - 1];
  const lastContent = lastMessage?.content || '';
  const lastToolResults = lastMessage?.toolResults?.length || 0;

  // Auto-scroll to bottom on new messages or content updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, lastContent, lastToolResults, isLoading]);

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full">
      {/* Message area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState onSuggestionClick={onSendMessage} />
        ) : (
          <MessageList messages={messages} />
        )}

        {/* Loading indicator */}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="px-4 py-3 flex items-center gap-3">
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
            <div className="flex items-center gap-1.5">
              <span className="loading-dot" />
              <span className="loading-dot" />
              <span className="loading-dot" />
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <InputBar
        onSendMessage={onSendMessage}
        onCancel={onCancel}
        isLoading={isLoading}
      />

      {/* Tool confirmation modal */}
      {pendingConfirmation && (
        <ToolConfirmModal
          toolName={pendingConfirmation.toolName}
          args={pendingConfirmation.args}
          details={pendingConfirmation.details}
          onConfirm={() => onConfirmTool(true)}
          onCancel={() => onConfirmTool(false)}
        />
      )}
    </div>
  );
}

function EmptyState({
  onSuggestionClick,
}: {
  onSuggestionClick: (text: string) => void;
}) {
  const suggestions = [
    { text: 'What files are in this project?', icon: '📁' },
    { text: 'Explain the project structure', icon: '🏗️' },
    { text: 'Find all TODO comments', icon: '📝' },
    { text: 'Help me write a new feature', icon: '✨' },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[60vh]">
      {/* Logo */}
      <div className="w-20 h-20 bg-gradient-to-br from-primary-500 to-primary-700 rounded-3xl flex items-center justify-center mb-6 shadow-glow">
        <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-zinc-800 mb-2">
        Welcome to Gemini CLI
      </h2>
      <p className="text-zinc-500 max-w-md mb-8">
        Your AI-powered coding assistant. Ask questions, explore code, or get
        help with development tasks.
      </p>

      {/* Suggestions */}
      <div className="grid gap-3 w-full max-w-md">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.text}
            onClick={() => onSuggestionClick(suggestion.text)}
            className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-zinc-200
                     hover:border-primary-300 hover:bg-primary-50 transition-all duration-200
                     text-left group shadow-soft"
          >
            <span className="text-xl">{suggestion.icon}</span>
            <span className="text-zinc-700 group-hover:text-primary-700 transition-colors">
              {suggestion.text}
            </span>
            <svg
              className="w-4 h-4 text-zinc-300 group-hover:text-primary-400 ml-auto transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        ))}
      </div>

      {/* Keyboard hints */}
      <div className="mt-8 flex items-center gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-zinc-100 rounded font-mono">/</kbd>
          commands
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-zinc-100 rounded font-mono">↑</kbd>
          history
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-zinc-100 rounded font-mono">
            Enter
          </kbd>
          send
        </span>
      </div>
    </div>
  );
}
