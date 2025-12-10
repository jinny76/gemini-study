/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';

interface InputBarProps {
  onSendMessage: (message: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}

// Slash commands available
const SLASH_COMMANDS = [
  { command: '/clear', description: 'Clear conversation history', icon: '🗑️' },
  { command: '/help', description: 'Show available commands', icon: '❓' },
  { command: '/compact', description: 'Toggle compact mode', icon: '📐' },
  { command: '/tools', description: 'List available tools', icon: '🔧' },
  { command: '/memory', description: 'Show memory bank', icon: '🧠' },
  { command: '/stats', description: 'Show session statistics', icon: '📊' },
];

const HISTORY_KEY = 'gemini_web_history';
const MAX_HISTORY = 50;

function loadHistory(): string[] {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]) {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(history.slice(-MAX_HISTORY)),
    );
  } catch {
    // Ignore storage errors
  }
}

export function InputBar({
  onSendMessage,
  onCancel,
  isLoading,
}: InputBarProps) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempInput, setTempInput] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Filter commands based on input
  const filteredCommands = input.startsWith('/')
    ? SLASH_COMMANDS.filter((cmd) =>
        cmd.command.toLowerCase().startsWith(input.toLowerCase()),
      )
    : [];

  // Show/hide command suggestions
  useEffect(() => {
    if (
      input.startsWith('/') &&
      filteredCommands.length > 0 &&
      !input.includes(' ')
    ) {
      setShowCommands(true);
      setShowHistory(false);
      setSelectedCommand(0);
    } else {
      setShowCommands(false);
    }
  }, [input, filteredCommands.length]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [input]);

  const addToHistory = useCallback((message: string) => {
    if (!message.trim()) return;
    setHistory((prev) => {
      const newHistory = prev.filter((h) => h !== message);
      newHistory.push(message);
      saveHistory(newHistory);
      return newHistory;
    });
    setHistoryIndex(-1);
    setTempInput('');
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      addToHistory(input.trim());
      onSendMessage(input.trim());
      setInput('');
      setShowCommands(false);
      setShowHistory(false);
    }
  };

  const selectCommand = (command: string) => {
    setInput(command + ' ');
    setShowCommands(false);
    textareaRef.current?.focus();
  };

  const selectFromHistory = (item: string) => {
    setInput(item);
    setShowHistory(false);
    setHistoryIndex(-1);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Command selection with arrow keys
    if (showCommands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommand((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : prev,
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommand((prev) => (prev > 0 ? prev - 1 : prev));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        if (filteredCommands[selectedCommand]) {
          selectCommand(filteredCommands[selectedCommand].command);
        }
        return;
      }
      if (e.key === 'Escape') {
        setShowCommands(false);
        return;
      }
    }

    // History navigation
    if (e.key === 'ArrowUp' && !e.shiftKey && !showCommands) {
      const textarea = textareaRef.current;
      if (textarea && (textarea.selectionStart === 0 || input === '')) {
        e.preventDefault();
        if (historyIndex === -1 && history.length > 0) {
          setTempInput(input);
          setHistoryIndex(history.length - 1);
          setInput(history[history.length - 1]);
        } else if (historyIndex > 0) {
          setHistoryIndex(historyIndex - 1);
          setInput(history[historyIndex - 1]);
        }
        return;
      }
    }

    if (e.key === 'ArrowDown' && !e.shiftKey && !showCommands) {
      if (historyIndex !== -1) {
        e.preventDefault();
        if (historyIndex < history.length - 1) {
          setHistoryIndex(historyIndex + 1);
          setInput(history[historyIndex + 1]);
        } else {
          setHistoryIndex(-1);
          setInput(tempInput);
        }
        return;
      }
    }

    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }

    // Reset history navigation on other input
    if (historyIndex !== -1 && !['ArrowUp', 'ArrowDown'].includes(e.key)) {
      setHistoryIndex(-1);
      setTempInput('');
    }
  };

  return (
    <div className="border-t border-zinc-200 bg-white/80 backdrop-blur-xl px-4 py-3 safe-area-bottom">
      <form onSubmit={handleSubmit} className="flex gap-3 items-end">
        {/* History button - visible on mobile when there's history */}
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className={`w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-2xl transition-all duration-200
                       sm:hidden ${showHistory ? 'bg-primary-100 text-primary-600' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}
            title="Command history"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        )}

        <div className="flex-1 relative">
          {/* History dropdown - mobile */}
          {showHistory && history.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-2xl shadow-soft border border-zinc-200 overflow-hidden z-50 animate-slide-up max-h-64 overflow-y-auto">
              <div className="px-4 py-2 border-b border-zinc-100 flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-500">
                  Recent Commands
                </span>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="text-zinc-400 hover:text-zinc-600"
                >
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              {[...history].reverse().map((item, index) => (
                <button
                  key={`${item}-${index}`}
                  type="button"
                  onClick={() => selectFromHistory(item)}
                  className="w-full px-4 py-3 text-left hover:bg-zinc-50 transition-colors border-b border-zinc-50 last:border-b-0"
                >
                  <span className="text-sm text-zinc-700 line-clamp-2">
                    {item}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Slash command suggestions */}
          {showCommands && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-2xl shadow-soft border border-zinc-200 overflow-hidden z-50 animate-slide-up">
              {filteredCommands.map((cmd, index) => (
                <button
                  key={cmd.command}
                  type="button"
                  onClick={() => selectCommand(cmd.command)}
                  className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors ${
                    index === selectedCommand
                      ? 'bg-primary-50'
                      : 'hover:bg-zinc-50'
                  }`}
                >
                  <span className="text-lg">{cmd.icon}</span>
                  <div>
                    <span
                      className={`font-mono text-sm font-medium ${
                        index === selectedCommand
                          ? 'text-primary-700'
                          : 'text-zinc-700'
                      }`}
                    >
                      {cmd.command}
                    </span>
                    <span className="text-zinc-500 text-sm ml-2">
                      {cmd.description}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Gemini..."
              rows={1}
              disabled={isLoading}
              className="w-full px-4 py-3 bg-zinc-100 rounded-2xl resize-none outline-none
                       border-2 border-transparent transition-all duration-200
                       focus:bg-white focus:border-primary-300 focus:shadow-glow
                       disabled:opacity-50 disabled:cursor-not-allowed
                       text-[15px] placeholder:text-zinc-400"
            />

            {/* Hint */}
            {!input && !isLoading && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hidden sm:flex items-center gap-2">
                <kbd className="px-1.5 py-0.5 bg-zinc-200 rounded text-[10px] font-mono">
                  /
                </kbd>
                <span>commands</span>
                <kbd className="px-1.5 py-0.5 bg-zinc-200 rounded text-[10px] font-mono">
                  ↑
                </kbd>
                <span>history</span>
              </div>
            )}
          </div>
        </div>

        {/* Send/Cancel button */}
        {isLoading ? (
          <button
            type="button"
            onClick={onCancel}
            className="w-12 h-12 flex items-center justify-center bg-red-500 text-white rounded-2xl
                     hover:bg-red-600 active:scale-95 transition-all duration-200 shadow-soft flex-shrink-0"
            title="Cancel"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-200
                     shadow-soft flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed
                     disabled:bg-zinc-100 disabled:text-zinc-400
                     bg-gradient-to-r from-primary-600 to-primary-500 text-white
                     hover:from-primary-500 hover:to-primary-400 hover:shadow-glow active:scale-95"
            title="Send message"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        )}
      </form>

      {/* History indicator */}
      {historyIndex !== -1 && (
        <div className="text-xs text-zinc-400 mt-2 text-center animate-fade-in">
          <span className="bg-zinc-100 px-2 py-1 rounded-full">
            History {historyIndex + 1} / {history.length}
          </span>
        </div>
      )}
    </div>
  );
}
