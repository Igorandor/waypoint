import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import supertest from 'supertest';
import { CommandJournal } from '../server/command-journal';
import { CommandService } from '../server/command-service';
import {
  TargetReservations,
  canonicalTarget,
  canonicalCommandIdentity,
} from '../server/target-reservations';
import { IrisClient } from '../server/upstream';
import { createApp } from '../server/app';
import type { Operation } from '../server/command-policy';

const actor = { owner: 'operator', auth: 'Basic fixture-auth' };
const change: Operation = {
  path: '/v2/web-app',
  method: 'PUT',
  query: { name: '/app' },
  body: { Enabled: false },
};
async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'waypoint-commands-'));
  t.after(async () => {
    assert.ok(
      resolve(directory).startsWith(resolve(tmpdir()) + '\\waypoint-commands-') ||
        resolve(directory).startsWith(resolve(tmpdir()) + '/waypoint-commands-'),
    );
    await rm(directory, { recursive: true, force: true });
  });
  const state = {
    object: { Enabled: true, Description: 'original' } as Record<string, any>,
    process: {
      Pid: 12,
      JobNumber: 40,
      StartTimeUTC: '2026-09-27T11:30:00Z',
      UserName: '',
      State: 'HANG',
      CanBeSuspended: true,
      CanBeTerminated: true,
    },
    writes: 0,
    lost: false,
    denyReadback: false,
    absent: false,
  };
  const client = new IrisClient('http://iris', async (url, options) => {
    const path = new URL(String(url)).pathname;
    if (options?.method === 'GET') {
      if (state.denyReadback && state.writes) return Response.json({}, { status: 403 });
      if (state.absent) return Response.json({}, { status: 404 });
      if (path.endsWith('/process')) return Response.json({ result: state.process });
      return Response.json({ result: state.object });
    }
    state.writes++;
    if (path.endsWith('/process/suspend')) state.process.State = 'SUSP';
    else if (path.endsWith('/process/resume')) state.process.State = 'HANG';
    else if (path.endsWith('/process/terminate') || options?.method === 'DELETE')
      state.absent = true;
    else if (options?.body) Object.assign(state.object, JSON.parse(String(options.body)));
    if (state.lost) throw new Error('lost response');
    return Response.json({ result: {} });
  });
  const journal = new CommandJournal(directory, 'fixture');
  const reservations = new TargetReservations(directory, 'fixture');
  return {
    directory,
    state,
    client,
    journal,
    reservations,
    service: new CommandService(journal, client, reservations),
  };
}
test('command review sends no write, changed unrelated fields survive and command IDs cannot replay', async (t) => {
  const { service, state } = await fixture(t);
  const review = await service.review(actor, change);
  assert.equal(state.writes, 0);
  state.object.Description = 'updated elsewhere';
  const result = await service.execute(actor, review.id, review.confirmation);
  assert.equal(result.status, 'verified');
  assert.equal(state.object.Description, 'updated elsewhere');
  await assert.rejects(() => service.execute(actor, review.id, review.confirmation), {
    status: 409,
  });
  assert.equal(state.writes, 1);
});
test('changed selected fields conflict before dispatch', async (t) => {
  const { service, state } = await fixture(t);
  const review = await service.review(actor, change);
  state.object.Enabled = false;
  assert.equal((await service.execute(actor, review.id, review.confirmation)).status, 'conflict');
  assert.equal(state.writes, 0);
});
test('lost responses remain uncertain and read-only reconciliation never repeats the mutation', async (t) => {
  const { service, state } = await fixture(t);
  const review = await service.review(actor, change);
  state.lost = true;
  assert.equal((await service.execute(actor, review.id, review.confirmation)).status, 'uncertain');
  assert.equal((await service.reconcile(actor, review.id)).status, 'verified');
  assert.equal(state.writes, 1);
});
test('denied readback cannot be mistaken for verified absence', async (t) => {
  const { service, state } = await fixture(t);
  const review = await service.review(actor, { ...change, method: 'DELETE', body: undefined });
  state.denyReadback = true;
  assert.equal((await service.execute(actor, review.id, review.confirmation)).status, 'uncertain');
  assert.equal(state.writes, 1);
});
test('process generation and capability are rechecked; native SUSP and HANG states are verified', async (t) => {
  const { service, state } = await fixture(t);
  const command: Operation = { path: '/v2/process/suspend', method: 'POST', query: { id: '12' } };
  const first = await service.review(actor, command);
  state.process.StartTimeUTC = '2026-09-27T11:31:00Z';
  assert.equal((await service.execute(actor, first.id, first.confirmation)).status, 'conflict');
  assert.equal(state.writes, 0);
  const current = await service.review(actor, command);
  assert.equal((await service.execute(actor, current.id, current.confirmation)).status, 'verified');
  const resume = await service.review(actor, { ...command, path: '/v2/process/resume' });
  assert.equal((await service.execute(actor, resume.id, resume.confirmation)).status, 'verified');
  assert.equal(state.writes, 2);
});
test('unknown process identity and selection from a reused PID are refused', async (t) => {
  const { service, state } = await fixture(t);
  const command: Operation = { path: '/v2/process/terminate', method: 'POST', query: { id: '12' } };
  await assert.rejects(
    () => service.review(actor, command, { pid: '12', job: '39', started: 'old', user: '' }),
    { status: 409 },
  );
  state.process.StartTimeUTC = '';
  await assert.rejects(() => service.review(actor, command), { status: 409 });
  assert.equal(state.writes, 0);
});
test('gateway restart expires prepared secret bodies and recovers dispatched commands without replay', async (t) => {
  const { service, journal, client, reservations, state } = await fixture(t);
  const prepared = await service.review(actor, change);
  const restarted = new CommandService(journal, client, reservations);
  assert.equal((await restarted.get(actor, prepared.id)).status, 'expired');
  await assert.rejects(() => restarted.execute(actor, prepared.id, prepared.confirmation), {
    status: 409,
  });
  const dispatched = await service.review(actor, change);
  await journal.save({ ...dispatched, status: 'dispatching' });
  assert.equal((await restarted.get(actor, dispatched.id)).status, 'uncertain');
  assert.equal(state.writes, 0);
});
test('write-only values never reach disk and a missing acknowledgement cannot be fabricated by reconciliation', async (t) => {
  const { service, journal, state, directory } = await fixture(t);
  const review = await service.review(actor, {
    path: '/v2/security/user/password',
    method: 'POST',
    query: { name: 'other' },
    body: { Password: 'private-command-value' },
  });
  state.lost = true;
  assert.equal((await service.execute(actor, review.id, review.confirmation)).status, 'uncertain');
  assert.equal((await service.reconcile(actor, review.id)).status, 'uncertain');
  const owners = await readdir(join(directory, 'commands'));
  const text = await readFile(join(directory, 'commands', owners[0], review.id + '.json'), 'utf8');
  assert.doesNotMatch(text, /private-command-value|fixture-auth/);
  await assert.rejects(() => journal.read('someone-else', review.id), { status: 404 });
});
test('raw gateway writes cannot bypass review, process checks or durable reservations', async (t) => {
  const { directory } = await fixture(t);
  let writes = 0;
  const client = new IrisClient('http://iris', async (_url, options) => {
    if (options?.method !== 'GET') writes++;
    return Response.json({
      result: { apiVersion: 2, username: 'operator', privileges: { Operate: { use: true } } },
    });
  });
  const agent = supertest.agent(
    createApp({ irisUrl: 'http://iris', dataDirectory: directory, client }),
  );
  const login = await agent
    .post('/api/login')
    .send({ username: 'operator', password: 'test' })
    .expect(200);
  await agent
    .post('/api/iris')
    .set('X-CSRF-Token', login.body.csrf)
    .send({ path: '/v2/process/terminate', method: 'POST', query: { id: '12' } })
    .expect(409);
  assert.equal(writes, 0);
});
test('Wallet privilege independently controls command review and stored receipt access after revocation', async (t) => {
  const { directory } = await fixture(t);
  let wallet = true,
    secure = false;
  const client = new IrisClient('http://iris', async (url) =>
    Response.json({
      result: String(url).endsWith('/info')
        ? {
            apiVersion: 2,
            username: 'operator',
            privileges: { Wallet: { use: wallet }, Secure: { use: secure } },
          }
        : { EditResource: '%Admin_Wallet:USE', UseResource: '%Admin_Wallet:USE' },
    }),
  );
  const agent = supertest.agent(
    createApp({ irisUrl: 'http://iris', dataDirectory: directory, client }),
  );
  const login = await agent
    .post('/api/login')
    .send({ username: 'operator', password: 'test' })
    .expect(200);
  const review = await agent
    .post('/api/commands/review')
    .set('X-CSRF-Token', login.body.csrf)
    .send({
      command: {
        path: '/v2/wallet/collection',
        method: 'PUT',
        query: { name: 'private-collection' },
        body: { EditResource: '%Admin_Wallet:USE' },
      },
    })
    .expect(201);
  await agent.get('/api/commands/' + review.body.id).expect(200);
  wallet = false;
  secure = true;
  await agent.get('/api/commands/' + review.body.id).expect(403);
  await agent
    .post('/api/commands/' + review.body.id + '/execute')
    .set('X-CSRF-Token', login.body.csrf)
    .send({ confirmation: review.body.confirmation })
    .expect(403);
  const list = await agent.get('/api/commands').expect(200);
  assert.equal(list.body.length, 0);
});
test('canonical locks close numeric and application aliases', () => {
  assert.equal(
    canonicalTarget({ kind: 'task', identity: '0001' }),
    canonicalTarget({ kind: 'task', identity: '1' }),
  );
  assert.equal(
    canonicalTarget({ kind: 'application', identity: '/APP/' }),
    canonicalTarget({ kind: 'application', identity: '/app' }),
  );
  assert.equal(
    canonicalCommandIdentity('/v2/process', { id: '0012' }),
    canonicalCommandIdentity('/v2/process', { id: '12' }),
  );
});
test('summary listing projects evidence away before accumulating records', async (t) => {
  const { service, journal } = await fixture(t);
  await service.review(actor, change);
  await service.review(actor, change);
  assert.equal(await journal.count(actor.owner), 2);
  const list = await journal.list(actor.owner);
  assert.equal(list.length, 2);
  assert.ok(
    list.every(
      (record) => !('before' in record) && !('proposed' in record) && !('observed' in record),
    ),
  );
});
test('status-normalizing GET holds the record lock before inspecting prepared state', async (t) => {
  const { service, journal, state } = await fixture(t);
  const review = await service.review(actor, change);
  const originalRead = journal.read.bind(journal);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let first = true;
  journal.read = async (owner, id) => {
    const record = await originalRead(owner, id);
    if (first) {
      first = false;
      entered();
      await gate;
    }
    return record;
  };
  const reading = service.get(actor, review.id);
  await started;
  try {
    await assert.rejects(() => service.execute(actor, review.id, review.confirmation), {
      status: 409,
    });
  } finally {
    release();
  }
  assert.equal((await reading).status, 'reviewed');
  assert.equal((await service.execute(actor, review.id, review.confirmation)).status, 'verified');
  assert.equal(state.writes, 1);
});
test('distinct command reviews cannot overlap writes to one native target and reconciliation cannot overwrite dispatch', async (t) => {
  const { journal, reservations } = await fixture(t);
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let description = 'before';
  let writes = 0;
  const client = new IrisClient('http://iris', async (_url, options) => {
    if (options?.method === 'GET') return Response.json({ result: { Description: description } });
    writes++;
    entered();
    await gate;
    description = 'after';
    return Response.json({ result: {} });
  });
  const service = new CommandService(journal, client, reservations);
  const command: Operation = {
    path: '/v2/security/role',
    method: 'PUT',
    query: { name: 'custom-role' },
    body: { Description: 'after' },
  };
  const first = await service.review(actor, command);
  const second = await service.review(actor, command);
  const running = service.execute(actor, first.id, first.confirmation);
  await started;
  try {
    assert.equal((await service.get(actor, first.id)).status, 'dispatching');
    await assert.rejects(() => service.reconcile(actor, first.id), { status: 409 });
    await assert.rejects(() => service.execute(actor, second.id, second.confirmation), {
      status: 409,
    });
    assert.equal((await journal.read(actor.owner, first.id)).status, 'dispatching');
  } finally {
    release();
  }
  assert.equal((await running).status, 'verified');
  assert.equal((await service.execute(actor, second.id, second.confirmation)).status, 'conflict');
  assert.equal(writes, 1);
});
