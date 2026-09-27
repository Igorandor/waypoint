import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import supertest from 'supertest';
import {
  procedureBodySchema,
  procedureImportSchema,
  evaluateAssertion,
  type ProcedureBody,
} from '../shared/procedure';
import { ProcedureStore } from '../server/procedure-store';
import { RunEngine } from '../server/run-engine';
import { RunStore } from '../server/run-store';
import { IrisClient } from '../server/upstream';
import { createApp } from '../server/app';

const body: ProcedureBody = {
  title: 'Before a release',
  description: 'Check the monitor and record approval.',
  expectedOutcome: 'A current monitor reading and an operator decision.',
  tags: ['release'],
  steps: [
    {
      id: 'health',
      kind: 'observation',
      title: 'Monitor',
      instruction: '',
      source: 'health',
      target: '',
    },
    {
      id: 'check',
      kind: 'assertion',
      title: 'Monitor is running',
      instruction: '',
      check: 'monitor-running',
      sourceStepId: 'health',
      expected: true,
    },
    {
      id: 'approval',
      kind: 'checklist',
      title: 'Readiness review',
      instruction: '',
      items: [{ id: 'reviewed', text: 'Review the result', required: true }],
      requireNote: true,
      reference: '',
    },
  ],
};
async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'waypoint-procedures-'));
  t.after(async () => {
    assert.ok(
      resolve(directory).startsWith(resolve(tmpdir()) + '\\waypoint-procedures-') ||
        resolve(directory).startsWith(resolve(tmpdir()) + '/waypoint-procedures-'),
    );
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, library: new ProcedureStore(directory, 'instance') };
}
test('procedure imports reject executable fields, unsafe links, forward assertions and duplicate IDs', () => {
  assert.equal(
    procedureImportSchema.safeParse({ format: 'waypoint-procedure-1', body }).success,
    true,
  );
  assert.equal(procedureBodySchema.safeParse({ ...body, command: 'run something' }).success, false);
  assert.equal(
    procedureBodySchema.safeParse({
      ...body,
      steps: [{ ...body.steps[0], source: 'http://example.com' }],
    }).success,
    false,
  );
  assert.equal(
    procedureBodySchema.safeParse({ ...body, steps: [body.steps[1], body.steps[0]] }).success,
    false,
  );
  assert.equal(
    procedureBodySchema.safeParse({ ...body, steps: [body.steps[0], body.steps[0]] }).success,
    false,
  );
  assert.equal(
    procedureBodySchema.safeParse({
      ...body,
      steps: [{ ...body.steps[2], reference: 'javascript:alert(1)' }],
    }).success,
    false,
  );
  assert.equal(
    procedureBodySchema.safeParse({
      ...body,
      steps: [{ ...body.steps[2], reference: 'https://user:secret@example.com/' }],
    }).success,
    false,
  );
});
test('saved procedure versions survive restart, reject stale revisions and remain owner scoped', async (t) => {
  const { directory, library } = await fixture(t);
  const first = await library.create('alice', body);
  await library.revise('alice', first.id, 1, { ...body, title: 'Revised' }, 'Clarify purpose');
  await assert.rejects(() => library.revise('alice', first.id, 1, body, 'Stale'), { status: 409 });
  const recovered = await new ProcedureStore(directory, 'instance').read('alice', first.id);
  assert.equal(recovered.versions.length, 2);
  assert.equal(recovered.versions[0].body.title, body.title);
  assert.equal(recovered.versions[1].body.title, 'Revised');
  await assert.rejects(() => library.read('bob', first.id), { status: 404 });
  await assert.rejects(
    () => new ProcedureStore(directory, 'another-instance').read('alice', first.id),
    { status: 404 },
  );
  await library.archive('alice', first.id, 2, true);
  await assert.rejects(() => library.revise('alice', first.id, 3, body, 'Archived'), {
    status: 409,
  });
});
test('a run keeps its chosen immutable version and records a durable required checklist', async (t) => {
  const { directory, library } = await fixture(t);
  const record = await library.create('alice', body);
  let writes = 0;
  const client = new IrisClient('http://iris', async (_url, options) => {
    if (options?.method !== 'GET') writes++;
    return Response.json({ result: { Status: { SystemMonitor: true } } });
  });
  const engine = new RunEngine(new RunStore(directory), client, 'instance');
  const actor = { owner: 'alice', auth: 'Basic test' };
  let run = await engine.fromProcedure(actor, record.id, record.versions[0]);
  await library.revise('alice', record.id, 1, { ...body, title: 'A later definition' }, 'Changed');
  run = await engine.next(actor, run.id);
  run = await engine.next(actor, run.id);
  assert.equal((run.steps[1].evidence as { outcome: string }).outcome, 'passed');
  await assert.rejects(() => engine.next(actor, run.id, 'Reviewed', []), { status: 400 });
  await assert.rejects(() => engine.next(actor, run.id, '', ['reviewed']), { status: 400 });
  run = await engine.next(actor, run.id, 'Ready for the release', ['reviewed']);
  assert.equal(run.status, 'completed');
  assert.equal(run.title, body.title);
  assert.equal(run.procedure?.version.number, 1);
  assert.deepEqual(run.steps[2].checklist?.completed, ['reviewed']);
  assert.equal(writes, 0);
  const recovered = await new RunEngine(new RunStore(directory), client, 'instance').get(
    actor,
    run.id,
  );
  assert.equal(recovered.steps[2].checklist?.note, 'Ready for the release');
});
test('assertions distinguish missing, false and successful observations', () => {
  const assertion = body.steps[1];
  assert.equal(assertion.kind, 'assertion');
  if (assertion.kind !== 'assertion') throw new Error('fixture');
  assert.equal(evaluateAssertion(assertion, undefined).outcome, 'unknown');
  assert.equal(evaluateAssertion(assertion, { status: 'done', evidence: {} }).outcome, 'unknown');
  assert.equal(
    evaluateAssertion(assertion, { status: 'done', evidence: { Status: { SystemMonitor: false } } })
      .outcome,
    'failed',
  );
  assert.equal(
    evaluateAssertion(assertion, { status: 'done', evidence: { Status: { SystemMonitor: true } } })
      .outcome,
    'passed',
  );
});
test('procedure routes revalidate native privileges and run reports revalidate source-specific privileges', async (t) => {
  const { directory } = await fixture(t);
  let operate = true,
    secure = true;
  const client = new IrisClient('http://iris', async (url) =>
    Response.json({
      result: String(url).endsWith('/info')
        ? {
            apiVersion: 2,
            username: 'alice',
            privileges: { Operate: { use: operate }, Secure: { use: secure } },
          }
        : { Enabled: true },
    }),
  );
  const engine = new RunEngine(new RunStore(directory), client, 'instance');
  const agent = supertest.agent(createApp({ irisUrl: 'http://iris', runEngine: engine, client }));
  const login = await agent
    .post('/api/login')
    .send({ username: 'alice', password: 'test' })
    .expect(200);
  const record = await agent
    .post('/api/procedures')
    .set('X-CSRF-Token', login.body.csrf)
    .send(body)
    .expect(201);
  await agent.get('/api/procedures/' + record.body.id).expect(200);
  operate = false;
  await agent.get('/api/procedures').expect(403);
  operate = true;
  const actor = { owner: 'alice', auth: 'Basic test' };
  const run = await engine.create(actor, 'application-window', '/example', '/example');
  await engine.next(actor, run.id);
  secure = false;
  await agent.get('/api/runs/' + run.id).expect(403);
  await agent.get('/api/runs').expect(403);
});
