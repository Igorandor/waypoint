import React, { act, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useData } from '../../src/hooks';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window);
async function publish(report) {
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await reportFetch('/_test/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
}
// Deterministic foreground condition, not a test of browser visibility or wall-clock polling.
Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
const results = [];
const requests = [];
const snapshots = [];
const timers = new Map();
const timerEvents = [];
let timerId = 500000;
const originalTimeout = window.setTimeout.bind(window);
const originalClear = window.clearTimeout.bind(window);
window.setTimeout = (callback, delay, ...args) => {
  if (delay !== 60000) return originalTimeout(callback, delay, ...args);
  const id = ++timerId;
  timerEvents.push({ event: 'scheduled', id, delay });
  timers.set(id, callback);
  return id;
};
window.clearTimeout = (id) => {
  timerEvents.push({ event: 'cleared', id });
  return timers.delete(id) || originalClear(id);
};
let status = 200;
let held;
let release;
window.fetch = async (_url, init) => {
  const input = JSON.parse(init.body);
  requests.push(input);
  if (held) return held;
  return status === 200
    ? Response.json({
        data: { source: input.path, scope: input.query?.scope, protected: 'old evidence' },
        status: 200,
        console: [],
      })
    : Response.json({ error: `Controlled ${status}` }, { status });
};
let latest;
function Probe({ path, query, interval }) {
  latest = useData(path, query, interval);
  useLayoutEffect(() => {
    snapshots.push({
      path,
      query,
      data: latest.data,
      error: latest.error,
      loading: latest.loading,
      at: latest.at?.toISOString(),
    });
  });
  return <pre>{JSON.stringify({ path, query, ...latest }, null, 2)}</pre>;
}
const root = createRoot(document.getElementById('probe'));
const props = { path: '/source-a', query: { scope: 'a' }, interval: 0 };
const render = async () => act(async () => root.render(<Probe {...props} />));
async function settle(ready, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (ready()) return;
    await act(async () => new Promise((resolve) => originalTimeout(resolve, 10)));
  }
  throw new Error(`Bounded settle failed: ${label}`);
}
function check(name, condition, detail) {
  results.push({ name, pass: !!condition, detail });
}
async function reset(interval = 0) {
  await act(async () => root.render(null));
  status = 200;
  held = undefined;
  props.path = '/source-a';
  props.query = { scope: 'a' };
  props.interval = interval;
  await render();
  await settle(
    () => !!latest?.data && !latest.loading && (!interval || timers.size > 0),
    'successful reset',
  );
}
async function poll() {
  await settle(() => timers.size > 0, 'pending poll timer');
  const [id, callback] = [...timers][0];
  timers.delete(id);
  await act(async () => callback());
  await settle(() => !!latest.error && !latest.loading, 'failed poll completed');
}
async function run() {
  await reset();
  check('successful read has evidence and timestamp', !!latest.data && !!latest.at);
  status = 403;
  await act(async () => latest.refresh());
  await settle(() => !!latest.error && !latest.loading, 'manual403');
  check(
    'manual refresh403 clears evidence and timestamp',
    !latest.data && !latest.at && !!latest.error,
  );
  await reset();
  const beforeRefresh500 = { data: latest.data, at: latest.at };
  status = 500;
  await act(async () => latest.refresh());
  await settle(() => !!latest.error && !latest.loading, 'manual500');
  check(
    'manual refresh500 preserves same-source evidence and timestamp',
    latest.data === beforeRefresh500.data && latest.at === beforeRefresh500.at && !!latest.error,
  );

  await reset(60000);
  status = 403;
  await poll();
  check(
    'poll403 discards denied evidence and timestamp',
    !latest.data && !latest.at && !!latest.error,
  );
  await reset(60000);
  const before500 = { data: latest.data, at: latest.at };
  status = 500;
  await poll();
  check(
    'poll500 retains old evidence and timestamp',
    latest.data === before500.data && latest.at === before500.at && !!latest.error,
  );

  await reset();
  held = new Promise((resolve) => {
    release = resolve;
  });
  snapshots.length = 0;
  props.query = { scope: 'b' };
  await render();
  check(
    'query change clears settled hook state while pending',
    !latest.data && !latest.at && latest.loading,
  );
  check(
    'query change never commits old evidence under new scope',
    !snapshots.some((s) => s.query.scope === 'b' && s.data?.scope === 'a'),
    [...snapshots],
  );
  props.path = '';
  snapshots.length = 0;
  await render();
  release(Response.json({ data: { protected: 'late old response' }, status: 200, console: [] }));
  await act(async () => {});
  check(
    'disabled path rejects late prior request and remains empty',
    !latest.data && !latest.at && !latest.loading,
  );

  await reset();
  held = new Promise((resolve) => {
    release = resolve;
  });
  snapshots.length = 0;
  props.path = '/source-b';
  await render();
  check(
    'path change has no old data or timestamp in any committed render',
    snapshots.every((s) => !s.data && !s.at),
    [...snapshots],
  );
  release(
    Response.json({
      data: { source: '/source-b', scope: 'a', protected: 'new evidence' },
      status: 200,
      console: [],
    }),
  );
  held = undefined;
  await settle(() => latest.data?.source === '/source-b' && !latest.loading, 'new path completed');
  check(
    'new path accepts its own evidence and collection timestamp',
    latest.data?.protected === 'new evidence' && !!latest.at,
  );

  await reset();
  snapshots.length = 0;
  const countBeforeDisabled = requests.length;
  props.path = '';
  await render();
  check(
    'disabled path never commits old evidence',
    !snapshots.some((s) => s.path === '' && s.data),
    [...snapshots],
  );
  check('disabled path issues no request', requests.length === countBeforeDisabled);
  await act(async () => root.render(null));
  await publish({
    results,
    requests,
    simulatedForeground: true,
    controlledPollTimers: true,
    nativeCalls: 0,
    appliedWrites: 0,
  });
}
run().catch(async (error) => {
  await publish({ error: error.stack, results, requests, snapshots, timerEvents, latest });
});
