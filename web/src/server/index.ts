/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Gemini CLI Web Server
 * Main entry point for the web interface
 */

import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { SessionManager } from './session.js';
import { setupRoutes } from './routes.js';
import { setupWebSocket } from './websocket.js';
import { loadConfig } from './config.js';
import { authMiddleware, setupAuthRoutes } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = loadConfig();

// Create IDE directory to prevent IdeClient errors
const ideDir = path.join(os.tmpdir(), 'gemini', 'ide');
if (!fs.existsSync(ideDir)) {
  fs.mkdirSync(ideDir, { recursive: true });
}

async function main() {
  const app = express();
  const server = createServer(app);

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Auth routes (before auth middleware)
  setupAuthRoutes(app);

  // Auth middleware (protects API routes)
  app.use(authMiddleware);

  // Session manager (single session for simplicity)
  const sessionManager = new SessionManager();

  // API routes
  setupRoutes(app, sessionManager, config);

  // WebSocket for streaming
  const wss = new WebSocketServer({ server, path: '/ws' });
  setupWebSocket(wss, sessionManager);

  // Serve static files in production
  const clientPath = path.join(__dirname, '../client');
  app.use(express.static(clientPath));

  // SPA fallback
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(clientPath, 'index.html'));
    }
  });

  server.listen(config.port, config.host, () => {
    const localUrl = `http://localhost:${config.port}`;
    const networkUrl = `http://${config.host}:${config.port}`;
    const domainUrl = config.domain ? `http://${config.domain}` : null;

    console.log('Gemini Web server running:');
    console.log(`  Local:   ${localUrl}`);
    if (config.host === '0.0.0.0') {
      console.log(`  Network: ${networkUrl}`);
    }
    if (domainUrl) {
      console.log(`  Domain:  ${domainUrl}`);
    }
    console.log(`  Roots:   ${config.projectRoots.join(', ')}`);
  });
}

main().catch(console.error);
