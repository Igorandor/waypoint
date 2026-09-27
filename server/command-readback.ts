import { isDeepStrictEqual } from 'node:util';
import { targets } from '../shared/commands.js';
import { credentialField } from '../shared/redaction.js';
import type { CommandRead, CommandResult, ProcessIdentity } from '../shared/command-result.js';
import { parameters, spec } from '../shared/schema.js';
import { ApiError, type Operation } from './upstream.js';

function stable(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => stable(item));
    return ['Roles', 'Resources', 'ApplicationRoles', 'MatchingRoles'].includes(key) &&
      items.every((item) => typeof item === 'string')
      ? [...items].sort()
      : items;
  }
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, item]) => [name, stable(item, name)]),
    );
  return value;
}
export function sameField(a: unknown, b: unknown, key = '') {
  return isDeepStrictEqual(stable(a, key), stable(b, key));
}
export function processIdentity(value: unknown): ProcessIdentity {
  if (!value || typeof value !== 'object')
    throw new ApiError(409, 'The process identity cannot be established.');
  const row = value as Record<string, unknown>;
  const validId = (id: unknown) =>
    (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0) ||
    (typeof id === 'string' && /^\d+$/.test(id));
  if (
    !validId(row.Pid) ||
    !validId(row.JobNumber) ||
    typeof row.StartTimeUTC !== 'string' ||
    !row.StartTimeUTC.trim()
  )
    throw new ApiError(
      409,
      'A process action requires its native PID, job number and start time. Reload its detail record.',
    );
  return {
    pid: String(row.Pid),
    started: row.StartTimeUTC,
    job: String(row.JobNumber),
    user: typeof row.UserName === 'string' ? row.UserName : '',
  };
}
export function assertProcessSame(before: ProcessIdentity, current: unknown) {
  if (!sameField(before, processIdentity(current)))
    throw new ApiError(
      409,
      'The PID now identifies a different process. Select its current generation before preparing another action.',
    );
}
export function selectedProcessCapability(path: string, current: Record<string, unknown>) {
  if (path.endsWith('/suspend') && current.CanBeSuspended !== true)
    throw new ApiError(409, 'IRIS does not permit suspending this process.');
  if (path.endsWith('/terminate') && current.CanBeTerminated !== true)
    throw new ApiError(409, 'IRIS does not permit terminating this process.');
}
export function readbackContract(command: Operation): {
  read: CommandRead;
  title: string;
  target: string;
} {
  const query = command.query ?? {};
  if (/^\/v2\/process\/(suspend|resume|terminate)$/.test(command.path))
    return {
      title: command.path.split('/').at(-1)! + ' process',
      target: query.id ?? '',
      read: {
        path: '/v2/process',
        query: { id: query.id ?? '' },
        mode: command.path.endsWith('/terminate') ? 'process-absence' : 'process-state',
      },
    };
  if (/^\/v2\/task\/(suspend|resume|run)$/.test(command.path))
    return {
      title: command.path.split('/').at(-1)! + ' task',
      target: query.id ?? '',
      read: {
        path: '/v2/task/info',
        query: { id: query.id ?? '' },
        mode: command.path.endsWith('/run') ? 'acknowledgement' : 'task-state',
      },
    };
  const target = targets.find(
    (item) =>
      command.path === item.record ||
      command.path === item.record + '/password' ||
      command.path === item.record + '/secrets',
  );
  if (target) {
    const readQuery = Object.fromEntries(
      parameters(target.record, 'GET')
        .filter((field) => query[field.name] !== undefined)
        .map((field) => [field.name, query[field.name]]),
    );
    const secret = target.opaque || /\/(password|secrets)$/.test(command.path);
    const canRead = !!spec.paths[target.record]?.get && !secret;
    return {
      title: (command.method === 'DELETE' ? 'Delete ' : 'Change ') + target.title,
      target:
        query[target.parameter] ||
        String(
          command.body?.Name ??
            command.body?.Alias ??
            command.body?.ApplicationName ??
            'new record',
        ),
      read: {
        path: target.record,
        query: readQuery,
        mode: !canRead ? 'acknowledgement' : command.method === 'DELETE' ? 'absence' : 'fields',
      },
    };
  }
  if (
    command.path === '/v2/security/service' ||
    command.path === '/v2/security/audit/enabled' ||
    command.path === '/v2/security/oauth2/resource-server'
  )
    return {
      title: 'Change native settings',
      target: query.name ?? command.path,
      read: { path: command.path, query, mode: command.method === 'DELETE' ? 'absence' : 'fields' },
    };
  throw new ApiError(403, 'This operation has no reviewed command contract.');
}
export function readableFields(body: Record<string, unknown>) {
  return Object.keys(body).filter((key) => !protectedField(key, body[key]));
}
export function protectedField(key: string, value: unknown): boolean {
  if (credentialField(key)) return true;
  if (value && typeof value === 'object')
    return Object.entries(value).some(([name, child]) => protectedField(name, child));
  return false;
}
export function protectCommand(command: Operation, owner: string) {
  const name = command.query?.name;
  if (command.path === '/v2/web-app' && name) {
    const canonical = name.toLowerCase().replace(/\/+$/, '') || '/';
    if (
      canonical === '/' ||
      canonical === '/api' ||
      /^\/(api\/(admin|waypoint|relay)|csp\/sys)(\/|$)/.test(canonical)
    )
      throw new ApiError(
        403,
        'Use the native portal to change administration routes. Waypoint protects its own access.',
      );
  }
  if (command.path === '/v2/security/user' && name?.toLowerCase() === owner.toLowerCase()) {
    if (
      command.method === 'DELETE' ||
      command.body?.Enabled === false ||
      Object.hasOwn(command.body ?? {}, 'Roles')
    )
      throw new ApiError(
        403,
        'This command could remove the signed-in operator’s access. Use a separate administrator account.',
      );
  }
  if (
    command.path === '/v2/security/role' &&
    ['%all', '%manager'].includes(name?.toLowerCase() ?? '')
  )
    throw new ApiError(
      403,
      'Built-in administrator roles must be managed through the native portal.',
    );
}
export function compareReadback(
  record: CommandResult,
  current: unknown,
): { matches: boolean; message: string } {
  if (record.read.mode === 'task-state') {
    const state = (current as Record<string, unknown>)?.Suspended;
    return {
      matches: typeof state === 'boolean' && state === record.requestedState,
      message:
        typeof state === 'boolean'
          ? 'Observed task scheduling state: ' + state
          : 'The task scheduling state was not returned.',
    };
  }
  if (record.read.mode === 'process-state') {
    assertProcessSame(record.nativeIdentity!, current);
    const state = (current as Record<string, unknown>)?.State;
    // The native contract exposes a free-form State string. Unknown values cannot prove success.
    const suspended = typeof state === 'string' && /^(susp|suspended|suspend)$/i.test(state.trim());
    const runnable =
      typeof state === 'string' && /^(running|run|job|read|hang|event|lock)$/i.test(state.trim());
    const matches = record.operation.path.endsWith('/suspend') ? suspended : runnable;
    return {
      matches,
      message:
        'Observed process state: ' +
        String(state ?? 'unavailable') +
        '. Only recognized native states can be verified.',
    };
  }
  if (!current || typeof current !== 'object')
    return { matches: false, message: 'No readable configuration was returned.' };
  const fields = record.fields.filter((key) => !record.writeOnlyFields.includes(key));
  const differences = fields.filter(
    (key) => !sameField(record.proposed[key], (current as Record<string, unknown>)[key], key),
  );
  return {
    matches: fields.length > 0 && differences.length === 0,
    message: differences.length
      ? 'Fields still differ: ' + differences.join(', ')
      : fields.length
        ? 'Submitted readable fields match the current configuration.'
        : 'This operation has no readable fields to compare.',
  };
}
