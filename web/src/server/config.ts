/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Web Server Configuration
 */

export interface WebConfig {
  // Root directories where projects can be selected from
  projectRoots: string[];
  // Server host (0.0.0.0 for external access)
  host: string;
  // Server port
  port: number;
  // Public domain (for display/CORS)
  domain?: string;
}

// Default configuration
// Can be overridden via environment variables
export function loadConfig(): WebConfig {
  const defaultRoots = ['G:\\projects', 'J:\\projects'];

  // Parse PROJECT_ROOTS from environment (comma-separated)
  const envRoots = process.env.PROJECT_ROOTS;
  const projectRoots = envRoots
    ? envRoots
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
    : defaultRoots;

  return {
    projectRoots,
    host: process.env.HOST || '0.0.0.0',
    port: parseInt(process.env.PORT || '14000', 10),
    domain: process.env.DOMAIN, // e.g., gemini.kingfisher.live
  };
}
