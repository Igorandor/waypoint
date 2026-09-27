import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { CommandResult } from '../shared/command-result.js';
import { ApiError } from './upstream.js';
import { readBoundedJson } from './bounded-file.js';
import { validateStoredCommand } from './command-validation.js';
export type CommandSummary = Pick<
  CommandResult,
  | 'id'
  | 'title'
  | 'target'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'message'
  | 'operation'
  | 'read'
>;

export class CommandJournal {
  constructor(
    private root: string,
    readonly instance: string,
  ) {}
  private directory(owner: string) {
    return join(
      this.root,
      'commands',
      createHash('sha256')
        .update(this.instance + '\0' + owner)
        .digest('hex'),
    );
  }
  private file(owner: string, id: string) {
    if (!z.string().uuid().safeParse(id).success)
      throw new ApiError(400, 'Invalid command identifier.');
    return join(this.directory(owner), id + '.json');
  }
  async read(owner: string, id: string): Promise<CommandResult> {
    try {
      const filename = this.file(owner, id);
      const result = await readBoundedJson(filename, 1024 * 1024);
      validateStoredCommand(result);
      if (
        result.format !== 1 ||
        result.owner !== owner ||
        result.instance !== this.instance ||
        result.id !== id
      )
        throw new Error('Invalid command');
      return result;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new ApiError(404, 'Command not found for this account and instance.');
      throw new ApiError(
        500,
        'The command journal cannot be read. Preserve the data directory before repair.',
      );
    }
  }
  private async names(owner: string) {
    let names: string[];
    try {
      names = await readdir(this.directory(owner));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new ApiError(500, 'The command directory cannot be read.');
    }
    const records = names.filter((name) => name.endsWith('.json'));
    if (records.length > 1000)
      throw new ApiError(409, 'The command journal exceeds its supported record limit.');
    return records;
  }
  async count(owner: string) {
    return (await this.names(owner)).length;
  }
  async list(owner: string) {
    const results: CommandSummary[] = [];
    for (const name of await this.names(owner)) {
      const record = await this.read(owner, name.slice(0, -5));
      results.push({
        id: record.id,
        title: record.title,
        target: record.target,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        message: record.message,
        operation: record.operation,
        read: record.read,
      });
    }
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async save(record: CommandResult) {
    const serialized = JSON.stringify(record, null, 2);
    if (Buffer.byteLength(serialized) > 1024 * 1024)
      throw new ApiError(413, 'This command record exceeds its storage budget.');
    const filename = this.file(record.owner, record.id),
      temporary = filename + '.' + randomUUID() + '.tmp';
    try {
      await mkdir(this.directory(record.owner), { recursive: true, mode: 0o700 });
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(serialized);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, filename);
    } catch {
      await unlink(temporary).catch(() => {});
      throw new ApiError(
        507,
        'The command journal could not be saved. Check storage and reconcile any dispatched command before retrying.',
      );
    }
  }
}
