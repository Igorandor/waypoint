import { parameters, spec } from '../shared/schema.js';
import { credentialValues } from '../shared/redaction.js';
import { boundedJson } from './json-limits.js';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export type Operation = {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string>;
  body?: Record<string, any>;
};
const enabled = new Set(
  [
    'web-app',
    'security/user',
    'security/user/password',
    'security/role',
    'security/resource',
    'security/ssl-configuration',
    'security/x509-credential',
    'security/oauth2/client/server-definition',
    'security/oauth2/client/client-configuration',
    'security/oauth2/client/client-configuration/secrets',
    'security/oauth2/resource-server',
    'security/service',
    'wallet/collection',
    'wallet/secret',
    'task',
    'task/run',
    'task/suspend',
    'task/resume',
    'process/suspend',
    'process/resume',
    'process/terminate',
    'device',
    'security/audit/enabled',
    'security/audit/records',
  ].map((name) => '/v2/' + name),
);
export function validateOperation(command: Operation) {
  const { path, method, query = {}, body } = command;
  if (!boundedJson(body, 32, 20000))
    throw new ApiError(400, 'Request nesting or complexity exceeds the allowed budget.');
  const credentials = credentialValues(body);
  if (credentials.length > 128 || credentials.join('').length > 32768)
    throw new ApiError(400, 'Credential fields exceed the request budget.');
  const extension = path === '/extension/telemetry' || path === '/extension/logs';
  if (extension) {
    if (method !== 'GET' || Object.keys(query).some((key) => !['source', 'limit'].includes(key)))
      throw new ApiError(400, 'Invalid observation request.');
    return;
  }
  if (!Object.hasOwn(spec.paths, path) || !Object.hasOwn(spec.paths[path], method.toLowerCase()))
    throw new ApiError(400, 'Unknown native operation.');
  if (/^\/(login|logout|refresh|revoke)$/.test(path))
    throw new ApiError(403, 'Authentication is managed by Waypoint.');
  if (method !== 'GET' && !enabled.has(path))
    throw new ApiError(403, 'Command is outside Waypoint’s write policy.');
  if (
    method === 'GET' &&
    /\/(secret|secrets|password|initial-access-token|search-password)$/.test(path) &&
    path !== '/v2/wallet/secrets'
  )
    throw new ApiError(403, 'Stored credentials cannot be read.');
  const declared = parameters(path, method);
  for (const key of Object.keys(query))
    if (!declared.some((p) => p.name === key))
      throw new ApiError(400, 'Unknown query parameter: ' + key);
  for (const param of declared)
    if (param.required && !query[param.name])
      throw new ApiError(400, 'Required parameter: ' + param.name);
  if (
    Object.hasOwn(query, 'maxRows') &&
    (!/^[0-9]+$/.test(query.maxRows) || +query.maxRows < 1 || +query.maxRows > 1000)
  )
    throw new ApiError(400, 'maxRows must be between 1 and 1000.');
}
