/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

interface ToolConfirmModalProps {
  toolName: string;
  args: Record<string, unknown>;
  details: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ToolConfirmModal({
  toolName,
  args,
  details,
  onConfirm,
  onCancel,
}: ToolConfirmModalProps) {
  // Determine if this is a potentially dangerous operation
  const isDangerous = ['shell', 'write_file', 'edit'].includes(toolName);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[80vh] flex flex-col safe-area-bottom">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isDangerous ? 'bg-yellow-100' : 'bg-blue-100'
            }`}
          >
            {isDangerous ? (
              <svg
                className="w-5 h-5 text-yellow-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Tool Request</h2>
            <p className="text-sm text-gray-500">
              {isDangerous
                ? 'This action requires your approval'
                : 'Review and confirm'}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Tool name */}
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Tool
            </div>
            <div className="font-mono text-sm bg-gray-100 px-3 py-2 rounded-lg">
              {toolName}
            </div>
          </div>

          {/* Arguments */}
          {Object.keys(args).length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Arguments
              </div>
              <pre className="font-mono text-xs bg-gray-100 px-3 py-2 rounded-lg overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}

          {/* Details (e.g., diff preview for edit) */}
          {details && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Details
              </div>
              <pre className="font-mono text-xs bg-gray-800 text-gray-100 px-3 py-2 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-48">
                {typeof details === 'string'
                  ? details
                  : JSON.stringify(details, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-gray-200 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-3 rounded-xl font-medium transition ${
              isDangerous
                ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {isDangerous ? 'Allow' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
