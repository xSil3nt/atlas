import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { cpSync } from 'node:fs';
import { legacyMode } from './shared/modes.js';
import cards from './api/cards.js';
import imgbbKey from './api/imgbb-key.js';

// Exercise the real Vercel card handler in local dev and production preview.
function localApi() {
  const middleware = (req, res, next) => {
    const path = req.url.split('?')[0];
    if (legacyMode(path) !== null) { req.url = '/index.html' + req.url.slice(path.length); next(); return; }
    const handler = { '/api/cards': cards, '/api/imgbb-key': imgbbKey }[path];
    if (!handler) return next();
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return res; };
    Promise.resolve(handler(req, res)).catch(() => res.status(500).json({error:'Local API failed'}));
  };
  return { name: 'atlas-local-api', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
export default defineConfig({
  root: import.meta.dirname,
  appType: 'spa',
  plugins: [localApi(), {
    name: 'atlas-token-assets',
    closeBundle() { cpSync(resolve(import.meta.dirname,'tokens'),resolve(import.meta.dirname,'dist/tokens'),{recursive:true}); },
  }],
  build: { rollupOptions: { input: resolve(import.meta.dirname, 'index.html') } },
});
