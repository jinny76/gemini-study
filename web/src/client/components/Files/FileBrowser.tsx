/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getAuthHeaders } from '../../hooks/useAuth';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
}

interface FileBrowserProps {
  onFileSelect: (path: string) => void;
  selectedPath: string | null;
  onRefresh?: () => void;
}

export function FileBrowser({
  onFileSelect,
  selectedPath,
  onRefresh,
}: FileBrowserProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async (dirPath: string = '') => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/files?path=${encodeURIComponent(dirPath)}`,
        {
          headers: getAuthHeaders(),
        },
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to load files');
      }
      const data = await response.json();
      setFiles(data.files);
      setCurrentPath(data.currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const handleItemClick = (item: FileEntry) => {
    if (item.type === 'directory') {
      void loadFiles(item.path);
    } else {
      onFileSelect(item.path);
    }
  };

  const handleGoUp = () => {
    if (currentPath) {
      const parentPath = currentPath.split(/[/\\]/).slice(0, -1).join('/');
      void loadFiles(parentPath);
    }
  };

  const handleRefresh = () => {
    void loadFiles(currentPath);
    onRefresh?.();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', currentPath);

    try {
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to upload');
      }
      handleRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    }

    // Reset input
    e.target.value = '';
  };

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Files</h3>
          <div className="flex items-center gap-1">
            <label
              className="p-1 hover:bg-gray-200 rounded cursor-pointer"
              title="Upload file"
            >
              <input type="file" className="hidden" onChange={handleUpload} />
              <svg
                className="w-4 h-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
            </label>
            <button
              onClick={handleRefresh}
              className="p-1 hover:bg-gray-200 rounded"
              title="Refresh"
            >
              <svg
                className="w-4 h-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center text-xs text-gray-500 truncate">
          <button onClick={() => loadFiles('')} className="hover:text-gray-700">
            /
          </button>
          {currentPath &&
            currentPath
              .split(/[/\\]/)
              .filter(Boolean)
              .map((part, i, arr) => (
                <React.Fragment key={i}>
                  <span className="mx-1">/</span>
                  <button
                    onClick={() => loadFiles(arr.slice(0, i + 1).join('/'))}
                    className="hover:text-gray-700 truncate"
                  >
                    {part}
                  </button>
                </React.Fragment>
              ))}
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            Loading...
          </div>
        ) : error ? (
          <div className="p-4 text-center text-red-500 text-sm">{error}</div>
        ) : (
          <div className="py-1">
            {/* Go Up */}
            {currentPath && (
              <button
                onClick={handleGoUp}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-gray-100 text-left"
              >
                <svg
                  className="w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 17l-5-5m0 0l5-5m-5 5h12"
                  />
                </svg>
                <span className="text-sm text-gray-600">..</span>
              </button>
            )}

            {/* Files */}
            {files.map((file) => (
              <button
                key={file.path}
                onClick={() => handleItemClick(file)}
                className={`w-full px-3 py-1.5 flex items-center gap-2 hover:bg-gray-100 text-left ${
                  selectedPath === file.path ? 'bg-blue-50 text-blue-700' : ''
                }`}
              >
                {file.type === 'directory' ? (
                  <svg
                    className="w-4 h-4 text-yellow-500 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4 text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                )}
                <span className="text-sm truncate">{file.name}</span>
              </button>
            ))}

            {files.length === 0 && !currentPath && (
              <div className="p-4 text-center text-gray-500 text-sm">
                No files
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
