import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { Run } from '../shared/runbook';
import { RunStore } from '../server/run-store';

const owner = 'synthetic-alice',
  instance = 'synthetic-instance';
const at = '2026-09-27T12:00:00.000Z';
function record(): Run {
  return {
    version: 1,
    id: randomUUID(),
    owner,
    instance,
    template: 'observe',
    title: 'Stored observation',
    target: '',
    createdAt: at,
    updatedAt: at,
    status: 'active',
    needsRestore: false,
    steps: [
      {
        kind: 'health',
        title: 'Health',
        description: 'Saved observation',
        status: 'pending',
        attempts: 0,
      },
    ],
    events: [],
  };
}
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'waypoint-run-shape-'));
  t.after(async () => {
    const absolute = await realpath(root),
      temporary = await realpath(tmpdir());
    assert.equal(dirname(absolute), temporary);
    assert.ok(basename(absolute).startsWith('waypoint-run-shape-'));
    await rm(absolute, { recursive: true, force: false });
  });
  const directory = (account = owner, host = instance) =>
    join(
      root,
      createHash('sha256')
        .update(host + '\0' + account)
        .digest('hex'),
    );
  const file = (run: Run) => join(directory(run.owner, run.instance), run.id + '.json');
  const store = new RunStore(root),
    healthy = record();
  await store.save(healthy);
  const healthyBytes = await readFile(file(healthy));
  async function rejected(value: unknown, id: string) {
    const filename = join(directory(), id + '.json');
    await writeFile(filename, typeof value === 'string' ? value : JSON.stringify(value));
    const before = await readFile(filename),
      names = await readdir(directory());
    for (const read of [() => store.read(owner, instance, id), () => store.list(owner, instance)])
      await assert.rejects(
        read,
        (cause: any) => cause.status === 500 && /Preserve the data directory/.test(cause.message),
      );
    assert.deepEqual(
      await readFile(filename),
      before,
      'bad document is never reset or repaired during reads',
    );
    assert.deepEqual(
      await readdir(directory()),
      names,
      'no temporary or replacement files are created',
    );
    assert.deepEqual(await readFile(file(healthy)), healthyBytes);
    assert.deepEqual(await store.read(owner, instance, healthy.id), healthy);
  }
  return { root, store, healthy, directory, file, rejected };
}

test('stored run core and step corruption fails at read boundary without altering any document', async (t) => {
  const f = await fixture(t),
    good = record();
  const cases: unknown[] = [
    '{broken',
    null,
    [],
    {},
    { ...good, version: 2 },
    { ...good, title: {} },
    { ...good, target: 7 },
    { ...good, status: 'invented' },
    { ...good, template: 'invented' },
    { ...good, needsRestore: 'false' },
    { ...good, original: null },
    { ...good, steps: null },
    { ...good, steps: [] },
    { ...good, steps: [null] },
    { ...good, steps: [{}] },
    ...[
      { kind: 'invented' },
      { status: 'invented' },
      { attempts: -1 },
      { description: [] },
      { title: null },
    ].map((change) => ({ ...good, steps: [{ ...good.steps[0], ...change }] })),
    { ...good, events: null },
    { ...good, events: [null] },
    { ...good, events: [{ at, action: 'read', message: {} }] },
  ];
  for (const value of cases) await f.rejected(value, good.id);
});

test('stored dates and optional journal structures are validated only when present', async (t) => {
  const f = await fixture(t),
    good = record();
  const handover = {
    recipient: 'Operator',
    summary: 'Read the observation',
    outstandingRisks: '',
    nextActions: [],
    references: [],
    delivered: false,
    revision: 1,
    updatedAt: at,
    updatedBy: owner,
  };
  for (const value of [
    { ...good, createdAt: 'not-a-date' },
    { ...good, updatedAt: 1 },
    { ...good, createdAt: '2026-02-29T00:00:00.000Z' },
    { ...good, archivedAt: '2026-13-01T00:00:00.000Z' },
    { ...good, steps: [{ ...good.steps[0], startedAt: 'yesterday' }] },
    { ...good, steps: [{ ...good.steps[0], finishedAt: null }] },
    { ...good, events: [{ at: 'tomorrow', action: 'read', message: '' }] },
    { ...good, handover: null },
    { ...good, handover: {} },
    { ...good, handover: { ...handover, nextActions: null } },
    { ...good, handover: { ...handover, nextActions: [null] } },
    {
      ...good,
      handover: {
        ...handover,
        nextActions: [{ id: 'follow-up', title: 'Check', completed: false, dueAt: 'invalid' }],
      },
    },
    { ...good, handover: { ...handover, updatedAt: 'invalid' } },
    { ...good, notes: null },
    { ...good, notes: [{ id: 'note', at, author: owner, text: [], category: 'observation' }] },
    { ...good, revision: -1 },
    { ...good, revision: '1' },
    {
      ...good,
      steps: [{ ...good.steps[0], checklist: { completed: [1], note: '', actor: owner, at } }],
    },
  ])
    await f.rejected(value, good.id);
});

