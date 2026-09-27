import { mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { Run, RunSummary } from '../shared/runbook.js';
import { summarize } from '../shared/runbook.js';
import { ApiError } from './upstream.js';
import { readBoundedJson } from './bounded-file.js';

/** One process owns a store. Files are atomically replaced; credentials are never persisted. */
export class RunStore {
  readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private directory(owner: string, instance: string) {
    return join(
      this.root,
      createHash('sha256')
        .update(instance + '\0' + owner)
        .digest('hex'),
    );
  }
  private file(owner: string, instance: string, id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(id)) throw new ApiError(400, 'Invalid run identifier.');
    return join(this.directory(owner, instance), id + '.json');
  }
  async read(owner: string, instance: string, id: string): Promise<Run> {
    try {
      const filename = this.file(owner, instance, id);
      const run = (await readBoundedJson(filename, 4 * 1024 * 1024)) as Run;
      if (
        run.version !== 1 ||
        run.owner !== owner ||
        run.instance !== instance ||
        run.id !== id ||
        !Array.isArray(run.steps)
      )
        throw new Error('Invalid run record.');
      return run;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new ApiError(404, 'Run not found for this account and instance.');
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        500,
        'The stored run could not be read. Preserve the data directory and inspect it before continuing.',
      );
    }
  }
  async save(run: Run) {
    let temporary: string | undefined;
    try {
      const encoded = JSON.stringify(run, null, 2);
      if (Buffer.byteLength(encoded) > 4 * 1024 * 1024)
        throw new ApiError(413, 'The run reached its 4 MiB journal limit.');
      const directory = this.directory(run.owner, run.instance);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const file = this.file(run.owner, run.instance, run.id);
      temporary = file + '.' + randomUUID() + '.tmp';
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(encoded);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, file);
    } catch (error) {
      if (temporary) await unlink(temporary).catch(() => {});
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        507,
        'The run journal could not be saved. Check data-directory permissions and free space. Refresh and reconcile any interrupted step before continuing.',
      );
    }
  }
  async list(owner: string, instance: string): Promise<RunSummary[]> {
    let files: string[];
    try {
      files = await readdir(this.directory(owner, instance));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const results: RunSummary[] = [];
    const records = files.filter((file) => file.endsWith('.json'));
    if (records.length > 1000)
      throw new ApiError(409, 'The run directory exceeds its supported record limit.');
    for (const name of records)
      results.push(summarize(await this.read(owner, instance, name.slice(0, -5))));
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
