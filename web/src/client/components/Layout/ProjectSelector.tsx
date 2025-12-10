/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { getAuthHeaders } from '../../hooks/useAuth';

interface ProjectRoot {
  path: string;
  name: string;
  exists: boolean;
  error?: string;
}

interface Project {
  name: string;
  path: string;
}

interface ProjectSelectorProps {
  onSelect: (path: string) => void;
  currentPath: string | null;
}

export function ProjectSelector({ onSelect }: ProjectSelectorProps) {
  const [roots, setRoots] = useState<ProjectRoot[]>([]);
  const [allRoots, setAllRoots] = useState<ProjectRoot[]>([]); // Include failed ones for debugging
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available roots on mount
  useEffect(() => {
    void loadRoots();
  }, []);

  // Load projects when root is selected
  useEffect(() => {
    if (selectedRoot) {
      void loadProjects(selectedRoot);
    }
  }, [selectedRoot]);

  const loadRoots = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/roots', {
        headers: getAuthHeaders(),
      });
      const data = await response.json();

      setAllRoots(data.roots); // Store all for debugging
      const existingRoots = data.roots.filter((r: ProjectRoot) => r.exists);
      setRoots(existingRoots);

      // Auto-select first root if available
      if (existingRoots.length > 0) {
        setSelectedRoot(existingRoots[0].path);
      }
    } catch (_err) {
      setError('Failed to load project roots');
    } finally {
      setIsLoading(false);
    }
  };

  const loadProjects = async (rootPath: string) => {
    try {
      setIsLoadingProjects(true);
      setError(null);
      const response = await fetch(
        `/api/roots/projects?root=${encodeURIComponent(rootPath)}`,
        {
          headers: getAuthHeaders(),
        },
      );
      const data = await response.json();
      setProjects(data.projects);
    } catch (_err) {
      setError('Failed to load projects');
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const handleSelectProject = async (projectPath: string) => {
    setIsLoading(true);
    try {
      await onSelect(projectPath);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && roots.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (roots.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-500"
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
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            No Project Roots Found
          </h2>
          <p className="text-gray-600 mb-4">
            Configure PROJECT_ROOTS environment variable or check server config.
          </p>

          {/* Show configured roots and their status */}
          {allRoots.length > 0 && (
            <div className="text-left bg-gray-100 rounded-lg p-4 mt-4">
              <div className="text-sm font-medium text-gray-700 mb-2">
                Configured roots:
              </div>
              {allRoots.map((root) => (
                <div key={root.path} className="text-xs font-mono mb-1">
                  <span
                    className={root.exists ? 'text-green-600' : 'text-red-600'}
                  >
                    {root.exists ? '✓' : '✗'}
                  </span>{' '}
                  <span className="text-gray-800">{root.path}</span>
                  {root.error && (
                    <span className="text-red-500 ml-2">({root.error})</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Root tabs */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex gap-2 overflow-x-auto">
        {roots.map((root) => (
          <button
            key={root.path}
            onClick={() => setSelectedRoot(root.path)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              selectedRoot === root.path
                ? 'bg-primary-100 text-primary-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {root.path}
          </button>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Project list */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoadingProjects ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Loading projects...</div>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No projects found in this directory
          </div>
        ) : (
          <div className="grid gap-2">
            {projects.map((project) => (
              <button
                key={project.path}
                onClick={() => handleSelectProject(project.path)}
                disabled={isLoading}
                className="w-full flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition text-left disabled:opacity-50"
              >
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-5 h-5 text-primary-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">
                    {project.name}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {project.path}
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-gray-400 flex-shrink-0"
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
        )}
      </div>
    </div>
  );
}
