/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { FileBrowser } from './FileBrowser';
import { FileEditor } from './FileEditor';

interface FilePanelProps {
  onClose: () => void;
}

export function FilePanel({ onClose }: FilePanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [view, setView] = useState<'browser' | 'editor'>('browser');

  const handleFileSelect = (path: string) => {
    setSelectedFile(path);
    setView('editor');
  };

  const handleCloseEditor = () => {
    setSelectedFile(null);
    setView('browser');
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Tab Bar */}
      <div className="flex items-center border-b border-gray-200 bg-gray-100">
        <button
          onClick={() => setView('browser')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            view === 'browser'
              ? 'text-blue-600 border-blue-600 bg-white'
              : 'text-gray-600 border-transparent hover:text-gray-900'
          }`}
        >
          Browse
        </button>
        {selectedFile && (
          <div
            onClick={() => setView('editor')}
            role="tab"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && setView('editor')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 cursor-pointer ${
              view === 'editor'
                ? 'text-blue-600 border-blue-600 bg-white'
                : 'text-gray-600 border-transparent hover:text-gray-900'
            }`}
          >
            <span className="truncate max-w-[120px]">
              {selectedFile.split(/[/\\]/).pop()}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCloseEditor();
              }}
              className="hover:bg-gray-200 rounded p-0.5"
            >
              <svg
                className="w-3 h-3"
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
        )}
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-200 rounded mr-1"
          title="Close panel"
        >
          <svg
            className="w-5 h-5 text-gray-600"
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

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {view === 'browser' ? (
          <FileBrowser
            onFileSelect={handleFileSelect}
            selectedPath={selectedFile}
          />
        ) : (
          <FileEditor filePath={selectedFile} onClose={handleCloseEditor} />
        )}
      </div>
    </div>
  );
}
