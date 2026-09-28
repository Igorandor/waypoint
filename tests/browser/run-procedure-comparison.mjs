import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const origin = 'http://127.0.0.1:3435';
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./procedure-comparison.jsx', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"' },
});
const html =
  '<!doctype html><meta charset="utf-8"><title>Waypoint procedure editor regression</title><h1>Actual React procedure comparison detail</h1><div id="probe"></div><pre id="result">Running…</pre><script src="/probe.js"></script>';
let completed = false;
const server = http.createServer(async (req, res) => {
  if (
    req.headers.host !== '127.0.0.1:3435' ||
    (req.headers.origin && req.headers.origin !== origin)
  ) {
    res.writeHead(403).end();
    return;
  }
  if (req.method === 'GET' && ['/', '/probe.js'].includes(req.url)) {
    res.writeHead(200, {
      'Content-Type': req.url === '/' ? 'text/html' : 'text/javascript',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.url === '/' ? html : bundle.outputFiles[0].text);
    return;
  }
  if (req.method !== 'POST' || req.url !== '/_test/result' || completed) {
    res.writeHead(404).end();
    return;
  }
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 262144) throw new Error('Result limit exceeded.');
    }
    const result = JSON.parse(body),
      valid =
        !result.error &&
        Array.isArray(result.results) &&
        result.results.length === 10 &&
        result.results.every((item) => item.pass === true) &&
        result.nativeCalls === 0 &&
        result.appliedWrites === 0;
    console.log(JSON.stringify(result, null, 2));
    console.log(
      valid
        ? 'PASS: 10/10 procedure comparison detail checks.'
        : 'FAIL: procedure comparison detail checks.',
    );
    process.exitCode = valid ? 0 : 1;
    completed = true;
    clearTimeout(deadline);
    res
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ passed: valid }));
    server.close();
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end(error.message);
  }
});
server.listen(3435, '127.0.0.1', () =>
  console.log(`Open ${origin}/. Ten synthetic actual-component checks run automatically.`),
);
const deadline = setTimeout(() => {
  console.error('FAIL: no completed result within ten minutes.');
  process.exitCode = 1;
  server.closeAllConnections();
  server.close();
}, 600000);
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
  clearTimeout(deadline);
});
process.on('SIGINT', () => {
  clearTimeout(deadline);
  if (!completed) process.exitCode = 1;
  server.closeAllConnections();
  server.close();
});
