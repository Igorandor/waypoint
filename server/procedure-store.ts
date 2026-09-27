import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  procedureBodySchema,
  procedureSummary,
  type Procedure,
  type ProcedureBody,
} from '../shared/procedure.js';
import { ApiError } from './upstream.js';
import { readBoundedJson } from './bounded-file.js';

const storedSchema = z
  .object({
    format: z.literal(1),
    id: z.string().uuid(),
    owner: z.string(),
    instance: z.string(),
    revision: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    archived: z.boolean(),
    versions: z
      .array(
        z
          .object({
            number: z.number().int().positive(),
            createdAt: z.string().datetime(),
            createdBy: z.string(),
            changeNote: z.string().max(1000),
            body: procedureBodySchema,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export class ProcedureStore {
  private busy = new Set<string>();
  constructor(
    private root: string,
    readonly instance: string,
  ) {}
  private directory(owner: string) {
    return join(
      this.root,
      'procedures',
      createHash('sha256')
        .update(this.instance + '\0' + owner)
        .digest('hex'),
    );
  }
  private filename(owner: string, id: string) {
    if (!z.string().uuid().safeParse(id).success)
      throw new ApiError(400, 'Invalid procedure identifier.');
    return join(this.directory(owner), id + '.json');
  }
  private async exclusive<T>(owner: string, action: () => Promise<T>) {
    if (this.busy.has(owner)) throw new ApiError(409, 'A procedure update is already in progress.');
    this.busy.add(owner);
    try {
      return await action();
    } finally {
      this.busy.delete(owner);
    }
  }
  async read(owner: string, id: string): Promise<Procedure> {
    try {
      const parsed = storedSchema.parse(
        await readBoundedJson(this.filename(owner, id), 4 * 1024 * 1024),
      );
      if (parsed.owner !== owner || parsed.instance !== this.instance || parsed.id !== id)
        throw new Error('Scope mismatch');
      if (parsed.versions.some((version, index) => version.number !== index + 1))
        throw new Error('Version sequence mismatch');
      return parsed;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new ApiError(404, 'Procedure not found for this account and instance.');
      throw new ApiError(
        500,
        'The procedure record cannot be read. Preserve the data directory before repair.',
      );
    }
  }
  private async save(record: Procedure) {
    const text = JSON.stringify(storedSchema.parse(record), null, 2);
    if (Buffer.byteLength(text) > 4 * 1024 * 1024)
      throw new ApiError(
        413,
        'The procedure history reached its storage limit. Duplicate its current version to continue.',
      );
    const filename = this.filename(record.owner, record.id);
    const temporary = filename + '.' + randomUUID() + '.tmp';
    try {
      await mkdir(this.directory(record.owner), { recursive: true, mode: 0o700 });
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(text);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, filename);
    } catch {
      await unlink(temporary).catch(() => {});
      throw new ApiError(507, 'The procedure could not be saved. Check storage before retrying.');
    }
  }
  async list(owner: string) {
    let names: string[];
    try {
      names = await readdir(this.directory(owner));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new ApiError(500, 'The procedure directory cannot be read.');
    }
    const files = names.filter((name) => name.endsWith('.json'));
    if (files.length > 200)
      throw new ApiError(409, 'The procedure directory exceeds its supported record limit.');
    const records = [];
    for (const name of files)
      records.push(procedureSummary(await this.read(owner, name.slice(0, -5))));
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async create(owner: string, input: ProcedureBody, note = 'Initial version') {
    const body = procedureBodySchema.parse(input);
    return this.exclusive(owner, async () => {
      if ((await this.list(owner)).length >= 100)
        throw new ApiError(409, 'This account has reached 100 stored procedures.');
      const now = new Date().toISOString();
      const record: Procedure = {
        format: 1,
        id: randomUUID(),
        owner,
        instance: this.instance,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        archived: false,
        versions: [{ number: 1, createdAt: now, createdBy: owner, changeNote: note, body }],
      };
      await this.save(record);
      return record;
    });
  }
  async revise(owner: string, id: string, revision: number, input: ProcedureBody, note: string) {
    const body = procedureBodySchema.parse(input);
    return this.exclusive(owner, async () => {
      const record = await this.read(owner, id);
      if (record.revision !== revision)
        throw new ApiError(409, 'This procedure changed. Reload its latest version before saving.');
      if (record.archived)
        throw new ApiError(409, 'Restore this archived procedure before editing it.');
      if (record.versions.length >= 100)
        throw new ApiError(
          409,
          'This procedure has 100 versions. Duplicate its current version to continue.',
        );
      record.updatedAt = new Date().toISOString();
      record.revision++;
      record.versions.push({
        number: record.versions.length + 1,
        createdAt: record.updatedAt,
        createdBy: owner,
        changeNote: note,
        body,
      });
      await this.save(record);
      return record;
    });
  }
  async archive(owner: string, id: string, revision: number, archived: boolean) {
    return this.exclusive(owner, async () => {
      const record = await this.read(owner, id);
      if (record.revision !== revision)
        throw new ApiError(
          409,
          'This procedure changed. Reload before changing its archive state.',
        );
      record.archived = archived;
      record.revision++;
      record.updatedAt = new Date().toISOString();
      await this.save(record);
      return record;
    });
  }
}
