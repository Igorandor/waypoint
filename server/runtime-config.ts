import { isIP } from 'node:net';
import { resolve } from 'node:path';

export type RuntimeConfiguration = {
  irisUrl: string;
  port: number;
  host: string;
  origin: string;
  secure: boolean;
  instanceId: string;
  dataDirectory: string;
};
function serverAddress(raw: string, label: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(label + ' must be a valid absolute URL.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error(
      label +
        ' must contain only an HTTP(S) scheme, hostname and optional port, without credentials, path, query or fragment.',
    );
  return url;
}
function booleanSetting(raw: string | undefined, fallback: boolean, label: string) {
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(label + ' must be exactly true or false.');
}
export function runtimeConfiguration(
  env: Record<string, string | undefined>,
): RuntimeConfiguration {
  const upstream = serverAddress(env.IRIS_URL ?? 'http://127.0.0.1:52790', 'IRIS_URL');
  const origin = serverAddress(env.PUBLIC_ORIGIN ?? 'http://localhost:3300', 'PUBLIC_ORIGIN');
  const portText = env.PORT ?? '3300';
  if (!/^\d{1,5}$/.test(portText) || +portText < 1 || +portText > 65535)
    throw new Error('PORT must be a TCP port between 1 and 65535.');
  const host = env.HOST ?? '127.0.0.1';
  if (!isIP(host) && host !== 'localhost')
    throw new Error('HOST must be an explicit IPv4/IPv6 listen address or localhost.');
  const secure = booleanSetting(env.COOKIE_SECURE, origin.protocol === 'https:', 'COOKIE_SECURE');
  if (origin.protocol === 'https:' && !secure)
    throw new Error('HTTPS deployments require COOKIE_SECURE=true.');
  if (origin.protocol === 'http:' && secure)
    throw new Error('Secure cookies require an HTTPS PUBLIC_ORIGIN.');
  if (origin.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
    throw new Error('A non-loopback PUBLIC_ORIGIN must use HTTPS.');
  const instanceId = env.IRIS_INSTANCE_ID ?? 'waypoint-local';
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(instanceId))
    throw new Error(
      'IRIS_INSTANCE_ID must be a stable 1–128 character identifier using letters, digits, dots, underscores or hyphens.',
    );
  const directory = env.WAYPOINT_DATA_DIR ?? './data';
  if (!directory.trim() || /[\x00-\x1f]/.test(directory))
    throw new Error('WAYPOINT_DATA_DIR must identify the persistent journal directory.');
  return {
    irisUrl: upstream.origin,
    port: +portText,
    host,
    origin: origin.origin,
    secure,
    instanceId,
    dataDirectory: resolve(directory),
  };
}
