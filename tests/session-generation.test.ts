import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { iris, request, RequestError } from '../src/api';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(t: TestContext) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const browser = Object.assign(new EventTarget(), {
    setTimeout: (callback: () => void) => {
      queueMicrotask(callback);
      return 1;
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: browser,
  });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const calls: Array<{ url: string; body: any; csrf: string | null }> = [];
  const state = {
    ended: 0,
    handler: undefined as undefined | ((url: string, body: any) => Promise<Response>),
  };
  browser.addEventListener('session-ended', () => state.ended++);
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body, csrf: new Headers(init.headers).get('X-CSRF-Token') });
    if (url === '/api/login')
      return Response.json({ info: { username: body.username }, csrf: `csrf-${body.username}` });
    if (url === '/api/logout') return Response.json({ ok: true });
    return state.handler ? state.handler(url, body) : Response.json({ ok: true });
  });
  const login = (username: string) => request('login', { username, password: 'synthetic' });
  return { browser, calls, state, login };
}
const earlierSession = (cause: unknown) =>
  cause instanceof RequestError && cause.status === 401 && /earlier session/i.test(cause.message);

test('duplicate initial session reads both succeed in either completion order', async (t) => {
  const { state } = fixture(t);
  for (const order of [
    [0, 1],
    [1, 0],
  ]) {
    const replies = [deferred<Response>(), deferred<Response>()];
    let index = 0;
    state.handler = () => replies[index++].promise;
    const requests = [request('session'), request('session')];
    for (const position of order) {
      replies[position].resolve(
        Response.json({ info: { username: 'Initial' }, csrf: 'csrf-Initial' }),
      );
      assert.equal((await requests[position]).info.username, 'Initial');
    }
    assert.equal(state.ended, 0);
  }
});

test('late successful and unauthorized reads from the previous login are discarded without ending the new session', async (t) => {
  const { state, login, calls } = fixture(t);
  for (const status of [200, 401]) {
    await login('A');
    const held = deferred<Response>();
    state.handler = () => held.promise;
    const pending = request('runs');
    const rejected = assert.rejects(pending, earlierSession);
    await request('logout', {});
    await login('B');
    held.resolve(
      Response.json(
        status === 200 ? { owner: 'A', protected: 'A-only' } : { error: 'Old unauthorized read' },
        { status },
      ),
    );
    await rejected;
    assert.equal(state.ended, 0);
    state.handler = undefined;
    await request('iris', { path: '/info', method: 'GET' });
    assert.equal(calls.at(-1)?.csrf, 'csrf-B');
  }
});

test('a session body decoded after a new login cannot replace the current CSRF token', async (t) => {
  const { state, login, calls } = fixture(t);
  await login('A');
  const body = deferred<unknown>();
  const decoding = deferred<void>();
  const response = Response.json({});
  Object.defineProperty(response, 'json', {
    value: () => {
      decoding.resolve();
      return body.promise;
    },
  });
  state.handler = async () => response;
  const pending = request('session');
  const rejected = assert.rejects(pending, earlierSession);
  await decoding.promise;
  await request('logout', {});
  await login('B');
  body.resolve({ info: { username: 'A' }, csrf: 'csrf-A' });
  await rejected;
  state.handler = undefined;
  await request('iris', { path: '/info', method: 'GET' });
  assert.equal(calls.at(-1)?.csrf, 'csrf-B');
  assert.equal(state.ended, 0);
});

test('current unauthorized reads end the session once and invalidate their pending peers', async (t) => {
  const { state, login, calls } = fixture(t);
  await login('A');
  const held = deferred<Response>();
  state.handler = (url) =>
    url === '/api/runs'
      ? held.promise
      : Promise.resolve(Response.json({ error: 'Current session expired' }, { status: 401 }));
  const pending = request('runs');
  const rejected = assert.rejects(pending, earlierSession);
  await assert.rejects(request('commands'), { status: 401, message: 'Current session expired' });
  assert.equal(state.ended, 1);
  held.resolve(Response.json({ error: 'Another old read' }, { status: 401 }));
  await rejected;
  assert.equal(state.ended, 1);
  state.handler = undefined;
  await request('iris', { path: '/info', method: 'GET' });
  assert.equal(calls.at(-1)?.csrf, '');
});

