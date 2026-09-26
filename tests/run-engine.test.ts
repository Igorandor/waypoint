import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { RunStore } from '../server/run-store';
import { RunEngine } from '../server/run-engine';
import { IrisClient } from '../server/upstream';
const actor = { owner: 'operator', auth: 'Basic test' };
async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'relay-tests-'));
  t.after(async () => {
    assert.ok(
      resolve(directory).startsWith(resolve(tmpdir()) + '\\relay-tests-') ||
        resolve(directory).startsWith(resolve(tmpdir()) + '/relay-tests-'),
    );
    await rm(directory, { recursive: true, force: true });
  });
  const state = {
    enabled: true,
    suspended: false,
    writes: 0,
    reads: 0,
    failAfterWrite: false,
    slow: false,
  };
  const client = new IrisClient('http://iris', async (input, init) => {
    const url = new URL(String(input)),
      path = url.pathname;
    if (init?.method !== 'GET') {
      state.writes++;
      if (path.endsWith('/web-app')) state.enabled = JSON.parse(String(init?.body)).Enabled;
      if (path.endsWith('/suspend')) state.suspended = true;
      if (path.endsWith('/resume')) state.suspended = false;
      if (state.failAfterWrite) throw new Error('Lost response after applying the change');
      return Response.json({ result: {} });
    }
    state.reads++;
    if (state.slow) await new Promise((r) => setTimeout(r, 25));
    if (path.endsWith('/web-app'))
      return Response.json({
        result: { Enabled: state.enabled, NameSpace: 'USER', DispatchClass: 'Example.Rest' },
      });
    if (path.endsWith('/task/info'))
      return Response.json({ result: { Suspended: state.suspended } });
    if (path.endsWith('/task'))
      return Response.json({ result: { Name: 'Test task', Namespace: 'USER' } });
    if (path.endsWith('/task/history')) {
      assert.equal(url.searchParams.get('taskId'), '3');
      return Response.json({ result: [] });
    }
    return Response.json({ result: { ok: true, Password: 'should-be-redacted' } });
  });
  const store = new RunStore(directory),
    engine = new RunEngine(store, client, 'test-instance');
  return { engine, store, client, state };
}
test('creating a plan never changes IRIS; management routes are protected', async (t) => {
  const { engine, state } = await fixture(t);
  await assert.rejects(
    () => engine.create(actor, 'application-window', '/api/admin', '/api/admin'),
    /non-management/,
  );
  await assert.rejects(
    () => engine.create(actor, 'application-window', '/sample', 'wrong'),
    /exact target/,
  );
  const run = await engine.create(actor, 'application-window', '/api/business', '/api/business');
  assert.equal(run.steps[0].status, 'pending');
  assert.equal(state.writes, 0);
  assert.equal(state.reads, 0);
});
test('application window verifies change, requires checkpoint and restores the original state', async (t) => {
  const { engine, state } = await fixture(t);
  let run = await engine.create(actor, 'application-window', '/sample', '/sample');
  run = await engine.next(actor, run.id);
  assert.equal(run.original, true);
  run = await engine.next(actor, run.id);
  assert.equal(state.enabled, false);
  assert.equal(run.needsRestore, true);
  await assert.rejects(() => engine.next(actor, run.id), /maintenance note/);
  await assert.rejects(() => engine.stop(actor, run.id), /Restore/);
  run = await engine.next(actor, run.id, 'Maintenance verified on the disposable app.');
  run = await engine.next(actor, run.id);
  assert.equal(state.enabled, true);
  assert.equal(run.needsRestore, false);
  run = await engine.next(actor, run.id);
  assert.equal(run.status, 'completed');
  assert.equal(state.writes, 2);
});
test('an originally disabled app is never accidentally enabled', async (t) => {
  const { engine, state } = await fixture(t);
  state.enabled = false;
  let run = await engine.create(actor, 'application-window', '/sample', '/sample');
  for (let i = 0; i < 5; i++) run = await engine.next(actor, run.id, 'No change needed.');
  assert.equal(run.status, 'completed');
  assert.equal(state.enabled, false);
  assert.equal(state.writes, 0);
});
test('changed precondition fails without issuing a write', async (t) => {
  const { engine, state } = await fixture(t);
  let run = await engine.create(actor, 'application-window', '/sample', '/sample');
  run = await engine.next(actor, run.id);
  state.enabled = false;
  run = await engine.next(actor, run.id);
  assert.equal(run.steps[1].status, 'failed');
  assert.equal(state.writes, 0);
  assert.match(run.steps[1].error!, /changed/);
});
test('lost write response becomes uncertain and is never automatically retried', async (t) => {
  const { engine, state } = await fixture(t);
  let run = await engine.create(actor, 'application-window', '/sample', '/sample');
  await engine.next(actor, run.id);
  state.failAfterWrite = true;
  run = await engine.next(actor, run.id);
  assert.equal(run.steps[1].status, 'uncertain');
  assert.equal(run.needsRestore, true);
  await assert.rejects(() => engine.next(actor, run.id), /Reconcile/);
  assert.equal(state.writes, 1);
  state.failAfterWrite = false;
  run = await engine.reconcile(actor, run.id);
  assert.equal(run.steps[1].status, 'done');
  assert.equal(state.writes, 1);
  run = await engine.restore(actor, run.id, '/sample');
  assert.equal(state.enabled, true);
  assert.equal(run.steps[2].status, 'skipped');
  assert.equal(run.needsRestore, false);
});
test('restart recovers a persisted running step as uncertain without replay', async (t) => {
  const { engine, store, client, state } = await fixture(t);
  const run = await engine.create(actor, 'application-window', '/sample', '/sample');
  let saved = await engine.next(actor, run.id);
  saved.steps[1].status = 'running';
  saved.needsRestore = true;
  await store.save(saved);
  state.enabled = false;
  const restarted = new RunEngine(store, client, 'test-instance');
  saved = await restarted.get(actor, run.id);
  assert.equal(saved.steps[1].status, 'uncertain');
  assert.equal(state.writes, 0);
  saved = await restarted.reconcile(actor, run.id);
  assert.equal(saved.steps[1].status, 'done');
  assert.equal(state.writes, 0);
});
test('run files are isolated by account and configured instance', async (t) => {
  const { engine, store } = await fixture(t);
  const run = await engine.create(actor, 'observe', '', '');
  await assert.rejects(() => engine.get({ owner: 'another', auth: 'x' }, run.id), { status: 404 });
  await assert.rejects(() => store.read(actor.owner, 'another-instance', run.id), { status: 404 });
  await assert.rejects(() => engine.get(actor, '../../secrets'), { status: 400 });
  assert.equal((await store.list(actor.owner, 'test-instance')).length, 1);
});
test('task window preserves an initially suspended task', async (t) => {
  const { engine, state } = await fixture(t);
  state.suspended = true;
  let run = await engine.create(actor, 'task-window', '3', '3');
  for (let i = 0; i < 5; i++)
    run = await engine.next(actor, run.id, 'Task maintenance is complete.');
  assert.equal(run.status, 'completed');
  assert.equal(state.suspended, true);
  assert.equal(state.writes, 0);
});
test('concurrent step clicks cannot advance two operations', async (t) => {
  const { engine, state } = await fixture(t);
  state.slow = true;
  const run = await engine.create(actor, 'observe', '', '');
  const results = await Promise.allSettled([
    engine.next(actor, run.id),
    engine.next(actor, run.id),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (await engine.get(actor, run.id)).steps.filter((s) => s.status === 'done').length,
    1,
  );
});
test('stopped runs keep evidence and cannot resume; stored evidence masks secrets', async (t) => {
  const { engine } = await fixture(t);
  let run = await engine.create(actor, 'observe', '', '');
  run = await engine.next(actor, run.id);
  run = await engine.next(actor, run.id);
  assert.doesNotMatch(JSON.stringify(run), /should-be-redacted/);
  run = await engine.stop(actor, run.id);
  assert.equal(run.status, 'stopped');
  assert.equal(run.steps[0].status, 'done');
  await assert.rejects(() => engine.next(actor, run.id), /closed/);
});
