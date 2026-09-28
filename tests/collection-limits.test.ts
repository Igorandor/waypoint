import test from 'node:test';
import assert from 'node:assert/strict';
import { RunEngine } from '../server/run-engine';
import { RunStore } from '../server/run-store';
import { validateStoredRun } from '../server/run-validation';
import { IrisClient } from '../server/upstream';
import { procedureBodySchema } from '../shared/procedure';
import { summarize, type Run } from '../shared/runbook';
import { exportHandover } from '../shared/run-records';
import { handoverHtml } from '../shared/handover-report';
import { collectionLimitNotice } from '../shared/collection-limits';

class MemoryStore extends RunStore {
  records = new Map<string, Run>();
  constructor() {
    super('unused-memory-only-root');
  }
  async save(run: Run) {
    validateStoredRun(run);
    this.records.set(run.id, structuredClone(run));
  }
  async read(_owner: string, _instance: string, id: string) {
    const run = structuredClone(this.records.get(id));
    validateStoredRun(run);
    return run;
  }
  async list() {
    return [...this.records.values()].map(summarize);
  }
}
const actor = { owner: 'Fixture', auth: 'Basic synthetic' };
function fixture() {
  const requests: URL[] = [],
    store = new MemoryStore();
  let fail = false;
  const evidence = [{ Id: 7, Name: 'Synthetic task', Suspended: false }];
  const client = new IrisClient('http://synthetic.invalid', async (url, options) => {
    assert.equal(options?.method, 'GET');
    requests.push(new URL(String(url)));
    return fail
      ? Response.json({ error: 'Synthetic unavailable' }, { status: 503 })
      : Response.json({ result: evidence });
  });
  return {
    store,
    engine: new RunEngine(store, client, 'synthetic-only'),
    requests,
    evidence,
    fail: (value: boolean) => {
      fail = value;
    },
  };
}
function version(sources: string[]) {
  return {
    number: 1,
    createdAt: '2026-09-28T12:00:00.000Z',
    createdBy: 'Fixture',
    changeNote: '',
    body: procedureBodySchema.parse({
      title: 'Task review',
      description: '',
      expectedOutcome: '',
      tags: [],
      steps: sources.map((source, i) => ({
        id: 'step' + i,
        kind: 'observation',
        title: 'Observation ' + i,
        instruction: '',
        source,
        target: source === 'task-history' ? '7' : '',
      })),
    }),
  };
}
test('procedure inventories and history record exact request limits without wrapping evidence', async () => {
  const f = fixture();
  let run = await f.engine.fromProcedure(
    actor,
    'fixture-procedure',
    version(['applications', 'tasks', 'processes', 'journals', 'task-history']),
  );
  for (let i = 0; i < 5; i++) {
    run = await f.engine.next(actor, run.id);
    const step = run.steps[i],
      requested = Number(f.requests[i].searchParams.get('maxRows'));
    assert.equal(requested, i === 4 ? 50 : 100);
    assert.equal(step.collection?.requestedRowLimit, requested);
    assert.deepEqual(step.evidence, f.evidence);
    assert.ok(step.startedAt && step.finishedAt);
    assert.match(collectionLimitNotice(step)!, /does not establish that all source records/);
  }
  assert.equal(exportHandover(run).run.steps[4].collection?.requestedRowLimit, 50);
  assert.match(handoverHtml(run), /Requested row limit: 50/);
});
test('ordinary bounded observations retain the same request metadata and logs stay unchanged', async () => {
  const f = fixture();
  let run = await f.engine.create(actor, 'observe', '', '', {
    sources: ['processes', 'task-inventory', 'application-inventory', 'journal-inventory', 'logs'],
  });
  for (let i = 0; i < 5; i++) run = await f.engine.next(actor, run.id);
  for (const step of run.steps.slice(0, 4)) assert.equal(step.collection?.requestedRowLimit, 100);
  assert.equal(run.steps[4].collection, undefined);
  assert.equal(collectionLimitNotice(run.steps[4]), undefined);
  assert.equal(f.requests[4].searchParams.get('limit'), '100');
});
test('failed retry removes stale collection metadata; successful retry records current request', async () => {
  const f = fixture();
  let run = await f.engine.fromProcedure(actor, 'fixture-procedure', version(['tasks']));
  run.steps[0].status = 'failed';
  run.steps[0].collection = { requestedRowLimit: 17 };
  await f.store.save(run);
  f.fail(true);
  run = await f.engine.next(actor, run.id);
  assert.equal(run.steps[0].status, 'failed');
  assert.equal(run.steps[0].collection, undefined);
  assert.equal(collectionLimitNotice(run.steps[0]), undefined);
  f.fail(false);
  run = await f.engine.next(actor, run.id);
  assert.equal(run.steps[0].status, 'done');
  assert.equal(run.steps[0].collection?.requestedRowLimit, 100);
});
test('legacy runs remain readable without inferred limits and invalid recorded metadata is rejected', async () => {
  assert.equal(collectionLimitNotice(undefined), undefined);
  const f = fixture();
  let run = await f.engine.fromProcedure(actor, 'fixture-procedure', version(['tasks']));
  run = await f.engine.next(actor, run.id);
  delete run.steps[0].collection;
  const original = structuredClone(run);
  validateStoredRun(run);
  assert.deepEqual(run, original);
  assert.match(collectionLimitNotice(run.steps[0])!, /limit was not recorded/);
  assert.doesNotMatch(handoverHtml(run), /Requested row limit: 100/);
  for (const metadata of [
    null,
    {},
    { requestedRowLimit: 0 },
    { requestedRowLimit: '100' },
    { requestedRowLimit: 1.5 },
    { requestedRowLimit: 1001 },
    { requestedRowLimit: 100, complete: true },
  ]) {
    const invalid = structuredClone(run);
    (invalid.steps[0] as unknown as { collection: unknown }).collection = metadata;
    assert.throws(() => validateStoredRun(invalid));
  }
  for (const status of ['pending', 'running', 'failed', 'skipped'] as const) {
    run.steps[0].status = status;
    assert.equal(collectionLimitNotice(run.steps[0]), undefined);
  }
});