test('logout alone invalidates pending data and preserves the logout request token', async (t) => {
  const { state, login, calls } = fixture(t);
  await login('A');
  const held = deferred<Response>();
  state.handler = () => held.promise;
  const pending = request('runs');
  const rejected = assert.rejects(pending, earlierSession);
  await request('logout', {});
  assert.equal(calls.at(-1)?.csrf, 'csrf-A');
  held.resolve(Response.json({ owner: 'A' }));
  await rejected;
  assert.equal(state.ended, 0);
});

test('a current 401 with an unreadable body still ends the UI session', async (t) => {
  const { state, login } = fixture(t);
  await login('A');
  state.handler = async () => new Response('<html>Unauthorized</html>', { status: 401 });
  await assert.rejects(request('runs'), { status: 401 });
  assert.equal(state.ended, 1);
});

test('successful logout invalidates reads started while the logout response was pending', async (t) => {
  const { state, login } = fixture(t);
  await login('A');
  const logoutResponse = deferred<Response>();
  const readResponse = deferred<Response>();
  t.mock.method(globalThis, 'fetch', (url: string) =>
    url === '/api/logout' ? logoutResponse.promise : readResponse.promise,
  );
  const logout = request('logout', {});
  const lateRead = request('runs');
  const rejected = assert.rejects(lateRead, earlierSession);
  logoutResponse.resolve(Response.json({ ok: true }));
  await logout;
  readResponse.resolve(Response.json({ owner: 'A', protected: 'pending logout evidence' }));
  await rejected;
  assert.equal(state.ended, 0);
});

test('successful login invalidates reads started before its new session was established', async (t) => {
  const { state, login } = fixture(t);
  await login('A');
  const loginResponse = deferred<Response>();
  const readResponse = deferred<Response>();
  t.mock.method(globalThis, 'fetch', (url: string) =>
    url === '/api/login' ? loginResponse.promise : readResponse.promise,
  );
  const signingIn = login('B');
  const oldIdentityRead = request('runs');
  const rejected = assert.rejects(oldIdentityRead, earlierSession);
  loginResponse.resolve(Response.json({ info: { username: 'B' }, csrf: 'csrf-B' }));
  await signingIn;
  readResponse.resolve(Response.json({ owner: 'A' }));
  await rejected;
  assert.equal(state.ended, 0);
});

test('an async observation cannot poll its old job using the next login session', async (t) => {
  const { state, login, calls, browser } = fixture(t);
  await login('A');
  const timerStarted = deferred<void>();
  let releaseTimer!: () => void;
  browser.setTimeout = (callback) => {
    releaseTimer = callback;
    timerStarted.resolve();
    return 1;
  };
  state.handler = async (_url, body) =>
    Response.json(
      body.path === '/v2/async-result'
        ? { data: { State: 'Finished', Result: { owner: 'A' } }, status: 200, console: [] }
        : { asyncId: 'A-job', data: {}, status: 202, console: [] },
    );
  const pending = iris('/v2/task/history', { taskId: '7' });
  const rejected = assert.rejects(pending, earlierSession);
  await timerStarted.promise;
  await request('logout', {});
  await login('B');
  releaseTimer();
  await rejected;
  assert.equal(calls.filter((call) => call.body?.path === '/v2/async-result').length, 0);
  assert.equal(state.ended, 0);
});

test('current-session async observations still poll and return their completed result', async (t) => {
  const { state, login, calls } = fixture(t);
  await login('Current');
  state.handler = async (_url, body) =>
    Response.json(
      body.path === '/v2/async-result'
        ? { data: { State: 'Finished', Result: { rows: ['current'] } }, status: 200, console: [] }
        : { asyncId: 'current-job', data: {}, status: 202, console: [] },
    );
  const result = await iris('/v2/task/history', { taskId: '7' });
  assert.deepEqual(result.data, { rows: ['current'] });
  const polls = calls.filter((call) => call.body?.path === '/v2/async-result');
  assert.equal(polls.length, 1);
  assert.equal(polls[0].csrf, 'csrf-Current');
  assert.equal(state.ended, 0);
});
