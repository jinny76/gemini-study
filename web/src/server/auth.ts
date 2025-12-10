/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Simple authentication middleware
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

// Simple credentials (in production, use environment variables and hashing)
const VALID_USERNAME = 'gemini';
const VALID_PASSWORD = 'kingfisher';

// Active tokens (in production, use Redis or database)
const activeTokens = new Set<string>();

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function validateCredentials(
  username: string,
  password: string,
): boolean {
  return username === VALID_USERNAME && password === VALID_PASSWORD;
}

export function createToken(): string {
  const token = generateToken();
  activeTokens.add(token);
  return token;
}

export function invalidateToken(token: string): void {
  activeTokens.delete(token);
}

export function isValidToken(token: string): boolean {
  return activeTokens.has(token);
}

// Auth middleware - protects routes
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Skip auth for login endpoint and static files
  if (
    req.path === '/api/auth/login' ||
    req.path === '/api/auth/check' ||
    !req.path.startsWith('/api')
  ) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.substring(7);
  if (!isValidToken(token)) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  next();
}

// Setup auth routes
export function setupAuthRoutes(app: import('express').Application): void {
  // Login
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (!validateCredentials(username, password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = createToken();
    res.json({ token, username });
  });

  // Logout
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      invalidateToken(token);
    }
    res.json({ success: true });
  });

  // Check auth status
  app.get('/api/auth/check', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({ authenticated: false });
    }

    const token = authHeader.substring(7);
    res.json({ authenticated: isValidToken(token) });
  });
}
