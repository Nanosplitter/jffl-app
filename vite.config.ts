import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';

export default defineConfig({ plugins: [react(), {
  name: 'live-local-snapshot',
  configureServer(server) {
    server.middlewares.use('/__local-data', async (_req, res) => {
      try {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(await readFile('functions/local-data.json', 'utf8'));
      } catch { res.statusCode = 503; res.end('{}'); }
    });
  },
}] });
