import 'dotenv/config';
import { createApp } from './app.js';
const irisUrl = process.env.IRIS_URL ?? 'http://127.0.0.1:52790';
if (!['http:', 'https:'].includes(new URL(irisUrl).protocol))
  throw new Error('IRIS_URL must use HTTP or HTTPS.');
const app = createApp({
  irisUrl,
  instanceId: process.env.IRIS_INSTANCE_ID,
  dataDirectory: process.env.RELAY_DATA_DIR,
  origin: process.env.PUBLIC_ORIGIN,
  secure: process.env.COOKIE_SECURE === 'true',
});
const server = app.listen(Number(process.env.PORT ?? 3300), process.env.HOST ?? '127.0.0.1', () =>
  console.log(`Relay listening on port ${process.env.PORT ?? 3300}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)));
