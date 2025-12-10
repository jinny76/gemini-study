/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

interface HeaderProps {
  projectPath: string | null;
  connected: boolean;
  onChangeProject: () => void;
  onToggleFiles?: () => void;
  showFiles?: boolean;
}

export function Header({
  projectPath,
  connected,
  onChangeProject,
  onToggleFiles,
  showFiles,
}: HeaderProps) {
  const projectName = projectPath
    ? projectPath.split(/[/\\]/).pop()
    : 'Select Project';

  return (
    <header className="header-gradient text-white px-4 py-3 safe-area-top">
      <div className="flex items-center justify-between">
        {/* Logo & Project */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center shadow-inner">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">Gemini CLI</h1>
            <button
              onClick={onChangeProject}
              className="text-sm text-white/80 hover:text-white flex items-center gap-1 transition-colors"
            >
              <span className="max-w-[150px] truncate">{projectName}</span>
              <svg
                className="w-3.5 h-3.5 flex-shrink-0"
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
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {onToggleFiles && (
            <button
              onClick={onToggleFiles}
              className={`p-2.5 rounded-xl transition-all duration-200 ${
                showFiles
                  ? 'bg-white/25 shadow-inner'
                  : 'hover:bg-white/15 active:bg-white/25'
              }`}
              title="Toggle file browser"
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
                  strokeWidth={1.5}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </button>
          )}

          {/* Connection status */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
              connected
                ? 'bg-emerald-500/20 text-emerald-100'
                : 'bg-red-500/20 text-red-100'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
              }`}
            />
            {connected ? 'Connected' : 'Offline'}
          </div>
        </div>
      </div>
    </header>
  );
}