test('legacy optional fields remain absent and arbitrary evidence is preserved byte-for-byte', async (t) => {
  const f = await fixture(t);
  const legacy = record();
  await f.store.save(legacy);
  const modern: Run = {
    ...record(),
    revision: 3,
    closureNote: 'Retained text',
    notes: [{ id: randomUUID(), at, author: owner, text: 'Observed', category: 'decision' }],
    handover: {
      recipient: 'Operator',
      summary: 'Ready for review',
      outstandingRisks: '',
      nextActions: [{ id: 'review', title: 'Review', completed: false, dueAt: '' }],
      references: [],
      delivered: true,
      revision: 1,
      updatedAt: at,
      updatedBy: owner,
      deliveryRecordedAt: at,
    },
  };
  for (const evidence of [
    null,
    false,
    42,
    'plain text',
    [],
    { NativeDate: 'not-an-ISO-date', steps: [null], extra: { arbitrary: true } },
  ]) {
    modern.steps[0].evidence = evidence;
    await f.store.save(modern);
    const before = await readFile(f.file(modern));
    const loaded = await f.store.read(owner, instance, modern.id);
    assert.deepEqual(loaded, modern);
    assert.deepEqual(await readFile(f.file(modern)), before);
  }
  const loadedLegacy = await f.store.read(owner, instance, legacy.id);
  for (const key of ['revision', 'notes', 'handover'])
    assert.equal(Object.hasOwn(loadedLegacy, key), false);
  assert.deepEqual(loadedLegacy, legacy);
  assert.equal((await f.store.list(owner, instance)).length, 3);
  const extension = { ...legacy, retainedExtension: { arbitrary: true } };
  await writeFile(f.file(legacy), JSON.stringify(extension));
  assert.deepEqual(
    await f.store.read(owner, instance, legacy.id),
    extension,
    'schema validation must not strip extensions from the original record',
  );
});

test('valid immutable procedure snapshots are retained but missing stored fields are not defaulted', async (t) => {
  const f = await fixture(t),
    good = record();
  const definition = {
    id: 'read',
    kind: 'observation' as const,
    title: 'Health',
    instruction: '',
    source: 'health' as const,
    target: '',
  };
  const body = {
    title: 'Procedure snapshot',
    description: '',
    expectedOutcome: '',
    tags: [],
    steps: [definition],
  };
  good.procedure = {
    id: randomUUID(),
    version: { number: 1, createdAt: at, createdBy: owner, changeNote: 'Initial version', body },
  };
  good.steps[0].procedureStep = definition;
  await f.store.save(good);
  const before = await readFile(f.file(good));
  assert.deepEqual(await f.store.read(owner, instance, good.id), good);
  assert.deepEqual(await readFile(f.file(good)), before);
  const missing = structuredClone(good) as any;
  delete missing.steps[0].procedureStep.target;
  await f.rejected(missing, good.id);
  const missingSnapshot = structuredClone(good) as any;
  delete missingSnapshot.procedure.version.body.steps[0].target;
  await f.rejected(missingSnapshot, good.id);
});

test('validation preserves owner/instance isolation and other scopes when one stored run is corrupt', async (t) => {
  const f = await fixture(t),
    good = record();
  const otherOwner = { ...record(), owner: 'synthetic-bob' },
    otherInstance = { ...record(), instance: 'synthetic-other' };
  await f.store.save(otherOwner);
  await f.store.save(otherInstance);
  const paths = [f.file(otherOwner), f.file(otherInstance)],
    before = await Promise.all(paths.map((file) => readFile(file)));
  await f.rejected({ ...good, steps: [null] }, good.id);
  for (const changed of [
    { ...good, owner: 'synthetic-bob' },
    { ...good, instance: 'synthetic-other' },
    { ...good, id: randomUUID() },
  ])
    await f.rejected(changed, good.id);
  await assert.rejects(() => f.store.read(otherOwner.owner, instance, f.healthy.id), {
    status: 404,
  });
  await assert.rejects(() => f.store.read(owner, otherInstance.instance, f.healthy.id), {
    status: 404,
  });
  assert.equal((await f.store.list(otherOwner.owner, instance)).length, 1);
  assert.equal((await f.store.list(owner, otherInstance.instance)).length, 1);
  for (let index = 0; index < paths.length; index++)
    assert.deepEqual(await readFile(paths[index]), before[index]);
});
