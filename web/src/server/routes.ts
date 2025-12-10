/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * API Routes
 */

import type { Express, Request, Response } from 'express';
import type { SessionManager } from './session.js';
import type { WebConfig } from './config.js';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import multer from 'multer';

export function setupRoutes(
  app: Express,
  sessionManager: SessionManager,
  config: WebConfig,
) {
  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Get available project roots
  app.get('/api/roots', async (req: Request, res: Response) => {
    const availableRoots: Array<{
      path: string;
      name: string;
      exists: boolean;
      error?: string;
    }> = [];

    console.log('Checking project roots:', config.projectRoots);

    for (const rootPath of config.projectRoots) {
      try {
        const stat = await fs.stat(rootPath);
        if (stat.isDirectory()) {
          availableRoots.push({
            path: rootPath,
            name: path.basename(rootPath),
            exists: true,
          });
          console.log(`  ✓ ${rootPath} - exists`);
        } else {
          availableRoots.push({
            path: rootPath,
            name: path.basename(rootPath),
            exists: false,
            error: 'Not a directory',
          });
          console.log(`  ✗ ${rootPath} - not a directory`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        availableRoots.push({
          path: rootPath,
          name: path.basename(rootPath),
          exists: false,
          error: errorMsg,
        });
        console.log(`  ✗ ${rootPath} - ${errorMsg}`);
      }
    }

    res.json({ roots: availableRoots });
  });

  // List subdirectories in a root (only direct children, only directories)
  app.get('/api/roots/projects', async (req: Request, res: Response) => {
    const rootPath = req.query.root as string;

    if (!rootPath) {
      return res.status(400).json({ error: 'root parameter is required' });
    }

    // Security: Ensure the requested root is in the allowed list
    if (!config.projectRoots.includes(rootPath)) {
      return res
        .status(403)
        .json({ error: 'Access denied: not an allowed root' });
    }

    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });
      const projects = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => ({
          name: entry.name,
          path: path.join(rootPath, entry.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({ projects, root: rootPath });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to list projects',
      });
    }
  });

  // Get current session info
  app.get('/api/session', (req: Request, res: Response) => {
    const session = sessionManager.getSession();
    if (session) {
      res.json({
        active: true,
        id: session.id,
        projectPath: session.projectPath,
        projectName: path.basename(session.projectPath),
      });
    } else {
      res.json({ active: false });
    }
  });

  // Create/change project session
  app.post('/api/session', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        return res.status(400).json({ error: 'projectPath is required' });
      }

      // Security: Ensure the project path is under one of the allowed roots
      const isAllowed = config.projectRoots.some(
        (root) =>
          projectPath.startsWith(root + path.sep) || projectPath === root,
      );

      if (!isAllowed) {
        return res
          .status(403)
          .json({ error: 'Access denied: project not in allowed roots' });
      }

      // Verify the path exists and is a directory
      try {
        const stat = await fs.stat(projectPath);
        if (!stat.isDirectory()) {
          return res.status(400).json({ error: 'Path is not a directory' });
        }
      } catch {
        return res.status(400).json({ error: 'Directory does not exist' });
      }

      const sessionId = await sessionManager.createSession(projectPath);
      res.json({
        sessionId,
        projectPath,
        projectName: path.basename(projectPath),
      });
    } catch (error) {
      console.error('Failed to create session:', error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to create session',
      });
    }
  });

  // Close session
  app.delete('/api/session', async (req: Request, res: Response) => {
    try {
      await sessionManager.closeSession();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to close session',
      });
    }
  });

  // Get chat history
  app.get('/api/chat/history', (req: Request, res: Response) => {
    const history = sessionManager.getHistory();
    res.json({ history });
  });

  // Reset chat
  app.post('/api/chat/reset', async (req: Request, res: Response) => {
    try {
      await sessionManager.resetChat();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to reset chat',
      });
    }
  });

  // Tool confirmation
  app.post('/api/tool/confirm', (req: Request, res: Response) => {
    const { confirmed } = req.body;
    if (sessionManager.hasPendingConfirmation()) {
      sessionManager.confirmTool(confirmed === true);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'No pending confirmation' });
    }
  });

  // Cancel current request
  app.post('/api/chat/cancel', (req: Request, res: Response) => {
    sessionManager.cancelCurrentRequest();
    res.json({ success: true });
  });

  // List files in project
  app.get('/api/files', async (req: Request, res: Response) => {
    const projectPath = sessionManager.getProjectPath();
    if (!projectPath) {
      return res.status(400).json({ error: 'No active session' });
    }

    const relativePath = (req.query.path as string) || '';
    const fullPath = path.join(projectPath, relativePath);

    // Security: Ensure we're not going outside project directory
    const normalizedFull = path.normalize(fullPath);
    const normalizedProject = path.normalize(projectPath);
    if (!normalizedFull.startsWith(normalizedProject)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const files = entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: path.join(relativePath, entry.name),
      }));

      // Sort: directories first, then alphabetically
      files.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      res.json({ files, currentPath: relativePath });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list files',
      });
    }
  });

  // Read file content
  app.get('/api/files/content', async (req: Request, res: Response) => {
    const projectPath = sessionManager.getProjectPath();
    if (!projectPath) {
      return res.status(400).json({ error: 'No active session' });
    }

    const relativePath = req.query.path as string;
    if (!relativePath) {
      return res.status(400).json({ error: 'path is required' });
    }

    const fullPath = path.join(projectPath, relativePath);

    // Security: Ensure we're not going outside project directory
    const normalizedFull = path.normalize(fullPath);
    const normalizedProject = path.normalize(projectPath);
    if (!normalizedFull.startsWith(normalizedProject)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      res.json({ content, path: relativePath });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to read file',
      });
    }
  });

  // Write file content
  app.post('/api/files/write', async (req: Request, res: Response) => {
    const projectPath = sessionManager.getProjectPath();
    if (!projectPath) {
      return res.status(400).json({ error: 'No active session' });
    }

    const { path: relativePath, content } = req.body;
    if (!relativePath) {
      return res.status(400).json({ error: 'path is required' });
    }
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }

    const fullPath = path.join(projectPath, relativePath);

    // Security: Ensure we're not going outside project directory
    const normalizedFull = path.normalize(fullPath);
    const normalizedProject = path.normalize(projectPath);
    if (!normalizedFull.startsWith(normalizedProject)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      // Ensure parent directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
      res.json({ success: true, path: relativePath });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to write file',
      });
    }
  });

  // Download file
  app.get('/api/files/download', async (req: Request, res: Response) => {
    const projectPath = sessionManager.getProjectPath();
    if (!projectPath) {
      return res.status(400).json({ error: 'No active session' });
    }

    const relativePath = req.query.path as string;
    if (!relativePath) {
      return res.status(400).json({ error: 'path is required' });
    }

    const fullPath = path.join(projectPath, relativePath);

    // Security: Ensure we're not going outside project directory
    const normalizedFull = path.normalize(fullPath);
    const normalizedProject = path.normalize(projectPath);
    if (!normalizedFull.startsWith(normalizedProject)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        return res.status(400).json({ error: 'Cannot download directory' });
      }

      const filename = path.basename(fullPath);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      res.setHeader('Content-Length', stat.size);

      const stream = createReadStream(fullPath);
      stream.pipe(res);
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to download file',
      });
    }
  });

  // Upload file - setup multer for file upload
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  });

  app.post(
    '/api/files/upload',
    upload.single('file'),
    async (req: Request, res: Response) => {
      const projectPath = sessionManager.getProjectPath();
      if (!projectPath) {
        return res.status(400).json({ error: 'No active session' });
      }

      const targetDir = (req.body.path as string) || '';
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const fullPath = path.join(projectPath, targetDir, file.originalname);

      // Security: Ensure we're not going outside project directory
      const normalizedFull = path.normalize(fullPath);
      const normalizedProject = path.normalize(projectPath);
      if (!normalizedFull.startsWith(normalizedProject)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      try {
        // Ensure parent directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, file.buffer);
        res.json({
          success: true,
          path: path.join(targetDir, file.originalname),
          name: file.originalname,
          size: file.size,
        });
      } catch (error) {
        res.status(500).json({
          error:
            error instanceof Error ? error.message : 'Failed to upload file',
        });
      }
    },
  );

  // Delete file
  app.delete('/api/files', async (req: Request, res: Response) => {
    const projectPath = sessionManager.getProjectPath();
    if (!projectPath) {
      return res.status(400).json({ error: 'No active session' });
    }

    const relativePath = req.query.path as string;
    if (!relativePath) {
      return res.status(400).json({ error: 'path is required' });
    }

    const fullPath = path.join(projectPath, relativePath);

    // Security: Ensure we're not going outside project directory
    const normalizedFull = path.normalize(fullPath);
    const normalizedProject = path.normalize(projectPath);
    if (!normalizedFull.startsWith(normalizedProject)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await fs.rmdir(fullPath, { recursive: true });
      } else {
        await fs.unlink(fullPath);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete file',
      });
    }
  });

  // Create directory
  app.post('/api/files/mkdir', async (req: Request, res: Response) => {
    const projectPath = sessionManager.getProjectPath();
    if (!projectPath) {
      return res.status(400).json({ error: 'No active session' });
    }

    const { path: relativePath } = req.body;
    if (!relativePath) {
      return res.status(400).json({ error: 'path is required' });
    }

    const fullPath = path.join(projectPath, relativePath);

    // Security: Ensure we're not going outside project directory
    const normalizedFull = path.normalize(fullPath);
    const normalizedProject = path.normalize(projectPath);
    if (!normalizedFull.startsWith(normalizedProject)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      await fs.mkdir(fullPath, { recursive: true });
      res.json({ success: true, path: relativePath });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to create directory',
      });
    }
  });
}
