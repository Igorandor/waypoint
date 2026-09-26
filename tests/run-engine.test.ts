import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { RunStore } from '../server/run-store';
import { RunEngine } from '../server/run-engine';
import { IrisClient } from '../server/upstream';
import { createApp } from '../server/app';
import supertest from 'supertest';
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
  for (const target of [
    '/',
    '//',
    '///',
    '/api',
    '/API//',
    '/api/admin',
    '/API/ADMIN//',
    '/api/relay/',
    '/CSP/SYS//',
  ])
    await assert.rejects(
      () => engine.create(actor, 'application-window', target, target),
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

test('a run that changed nothing cannot overwrite a later administrator change', async (t) => {
  const { engine, state } = await fixture(t);
  state.enabled = false;
  let run = await engine.create(actor, 'application-window', '/sample', '/sample');
  run = await engine.next(actor, run.id);
  run = await engine.next(actor, run.id);
  assert.equal(run.needsRestore, false);
  state.enabled = true; // Another operator restored or enabled this route.
  run = await engine.next(actor, run.id, 'No configuration was changed by this run.');
  run = await engine.next(actor, run.id);
  assert.equal(state.enabled, true);
  assert.equal(state.writes, 0);
  assert.equal((run.steps[3].evidence as { observed: boolean }).observed, true);
});

test('different runs cannot concurrently claim the same target write', async (t) => {
  const { engine, state } = await fixture(t);
  const other = { owner: 'second-operator', auth: 'Basic second' };
  const first = await engine.create(actor, 'application-window', '/sample', '/sample');
  const second = await engine.create(other, 'application-window', '/sample', '/sample');
  await engine.next(actor, first.id);
  await engine.next(other, second.id);
  state.slow = true;
  const results = await Promise.allSettled([
    engine.next(actor, first.id),
    engine.next(other, second.id),
  ]);
  assert.equal(state.writes, 1);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
});

test('native-equivalent application names share the target operation lock', async (t) => {
  const { engine, state } = await fixture(t);
  const first = await engine.create(actor, 'application-window', '/sample', '/sample');
  const second = await engine.create(actor, 'application-window', '/SAMPLE//', '/SAMPLE//');
  await engine.next(actor, first.id);
  await engine.next(actor, second.id);
  state.slow = true;
  const results = await Promise.allSettled([
    engine.next(actor, first.id),
    engine.next(actor, second.id),
  ]);
  assert.equal(state.writes, 1);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
});

test('stored reports require current credentials and operating privileges', async (t) => {
  const { engine } = await fixture(t);
  const run = await engine.create(actor, 'observe', '', '');
  let enabled = true;
  let operate = true;
  let username = actor.owner;
  const client = new IrisClient('http://iris', async () =>
    enabled
      ? Response.json({
          result: { apiVersion: 2, username, privileges: { Operate: { use: operate } } },
        })
      : Response.json({ error: 'Account disabled' }, { status: 401 }),
  );
  const agent = supertest.agent(createApp({ irisUrl: 'http://iris', client, runEngine: engine }));
  const login = await agent
    .post('/api/login')
    .send({ username: actor.owner, password: 'test' })
    .expect(200);
  await agent.get('/api/runs/' + run.id).expect(200);
  operate = false;
  await agent.get('/api/runs/' + run.id).expect(403);
  await agent.get('/api/runs').expect(403);
  await agent
    .post('/api/runs/' + run.id + '/stop')
    .set('X-CSRF-Token', login.body.csrf)
    .send({})
    .expect(403);
  assert.equal((await engine.get(actor, run.id)).status, 'active');
  operate = true;
  username = 'another-account';
  await agent.get('/api/runs/' + run.id).expect(403);
  username = actor.owner;
  enabled = false;
  await agent.get('/api/runs/' + run.id).expect(401);
});

test('concurrent creates cannot exceed the per-account run quota', async (t) => {
  const { engine, store } = await fixture(t);
  const first = await engine.create(actor, 'observe', '', '');
  for (let i = 1; i < 99; i++) await store.save({ ...first, id: randomUUID() });
  const attempts = await Promise.allSettled([
    engine.create(actor, 'observe', '', ''),
    engine.create(actor, 'observe', '', ''),
  ]);
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await store.list(actor.owner, engine.instance)).length, 100);
  await assert.rejects(() => engine.create(actor, 'observe', '', ''), { status: 409 });
});

test('a record copied into another ownership context is rejected', async (t) => {
  const { engine, store } = await fixture(t);
  const run = await engine.create(actor, 'observe', '', '');
  const [directory] = await readdir(store.root);
  const path = join(store.root, directory, run.id + '.json');
  for (const replacement of [
    { ...run, owner: 'another-account' },
    { ...run, instance: 'another-instance' },
    { ...run, id: randomUUID() },
  ]) {
    await writeFile(path, JSON.stringify(replacement));
    await assert.rejects(() => engine.get(actor, run.id), { status: 500 });
  }
});

test('a previously stored plan cannot disable a protected application alias', async (t) => {
  const { engine, store, state } = await fixture(t);
  let run = await engine.create(actor, 'application-window', '/sample', '/sample');
  run = await engine.next(actor, run.id);
  run.target = '/API//'; // Represents a plan stored before canonical protection was introduced.
  await store.save(run);
  await assert.rejects(() => engine.next(actor, run.id), /non-management/);
  assert.equal(state.writes, 0);
});

test('secret masking cannot collapse distinct authenticated run owners', async (t) => {
  const { store } = await fixture(t);
  const client = new IrisClient('http://iris', async (_input, init) => {
    const auth = new Headers(init?.headers).get('Authorization')!;
    const username = Buffer.from(auth.slice(6), 'base64').toString('utf8').split(':')[0];
    return Response.json({
      result: { apiVersion: 2, username, privileges: { Operate: { use: true } } },
    });
  });
  const app = createApp({
    irisUrl: 'http://iris',
    client,
    runEngine: new RunEngine(store, client, 'test-instance'),
  });
  const first = supertest.agent(app);
  const second = supertest.agent(app);
  const login = await first
    .post('/api/login')
    .send({ username: 'ops_AreaRed1', password: 'AreaRed1' })
    .expect(200);
  await second
    .post('/api/login')
    .send({ username: 'ops_AreaBlue2', password: 'AreaBlue2' })
    .expect(200);
  const run = await first
    .post('/api/runs')
    .set('X-CSRF-Token', login.body.csrf)
    .send({ template: 'observe' })
    .expect(201);
  await second.get('/api/runs/' + run.body.id).expect(404);
  const own = await first.get('/api/runs/' + run.body.id).expect(200);
  assert.equal(own.body.owner, 'ops_AreaRed1');
});
