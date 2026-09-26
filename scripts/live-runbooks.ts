import 'dotenv/config';
import assert from 'node:assert/strict';
import { IrisClient, type Operation } from '../server/upstream';
import { taskDefaults } from '../shared/task-defaults';
import type { Run } from '../shared/runbook';
const username = process.env.IRIS_TEST_USER,
  password = process.env.IRIS_TEST_PASSWORD;
if (!username || !password)
  throw new Error('Set test credentials for a disposable IRIS installation.');
const base = process.env.PORTAL_URL ?? 'http://127.0.0.1:3301',
  origin = process.env.PORTAL_ORIGIN ?? 'http://localhost:3301';
const client = new IrisClient(process.env.IRIS_URL ?? 'http://127.0.0.1:52790'),
  auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
const login = await fetch(base + '/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ username, password }),
});
assert.equal(login.status, 200, await login.clone().text());
const session = await login.json(),
  cookie = login.headers.get('set-cookie')!.split(';')[0];
async function portal(path: string, body?: unknown) {
  const response = await fetch(base + '/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      Cookie: cookie,
      'X-CSRF-Token': session.csrf,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(response.ok, await response.clone().text());
  return response.json();
}
const native = async (
  path: string,
  method: Operation['method'] = 'GET',
  query: Record<string, string> = {},
  body?: Record<string, unknown>,
) => (await client.request(auth, { path, method, query, body })).data;
const suffix = Date.now().toString(36),
  app = '/relay-window-' + suffix,
  taskName = 'RelayWindow' + suffix;
const cleanup: Array<() => Promise<unknown>> = [];
let pending: Run | undefined;
try {
  let run: Run = await portal('runs', { template: 'observe', target: '', confirmation: '' });
  for (let i = 0; i < 4; i++) run = await portal('runs/' + run.id + '/next', {});
  assert.equal(run.status, 'completed');
  assert.ok(run.steps.every((s) => s.status === 'done'));
  console.log('PASS persisted observation run', run.id);
  await native(
    '/v2/web-app',
    'PUT',
    { name: app },
    {
      NameSpace: 'USER',
      Enabled: true,
      AutheEnabled: 32,
      DispatchClass: 'Relay.Rest',
      Description: 'Disposable runbook test',
    },
  );
  cleanup.push(() => native('/v2/web-app', 'DELETE', { name: app }));
  pending = await portal('runs', {
    template: 'application-window',
    target: app,
    confirmation: app,
  });
  pending = await portal('runs/' + pending!.id + '/next', {});
  pending = await portal('runs/' + pending!.id + '/next', {});
  assert.equal(pending!.steps[1].status, 'done', JSON.stringify(pending!.steps[1]));
  assert.equal((await native('/v2/web-app', 'GET', { name: app })).Enabled, false);
  pending = await portal('runs/' + pending!.id + '/next', {
    note: 'Verified the temporary application maintenance window.',
  });
  pending = await portal('runs/' + pending!.id + '/next', {});
  assert.equal((await native('/v2/web-app', 'GET', { name: app })).Enabled, true);
  pending = await portal('runs/' + pending!.id + '/next', {});
  assert.equal(pending!.status, 'completed');
  assert.equal(pending!.needsRestore, false);
  console.log('PASS application disable, checkpoint, verified restoration and stored evidence');
  pending = undefined;
  await native(
    '/v2/task',
    'POST',
    {},
    {
      ...taskDefaults(username),
      Name: taskName,
      TaskClass: 'Relay.DemoTask',
      NameSpace: '%SYS',
      TimePeriod: 'Daily',
      TimePeriodEvery: '1',
    },
  );
  const task = String(
    (await native('/v2/tasks', 'GET', { filter: taskName })).find((t: any) => t.Name === taskName)
      .Id,
  );
  cleanup.push(() => native('/v2/task', 'DELETE', { id: task }));
  pending = await portal('runs', { template: 'task-window', target: task, confirmation: task });
  pending = await portal('runs/' + pending!.id + '/next', {});
  pending = await portal('runs/' + pending!.id + '/next', {});
  assert.equal(pending!.steps[1].status, 'done', JSON.stringify(pending!.steps[1]));
  assert.equal((await native('/v2/task/info', 'GET', { id: task })).Suspended, true);
  pending = await portal('runs/' + pending!.id + '/restore', { confirmation: task });
  assert.equal((await native('/v2/task/info', 'GET', { id: task })).Suspended, false);
  pending = await portal('runs/' + pending!.id + '/next', {});
  assert.equal(pending!.status, 'completed');
  assert.equal(pending!.steps[2].status, 'skipped');
  console.log('PASS task suspension, early restore and task-specific history');
  const stored = await portal('runs/' + pending!.id);
  assert.equal(stored.status, 'completed');
  const list = await portal('runs');
  assert.ok(list.some((r: any) => r.id === pending!.id));
  console.log('PASS durable run listing and reload', pending!.id);
  pending = undefined;
} finally {
  if (pending?.needsRestore)
    pending = await portal('runs/' + pending.id + '/restore', { confirmation: pending.target });
  if (pending?.status === 'active' && !pending.needsRestore)
    await portal('runs/' + pending.id + '/stop', {});
  for (const remove of cleanup.reverse()) await remove();
  await portal('logout', {});
}
