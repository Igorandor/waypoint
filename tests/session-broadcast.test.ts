import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import type * as Client from '../src/api';

const source = await readFile(new URL('../src/api.ts', import.meta.url), 'utf8');
const code = (await transform(source, { loader: 'ts', format: 'cjs', target: 'es2022' })).code;

function browsers() {
  const sent: unknown[] = [];
  const channels: Channel[] = [];
  class Channel {
    onmessage?: (event: { data: unknown }) => void;
    constructor(readonly name: string) {
      channels.push(this);
    }
    postMessage(data: unknown) {
      sent.push(data);
      for (const peer of channels) {
        if (peer !== this && peer.name === this.name)
          queueMicrotask(() => peer.onmessage?.({ data }));
      }
    }
  }
  function tab() {
    const window = Object.assign(new EventTarget(), { BroadcastChannel: Channel, setTimeout });
    const state = {
      ended: 0,
      reject: false,
      held: undefined as undefined | Promise<Response>,
      tokens: [] as string[],
    };
    window.addEventListener('session-ended', () => state.ended++);
    const module = { exports: {} };
    const fetch = async (url: string, init: RequestInit) => {
      state.tokens.push(new Headers(init.headers).get('X-CSRF-Token') ?? '');
      if (url === '/api/session') return Response.json({ info: { username: 'A' }, csrf: 'csrf-A' });
      if (url === '/api/login') {
        const username = JSON.parse(String(init.body)).username;
        return Response.json({ info: { username }, csrf: `csrf-${username}` });
      }
      if (url === '/api/logout') return Response.json({ ok: true });
      if (state.held) return state.held;
      return state.reject
        ? Response.json({ error: 'Expired' }, { status: 401 })
        : Response.json({ ok: true });
    };
    // Separate module/global scopes represent two tabs running the actual client source.
    runInNewContext(code, { module, exports: module.exports, window, Event, fetch });
    return { api: module.exports as typeof Client, state };
  }
  return { tab, sent, channels };
}

test('logout and a different login clear peer sessions without transmitting account data or rebroadcasting', async () => {
  const { tab, sent } = browsers();
  const first = tab(),
    second = tab();
  await first.api.request('session');
  await second.api.request('session');
  let release!: (response: Response) => void;
  second.state.held = new Promise((resolve) => {
    release = resolve;
  });
  const pending = second.api.request('runs');
  const rejected = assert.rejects(pending, {
    status: 401,
    message: 'This request belongs to an earlier session. Its response was discarded.',
  });
  await first.api.request('logout', {});
  assert.equal(second.state.ended, 1);
  assert.equal(first.state.ended, 0);
  assert.deepEqual(sent, ['session-changed']);
  release(Response.json({ owner: 'A', protected: 'old evidence' }));
  await rejected;
  second.state.held = undefined;
  await second.api.request('iris', { path: '/info', method: 'GET' });
  assert.equal(second.state.tokens.at(-1), '');
  await second.api.request('login', { username: 'B', password: 'synthetic-password' });
  assert.equal(first.state.ended, 1);
  assert.equal(second.state.ended, 1, 'the sender does not receive its own boundary message');
  assert.deepEqual(sent, ['session-changed', 'session-changed']);
  await second.api.request('iris', { path: '/info', method: 'GET' });
  assert.equal(second.state.tokens.at(-1), 'csrf-B');
});

test('a current 401 invalidates peer tabs once and unrelated broadcast messages are ignored', async () => {
  const { tab, sent, channels } = browsers();
  const first = tab(),
    second = tab();
  await first.api.request('session');
  await second.api.request('session');
  channels[0].postMessage({ unexpected: true });
  await Promise.resolve();
  assert.equal(second.state.ended, 0);
  first.state.reject = true;
  await assert.rejects(first.api.request('runs'), { status: 401, message: 'Expired' });
  assert.equal(first.state.ended, 1);
  assert.equal(second.state.ended, 1);
  assert.equal(sent.filter((message) => message === 'session-changed').length, 1);
  await second.api.request('iris', { path: '/info', method: 'GET' });
  assert.equal(second.state.tokens.at(-1), '');
});
