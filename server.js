// Tiny local server: serves index.html + proxies Yahoo Finance.
// Run with:  node server.js
// Then open: http://localhost:3000
//
// In the dashboard, click ⚙ Proxy and set:  /api/yahoo?url={url}
//
// No external dependencies — uses only Node built-ins (>= v18 for global fetch).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Yahoo proxy endpoint
  if (url.pathname === '/api/yahoo') {
    const target = url.searchParams.get('url');
    if (!target || !target.startsWith('https://query1.finance.yahoo.com/')) {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid url' }));
    }
    try {
      const r = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const body = await r.text();
      res.writeHead(r.status, {
        'content-type': r.headers.get('content-type') || 'application/json',
        'access-control-allow-origin': '*',
      });
      res.end(body);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Static file (just index.html)
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const full = path.join(__dirname, file);
  if (!full.startsWith(__dirname) || !fs.existsSync(full)) {
    res.writeHead(404); return res.end('not found');
  }
  const ext = path.extname(full);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'text/plain';
  res.writeHead(200, { 'content-type': mime });
  fs.createReadStream(full).pipe(res);
});

server.listen(PORT, () => {
  console.log(`📊 dashboard:  http://localhost:${PORT}`);
  console.log(`   yahoo proxy: http://localhost:${PORT}/api/yahoo?url=...`);
});
