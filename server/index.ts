import 'dotenv/config';
import { createApp } from './app.js';
const target = new URL(process.env.IRIS_URL ?? 'http://127.0.0.1:52790');
if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password)
  throw new Error('IRIS_URL must be an HTTP(S) server address without embedded credentials.');
const port = Number(process.env.PORT ?? 3300);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be a valid TCP port.');
const origin = process.env.PUBLIC_ORIGIN;
if (origin && new URL(origin).origin !== origin)
  throw new Error('PUBLIC_ORIGIN must contain only the public scheme, host and port.');
const server = createApp({
  irisUrl: target.href,
  origin,
  secure: process.env.COOKIE_SECURE === 'true',
  instanceId: process.env.IRIS_INSTANCE_ID,
  dataDirectory: process.env.WAYPOINT_DATA_DIR,
}).listen(port, process.env.HOST ?? '127.0.0.1', () =>
  console.log('Waypoint operator gateway listening on ' + port),
);
process.once('SIGINT', () => server.close());
process.once('SIGTERM', () => server.close());
