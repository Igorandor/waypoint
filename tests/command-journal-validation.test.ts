import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CommandJournal } from '../server/command-journal';
import { CommandService } from '../server/command-service';
import { TargetReservations } from '../server/target-reservations';
import type { IrisClient } from '../server/upstream';
import type { CommandResult } from '../shared/command-result';

const owner = 'operator',
  instance = 'fixture';
const actor = { owner, auth: 'synthetic' };
const now = '2026-09-27T18:55:00.000Z';
function command(): CommandResult {
  return {
    format: 1,
    id: randomUUID(),
    owner,
    instance,
    createdAt: now,
    updatedAt: now,
    expiresAt: now,
    status: 'dispatching',
    operation: { path: '/v2/web-app', method: 'PUT', query: { name: '/fixture' } },
    title: 'Fixture',
    target: '/fixture',
    confirmation: '/fixture',
    before: { Enabled: true },
    proposed: { Enabled: false },
    fields: ['Enabled'],
    writeOnlyFields: [],
    read: { path: '/v2/web-app', query: { name: '/fixture' }, mode: 'fields' },
    message: 'Synthetic dispatch',
    events: [],
  };
}
async function fixture(t: { after: (action: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'waypoint-command-validation-'));
  t.after(async () => {
    const resolved = resolve(root);
    assert.ok(
      resolved.startsWith(
        resolve(tmpdir()) +
          (process.platform === 'win32' ? '\\' : '/') +
          'waypoint-command-validation-',
      ),
    );
    await rm(resolved, { recursive: true, force: true });
  });
  const directory = join(
    root,
    'commands',
    createHash('sha256')
      .update(instance + '\0' + owner)
      .digest('hex'),
  );
  await mkdir(directory, { recursive: true });
  const journal = new CommandJournal(root, instance);
  let nativeCalls = 0;
  const client = {
    request: async () => {
      nativeCalls++;
      throw new Error('Unexpected native call');
    },
  } as unknown as IrisClient;
  const service = new CommandService(journal, client, new TargetReservations(root, instance));
  return { journal, service, directory, nativeCalls: () => nativeCalls };
}

test('malformed command receipts fail before recovery, consumers or native calls and retain their exact bytes', async (t) => {
  const f = await fixture(t);
  const variants = [
    { fields: null },
    { writeOnlyFields: [null] },
    { events: [null] },
    { events: [{ at: now, status: 'invented', message: 'bad' }] },
    { read: { path: '/v2/web-app', query: null, mode: 'fields' } },
    { read: { path: '/v2/web-app', query: { name: 12 }, mode: 'fields' } },
    { operation: { path: '/v2/web-app', query: {}, method: null } },
    { proposed: null },
    { before: [] },
    { nativeIdentity: { pid: '1' } },
    { updatedAt: null },
    { status: 'invented' },
    { requestedState: 'false' },
  ];
  for (const variant of variants) {
    const record = { ...command(), ...variant };
    const file = join(f.directory, record.id + '.json');
    const bytes = JSON.stringify(record, null, 3) + '\n';
    await writeFile(file, bytes);
    const unchanged = async () => assert.equal(await readFile(file, 'utf8'), bytes);
    const failure = {
      status: 500,
      message: 'The command journal cannot be read. Preserve the data directory before repair.',
    };
    await assert.rejects(f.journal.read(owner, record.id), failure);
    await unchanged();
    await assert.rejects(f.journal.list(owner), failure);
    await assert.rejects(f.service.get(actor, record.id), failure);
    await assert.rejects(f.service.execute(actor, record.id, '/fixture'), failure);
    await assert.rejects(f.service.reconcile(actor, record.id), failure);
    await unchanged();
    assert.equal(f.nativeCalls(), 0);
    await unlink(file);
  }
});

test('legacy optional fields and arbitrary nested evidence survive validation and interrupted command recovery', async (t) => {
  const f = await fixture(t);
  const record = {
    ...command(),
    createdAt: '2026-09-27T20:55:00+02:00',
    before: { Enabled: true, retained: { numbers: [1, null, 2], future: true } },
    proposed: { Enabled: false, retained: ['a', { another: 5 }] },
    response: [null, { unknownEvidence: { nested: ['x', 3, false] } }],
    observed: 'legacy scalar evidence',
    futureExtension: { nested: ['preserve me'] },
    read: { ...command().read, futureReadExtension: { valid: true } },
    events: [
      { at: now, status: 'dispatching' as const, message: 'sent', retained: { extra: true } },
    ],
  };
  const file = join(f.directory, record.id + '.json');
  const bytes = JSON.stringify(record, null, 3) + '\n';
  await writeFile(file, bytes);
  assert.deepEqual(await f.journal.read(owner, record.id), record);
  assert.equal(await readFile(file, 'utf8'), bytes);
  assert.equal((await f.journal.list(owner))[0].id, record.id);
  const recovered = await f.service.get(actor, record.id);
  assert.equal(recovered.status, 'uncertain');
  const persisted = JSON.parse(await readFile(file, 'utf8'));
  for (const field of [
    'createdAt',
    'before',
    'proposed',
    'response',
    'observed',
    'futureExtension',
    'read',
  ])
    assert.deepEqual(persisted[field], record[field as keyof typeof record]);
  assert.deepEqual(persisted.events[0], record.events[0]);
  assert.equal(f.nativeCalls(), 0);
});
