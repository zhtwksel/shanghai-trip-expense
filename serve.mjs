import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./dist/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer(async (req, res) => {
 try {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname));
  if (path !== root.slice(0,-1) && !path.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403);res.end();return; }
  const file = req.url === '/' ? resolve(root, 'index.html') : path;
  const content = await readFile(file); res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache' });res.end(content);
 } catch {res.writeHead(404);res.end('Not found');}
}).listen(5173, '127.0.0.1', () => console.log('상하이 출장 경비관리: http://127.0.0.1:5173/ (종료: Ctrl+C)')).on('error', e => {console.error(e.message);process.exitCode=1;});
