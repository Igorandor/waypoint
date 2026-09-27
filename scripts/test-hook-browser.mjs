import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const origin = 'http://127.0.0.1:3430';
const tasks = process.argv.includes('--tasks');
const expected = tasks ? 8 : 12;
const label = tasks ? 'task inventory and dossier' : 'native observation hook';
const bundle = await build({
  entryPoints: [
    fileURLToPath(
      new URL(
        `../tests/browser/${tasks ? 'task-list' : 'native-observation'}.jsx`,
        import.meta.url,
      ),
    ),
  ],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"' },
});
const html = `<!doctype html><meta charset="utf-8"><title>Waypoint ${label} regression</title>
<h1>Waypoint ${label} regression</h1>
<p>Actual React source with synthetic transport. This tests behavior, not visual layout.</p>
<div id="probe"></div><pre id="result">Running…</pre><script src="/probe.js"></script>`;
let completed = false;
const server = http.createServer(async (req, res) => {
  if (
    req.headers.host !== '127.0.0.1:3430' ||
    (req.headers.origin && req.headers.origin !== origin)
  ) {
    res.writeHead(403).end();
    return;
  }
  if (req.method === 'GET' && ['/', '/probe.js'].includes(req.url)) {
    res.writeHead(200, {
      'Content-Type': req.url === '/' ? 'text/html; charset=utf-8' : 'text/javascript',
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
      if (Buffer.byteLength(body) > 262144) throw new Error('Result exceeds 256 KiB.');
    }
    const report = JSON.parse(body);
    const valid =
      !report.error &&
      Array.isArray(report.results) &&
      report.results.length === expected &&
      report.results.every((result) => result.pass === true) &&
      report.nativeCalls === 0 &&
      report.appliedWrites === 0;
    console.log(JSON.stringify(report, null, 2));
    console.log(
      valid ? `PASS: ${expected}/${expected} ${label} checks.` : `FAIL: ${label} regression.`,
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
server.listen(3430, '127.0.0.1', () => {
  console.log(`Open ${origin}/ in a browser. The ${expected} checks run automatically.`);
  console.log('The runner reports JSON and exits after completion. No IRIS connection is used.');
});
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
  clearTimeout(deadline);
});
const deadline = setTimeout(() => {
  console.error('FAIL: no complete browser result within 10 minutes.');
  process.exitCode = 1;
  server.closeAllConnections();
  server.close();
}, 600000);
process.on('SIGINT', () => {
  clearTimeout(deadline);
  process.exitCode = completed ? process.exitCode : 1;
  server.closeAllConnections();
  server.close();
});
