/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  publicDir: '../../public',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.VITE_PORT || '14001'),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || '14000'}`,
        changeOrigin: true,
        timeout: 300000,
      },
      '/ws': {
        target: `ws://localhost:${process.env.PORT || '14000'}`,
        ws: true,
        timeout: 0,
      },
    },
    hmr: process.env.DOMAIN
      ? {
          host: process.env.DOMAIN,
          clientPort: process.env.HTTPS === 'true' ? 443 : 80,
          protocol: process.env.HTTPS === 'true' ? 'wss' : 'ws',
        }
      : true,
    allowedHosts: process.env.DOMAIN ? [process.env.DOMAIN] : [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/client'),
    },
  },
});
