import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import supertest from 'supertest';
import { createApp } from '../server/app';
import { IrisClient } from '../server/upstream';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'waypoint-login-replacement-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.includes('waypoint-login-replacement-'));
    await rm(directory, { recursive: true, force: true });
  });
  let time = 0;
  let held: { entered: () => void; released: Promise<void> } | undefined;
  const client = new IrisClient('http://synthetic.invalid', async (url, options) => {
    assert.ok(String(url).endsWith('/info'));
    assert.equal(options?.method, 'GET');
    const auth = new Headers(options?.headers).get('Authorization')!;
    const [username, password] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
    const waiting = held;
    held = undefined;
    if (waiting) {
      waiting.entered();
      await waiting.released;
    }
    if (password === 'wrong') return Response.json({}, { status: 401 });
    return Response.json({ result: { apiVersion: 2, username, privileges: {} } });
  });
  const app = createApp({
    irisUrl: 'http://synthetic.invalid',
    dataDirectory: directory,
    client,
    now: () => time,
  });
  const login = (cookie = '', username = 'operator', password = 'fixture') =>
    supertest(app).post('/api/login').set('Cookie', cookie).send({ username, password });
  const session = (cookie: string) => supertest(app).get('/api/session').set('Cookie', cookie);
  const hold = () => {
    let entered!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    held = { entered, released };
    t.after(release);
    return { reached, release };
  };
  return {
    app,
    login,
    session,
    hold,
    advance: (amount: number) => {
      time += amount;
    },
  };
}
function cookie(response: { headers: Record<string, any> }) {
  return response.headers['set-cookie'][0].split(';')[0] as string;
}

test('acknowledged logout prevents a pending replacement login from restoring a session', async (t) => {
  const f = await fixture(t);
  const initial = await f.login().expect(200);
  const previous = cookie(initial);
  const held = f.hold();
  const pending = f.login(previous).then((value) => value);
  await held.reached;
  await supertest(f.app)
    .post('/api/logout')
    .set('Cookie', previous)
    .set('X-CSRF-Token', initial.body.csrf)
    .send({})
    .expect(200);
  held.release();
  const late = await pending;
  assert.equal(late.status, 409);
  assert.equal(late.headers['set-cookie'], undefined);
  assert.match(late.body.error, /session changed/i);
  await f.session(previous).expect(401);
});

test('a late replacement cannot overwrite the session already established by another login', async (t) => {
  const f = await fixture(t);
  const previous = cookie(await f.login().expect(200));
  const held = f.hold();
  const pending = f.login(previous, 'slow-account').then((value) => value);
  await held.reached;
  const winner = await f.login(previous, 'chosen-account').expect(200);
  held.release();
  const late = await pending;
  assert.equal(late.status, 409);
  assert.equal(late.headers['set-cookie'], undefined);
  const current = await f.session(cookie(winner)).expect(200);
  assert.equal(current.body.info.username, 'chosen-account');
  await f.session(previous).expect(401);
});

test('failed authentication leaves the existing session and its CSRF token intact', async (t) => {
  const f = await fixture(t);
  const initial = await f.login().expect(200);
  const failed = await f.login(cookie(initial), 'operator', 'wrong').expect(401);
  assert.equal(failed.headers['set-cookie'], undefined);
  const current = await f.session(cookie(initial)).expect(200);
  assert.equal(current.body.csrf, initial.body.csrf);
});

test('a cookie already revoked or expired before login does not prevent fresh authentication', async (t) => {
  const f = await fixture(t);
  const initial = await f.login().expect(200);
  await supertest(f.app)
    .post('/api/logout')
    .set('Cookie', cookie(initial))
    .set('X-CSRF-Token', initial.body.csrf)
    .send({})
    .expect(200);
  const fresh = await f.login(cookie(initial)).expect(200);
  await f.session(cookie(fresh)).expect(200);
  f.advance(30 * 60_000 + 1);
  const renewed = await f.login(cookie(fresh)).expect(200);
  await f.session(cookie(renewed)).expect(200);
});

test('idle expiry while authentication is pending rejects the late session replacement', async (t) => {
  const f = await fixture(t);
  const previous = cookie(await f.login().expect(200));
  const held = f.hold();
  const pending = f.login(previous).then((value) => value);
  await held.reached;
  f.advance(30 * 60_000 + 1);
  held.release();
  const late = await pending;
  assert.equal(late.status, 409);
  assert.equal(late.headers['set-cookie'], undefined);
  await f.session(previous).expect(401);
});

test('absolute expiry during pending authentication wins even with recent session activity', async (t) => {
  const f = await fixture(t);
  const previous = cookie(await f.login().expect(200));
  for (let minutes = 25; minutes <= 475; minutes += 25) {
    f.advance(25 * 60_000);
    await f.session(previous).expect(200);
  }
  const held = f.hold();
  const pending = f.login(previous).then((value) => value);
  await held.reached;
  f.advance(6 * 60_000);
  held.release();
  const late = await pending;
  assert.equal(late.status, 409);
  assert.equal(late.headers['set-cookie'], undefined);
  await f.session(previous).expect(401);
});
