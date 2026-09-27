import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Run } from '../shared/runbook.js';
import type { Operation } from './upstream.js';
import { ApiError } from './upstream.js';
import { readBoundedJson } from './bounded-file.js';

export type ReservedTarget = { kind: 'application' | 'task'; identity: string };
export function canonicalTarget(target: ReservedTarget) {
  if (target.kind === 'task') {
    return 'task:' + canonicalNumericIdentity(target.identity);
  }
  if (!target.identity.startsWith('/') || /[\x00-\x1f?#\\]/.test(target.identity))
    throw new ApiError(400, 'Invalid application target.');
  return 'application:' + (target.identity.toLowerCase().replace(/\/+$/, '') || '/');
}
export function canonicalNumericIdentity(value: string) {
  if (
    !/^\d{1,32}$/.test(value) ||
    BigInt(value) < 1n ||
    BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new ApiError(400, 'Invalid numeric target identity.');
  return BigInt(value).toString();
}
export function canonicalCommandIdentity(path: string, query: Record<string, string>) {
  const numeric = /^\/v2\/(?:task|process)(?:\/|$)/.test(path);
  const parts = Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => [
      name,
      numeric && name === 'id'
        ? canonicalNumericIdentity(value)
        : value.toLowerCase().replace(/\/+$/, ''),
    ]);
  return JSON.stringify([path, parts]);
}
export function runTarget(run: Pick<Run, 'template' | 'target'>): ReservedTarget | undefined {
  if (run.template === 'application-window') return { kind: 'application', identity: run.target };
  if (run.template === 'task-window') return { kind: 'task', identity: run.target };
}
export function commandTarget(operation: Operation): ReservedTarget | undefined {
  if (operation.method === 'GET') return;
  if (operation.path === '/v2/web-app' && operation.query?.name)
    return { kind: 'application', identity: operation.query.name };
  if (/^\/v2\/task(?:\/|$)/.test(operation.path) && operation.query?.id)
    return { kind: 'task', identity: operation.query.id };
}

/** The durable run itself owns its reservation. A new process rebuilds the index from disk. */
export class TargetReservations {
  private inFlight = new Set<string>();
  constructor(
    private root: string,
    readonly instance: string,
  ) {}
  private async storedClaims() {
    let directories;
    try {
      directories = await readdir(this.root, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new ApiError(500, 'Cannot inspect maintenance reservations. No change was sent.');
    }
    const owners = directories.filter(
      (item) => item.isDirectory() && /^[0-9a-f]{64}$/.test(item.name),
    );
    if (owners.length > 1000)
      throw new ApiError(409, 'The run store exceeds its supported account count.');
    const claims: Array<{ key: string; runId: string }> = [];
    let inspected = 0;
    for (const directory of owners) {
      const base = join(this.root, directory.name);
      for (const file of await readdir(base, { withFileTypes: true })) {
        if (!file.name.endsWith('.json')) continue;
        if (!file.isFile() || ++inspected > 20000)
          throw new ApiError(409, 'Maintenance reservation records need administrator review.');
        try {
          const filename = join(base, file.name);
          const run = (await readBoundedJson(filename, 4 * 1024 * 1024)) as Run;
          if (
            run.version !== 1 ||
            typeof run.id !== 'string' ||
            run.id + '.json' !== file.name ||
            typeof run.instance !== 'string' ||
            !['active', 'completed', 'stopped'].includes(run.status) ||
            typeof run.needsRestore !== 'boolean' ||
            !Array.isArray(run.steps)
          )
            throw new Error('Invalid run');
          if (run.instance !== this.instance) continue;
          const target = runTarget(run);
          const unresolved = run.steps.some((step) =>
            ['running', 'uncertain'].includes(step.status),
          );
          if (target && (run.status === 'active' || run.needsRestore || unresolved))
            claims.push({ key: canonicalTarget(target), runId: run.id });
        } catch {
          throw new ApiError(
            409,
            'A stored run cannot be checked for a restoration obligation. Preserve and repair the journal before sending changes.',
          );
        }
      }
    }
    return claims;
  }
  async withTarget<T>(
    target: ReservedTarget | undefined,
    runId: string | undefined,
    action: () => Promise<T>,
  ): Promise<T> {
    if (!target) return action();
    const key = canonicalTarget(target);
    if (this.inFlight.has(key))
      throw new ApiError(409, 'Another operation is using this target. Refresh before retrying.');
    this.inFlight.add(key);
    try {
      const claims = (await this.storedClaims()).filter((claim) => claim.key === key);
      if (claims.some((claim) => claim.runId !== runId))
        throw new ApiError(
          409,
          'This target is reserved by an active maintenance window. Its operator must restore and close the window first.',
        );
      return await action();
    } finally {
      this.inFlight.delete(key);
    }
  }
}
