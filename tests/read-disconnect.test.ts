import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import supertest from 'supertest';
import { createApp } from '../server/app';
import { IrisClient } from '../server/upstream';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function controlledRead(method: 'GET' | 'POST' = 'GET', honorAbort = true) {
  const started = deferred<AbortSignal>();
  const closed = deferred<void>();
  const response = deferred<Response>();
  let serverResponse: ServerResponse | undefined;
  const client = new IrisClient('http://fixture.invalid', async (_url, init) => {
    if (String(_url).endsWith('/api/admin/info')) {
      return Response.json({ result: { apiVersion: 2, username: 'Fixture' } });
    }
    const signal = init!.signal!;
    started.resolve(signal);
    return new Promise<Response>((resolve, reject) => {
      const abort = () => reject(new Error('Controlled fetch aborted.'));
      if (honorAbort) signal.addEventListener('abort', abort, { once: true });
      response.promise.then(resolve).finally(() => signal.removeEventListener('abort', abort));
    });
  });
  const app = createApp({ irisUrl: 'http://fixture.invalid', client });
  const server = createServer((req, res) => {
    if (req.url === '/api/iris') {
      serverResponse = res;
      res.once('close', () => closed.resolve());
    }
    app(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const login = await supertest(server)
    .post('/api/login')
    .send({ username: 'Fixture', password: 'synthetic' })
    .expect(200);
  const body = JSON.stringify({
    method,
    path: method === 'GET' ? '/v2/tasks' : '/v2/security/audit/records',
  });
  const request = httpRequest({
    host: '127.0.0.1',
    port: address.port,
    path: '/api/iris',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      Cookie: login.headers['set-cookie'][0].split(';')[0],
      'X-CSRF-Token': login.body.csrf,
    },
  });
  request.on('error', () => {});
  request.end(body);
  return {
    started,
    closed,
    request,
    response,
    serverResponse: () => serverResponse!,
    async activity() {
      const result = await supertest(server)
        .get('/api/activity')
        .set('Cookie', login.headers['set-cookie'][0].split(';')[0])
        .expect(200);
      return result.body as Array<{ method: string; path: string; status: number }>;
    },
    async cleanup() {
      response.resolve(Response.json({ result: [] }));
      request.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test(
  'disconnect after a complete read request aborts its single native fetch',
  { timeout: 3000 },
  async () => {
    const f = await controlledRead();
    try {
      const signal = await f.started.promise;
      assert.equal(signal.aborted, false);
      f.request.destroy();
      await f.closed.promise;
      assert.equal(signal.aborted, true);
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(f.serverResponse().listenerCount('close'), 0);
      assert.deepEqual(await f.activity(), []);
    } finally {
      await f.cleanup();
    }
  },
);

test(
  'normal native read completes without cancellation and cleans its close listener',
  { timeout: 3000 },
  async () => {
    const f = await controlledRead();
    try {
      const signal = await f.started.promise;
      const response = once(f.request, 'response');
      f.response.resolve(Response.json({ result: [{ Id: 7, Name: 'Synthetic' }] }));
      const [incoming] = await response;
      incoming.resume();
      await f.closed.promise;
      assert.equal(incoming.statusCode, 200);
      assert.equal(signal.aborted, false);
      assert.equal(f.serverResponse().listenerCount('close'), 0);
    } finally {
      await f.cleanup();
    }
  },
);

test('disconnect does not cancel the asynchronous audit POST', { timeout: 3000 }, async () => {
  const f = await controlledRead('POST');
  try {
    const signal = await f.started.promise;
    f.request.destroy();
    await f.closed.promise;
    assert.equal(signal.aborted, false);
    f.response.resolve(Response.json({ result: [] }));
    await new Promise<void>((resolve) => setImmediate(resolve));
    const activity = await f.activity();
    assert.equal(activity.length, 1);
    assert.equal(activity[0].method, 'POST');
    assert.equal(activity[0].path, '/v2/security/audit/records');
    assert.equal(activity[0].status, 200);
  } finally {
    await f.cleanup();
  }
});

test(
  'a GET transport that resolves after caller abort does not add success activity',
  { timeout: 3000 },
  async () => {
    const f = await controlledRead('GET', false);
    try {
      await f.started.promise;
      f.request.destroy();
      await f.closed.promise;
      f.response.resolve(Response.json({ result: [], console: ['Completed after caller left.'] }));
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepEqual(await f.activity(), []);
    } finally {
      await f.cleanup();
    }
  },
);

test(
  'a real failed GET remains in activity while its caller is connected',
  { timeout: 3000 },
  async () => {
    const f = await controlledRead();
    try {
      await f.started.promise;
      const response = once(f.request, 'response');
      f.response.resolve(Response.json({ error: 'Controlled native failure.' }, { status: 503 }));
      const [incoming] = await response;
      incoming.resume();
      await f.closed.promise;
      assert.equal(incoming.statusCode, 503);
      const activity = await f.activity();
      assert.equal(activity.length, 1);
      assert.equal(activity[0].method, 'GET');
      assert.equal(activity[0].status, 503);
    } finally {
      await f.cleanup();
    }
  },
);

test('an already abandoned read never dispatches and its abort reason is not exposed', async () => {
  const caller = new AbortController();
  caller.abort('private-reason');
  let calls = 0;
  const client = new IrisClient('http://fixture.invalid', async () => {
    calls++;
    return Response.json({ result: [] });
  });
  await assert.rejects(
    client.request('Basic synthetic', { method: 'GET', path: '/v2/tasks' }, caller.signal),
    (error: any) => {
      assert.equal(error.status, 502);
      assert.ok(!error.message.includes('private-reason'));
      return true;
    },
  );
  assert.equal(calls, 0);
});

test('the existing deadline still aborts a read when its caller remains connected', async (t) => {
  const deadline = new AbortController();
  const caller = new AbortController();
  t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    assert.equal(milliseconds, 20000);
    return deadline.signal;
  });
  const began = deferred<void>();
  const client = new IrisClient('http://fixture.invalid', async (_url, init) => {
    began.resolve();
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('Controlled deadline.')), {
        once: true,
      });
    });
  });
  const result = client.request(
    'Basic synthetic',
    { method: 'GET', path: '/v2/tasks' },
    caller.signal,
  );
  const rejected = assert.rejects(result, { status: 502 });
  await began.promise;
  deadline.abort();
  await rejected;
  assert.equal(caller.signal.aborted, false);
});

test('native writes ignore a caller cancellation signal and retain their own timeout', async () => {
  const caller = new AbortController();
  caller.abort();
  let calls = 0;
  const client = new IrisClient('http://fixture.invalid', async (_url, init) => {
    calls++;
    assert.equal(init!.signal!.aborted, false);
    return Response.json({ result: { accepted: true } });
  });
  const result = await client.request(
    'Basic synthetic',
    {
      method: 'POST',
      path: '/v2/task/run',
      query: { id: '7' },
      body: { RunNow: true },
    },
    caller.signal,
  );
  assert.equal(result.status, 200);
  assert.equal(calls, 1);
});
