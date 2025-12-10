/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';

const TOKEN_KEY = 'gemini_web_token';

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [checking, setChecking] = useState(true);

  // Check if token is still valid on mount
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        setChecking(false);
        return;
      }

      try {
        const response = await fetch('/api/auth/check', {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        const data = await response.json();

        if (!data.authenticated) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        }
      } catch {
        // Keep token if we can't check (offline, etc)
      } finally {
        setChecking(false);
      }
    };

    void checkAuth();
  }, []);

  const login = useCallback((newToken: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
  }, []);

  const logout = useCallback(async () => {
    const currentToken = localStorage.getItem(TOKEN_KEY);
    if (currentToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${currentToken}` },
        });
      } catch {
        // Ignore errors
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  return {
    token,
    isAuthenticated: !!token,
    checking,
    login,
    logout,
  };
}

// Helper to get auth headers for API calls
export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}
