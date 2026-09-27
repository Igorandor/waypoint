import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Runbooks } from '../../src/pages/Runbooks';
import { ReviewedAction } from '../../src/commands/ReviewedAction';
import { summarize, templates } from '../../shared/runbook';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window);
const results = [],
  requests = [];
let generation = 0,
  fault = 'network',
  detailStatus = 200,
  listStatus = 200,
  writes = 0,
  receiptUnavailable = false;
const at = '2026-09-27T12:00:00.000Z';
function makeRun(id) {
  return {
    version: 1,
    id,
    owner: 'Fixture',
    instance: 'synthetic',
    template: 'task-window',
    title: `Run ${id}`,
    target: id === 'run-a' ? '7' : '8',
    createdAt: at,
    updatedAt: at,
    status: 'active',
    needsRestore: false,
    original: false,
    revision: 1,
    events: [],
    steps: templates['task-window'].steps.map((step, index) => ({
      ...step,
      status: index === 0 ? 'done' : 'pending',
      attempts: index === 0 ? 1 : 0,
    })),
  };
}
let records;
const reviewed = {
  format: 1,
  id: 'command-7',
  owner: 'Fixture',
  instance: 'synthetic',
  createdAt: at,
  updatedAt: at,
  expiresAt: '2026-09-28T12:00:00.000Z',
  status: 'reviewed',
  title: 'Synthetic command',
  target: '7',
  confirmation: '7',
  operation: { path: '/v2/task/suspend', method: 'POST', query: { id: '7' } },
  before: { Suspended: false },
  proposed: { Suspended: true },
  fields: ['Suspended'],
  writeOnlyFields: [],
  read: { path: '/v2/task/state', query: { id: '7' }, mode: 'task-state' },
  message: 'Synthetic review.',
  events: [],
};
window.fetch = async (url, init) => {
  requests.push({ url, method: init.method });
  if (url === '/api/runs')
    return listStatus === 200
      ? Response.json([...records.values()].map(summarize))
      : Response.json({ error: 'List unavailable' }, { status: listStatus });
  const match = /^\/api\/runs\/(run-[ab])(?:\/(next|notes))?$/.exec(url);
  if (match) {
    const [, id, action] = match;
    if (!action)
      return detailStatus === 200 || id === 'run-b'
        ? Response.json(records.get(id))
        : Response.json({ error: `Detail ${detailStatus}` }, { status: detailStatus });
    writes++;
    if ([403, 409].includes(fault))
      return Response.json({ error: `Explicit rejection ${fault}` }, { status: fault });
    const old = records.get(id);
    records.set(id, {
      ...old,
      revision: old.revision + 1,
      needsRestore: true,
      updatedAt: '2026-09-27T12:01:00.000Z',
      steps: old.steps.map((step, index) =>
        index === 1
          ? { ...step, status: 'done', attempts: 1, evidence: { Suspended: true } }
          : step,
      ),
    });
    if (fault === 'network') throw new TypeError('Failed to fetch');
    if (fault === 'unreadable') return new Response('not-json', { status: 200 });
    return Response.json({ error: 'Gateway lost the upstream result' }, { status: 502 });
  }
  if (url === '/api/commands/review') return Response.json(reviewed);
  if (url === '/api/commands/command-7/execute') {
    writes++;
    throw new TypeError('Failed to fetch');
  }
  if (url === '/api/commands/command-7') {
    if (receiptUnavailable) throw new TypeError('Receipt unavailable');
    return Response.json({
      ...reviewed,
      status: 'uncertain',
      message: 'Synthetic journal requires readback.',
    });
  }
  throw new Error(`Unexpected synthetic request ${init.method} ${url}`);
};
const root = createRoot(document.getElementById('probe'));
const content = () => document.getElementById('probe').textContent;
const check = (name, pass) => results.push({ name, pass: !!pass });
function button(label) {
  return [...document.querySelectorAll('#probe button')].find(
    (node) => node.textContent.trim() === label,
  );
}
async function click(label) {
  const node = button(label);
  if (!node || node.disabled) throw new Error(`Missing or disabled button: ${label}`);
  await act(async () => node.click());
}
async function settle(ready, label) {
  for (let n = 0; n < 100; n++) {
    if (ready()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  throw new Error(`Bounded settle failed: ${label}`);
}
async function setValue(node, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value',
    ).set.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function mount() {
  records = new Map(['run-a', 'run-b'].map((id) => [id, makeRun(id)]));
  detailStatus = 200;
  listStatus = 200;
  writes = 0;
  fault = 'network';
  await act(async () => root.render(<Runbooks key={++generation} />));
  await settle(
    () => !!button('Suspend future scheduling') && !button('Refresh runs').disabled,
    'initial run',
  );
}
async function lose() {
  await click('Suspend future scheduling');
  await settle(() => !button('Refresh runs').disabled, 'dispatch recovery completed');
}
async function select(id) {
  const node = [...document.querySelectorAll('.run-options button')].find((item) =>
    item.textContent.includes(`Run ${id}`),
  );
  await act(async () => node.click());
  await settle(() => !button('Refresh runs').disabled, 'selected run read');
}
async function commandCase(unavailable) {
  receiptUnavailable = unavailable;
  await act(async () =>
    root.render(
      <ReviewedAction
        key={++generation}
        candidate={reviewed.operation}
        title="Synthetic command"
        onClose={() => {}}
      />,
    ),
  );
  await click('Prepare review');
  await settle(() => !!document.querySelector('#probe form input'), 'prepared');
  await setValue(document.querySelector('#probe form input'), '7');
  await click('Execute once');
  await settle(() => !button('Close').disabled, 'receipt recovery finished');
  check(
    `command response loss with ${unavailable ? 'unavailable' : 'uncertain'} receipt consumes execute and exposes recovery`,
    !button('Execute once') &&
      !!document.querySelector('a[href="#command-history"]') &&
      (unavailable
        ? content().includes('dispatch response was not obtained')
        : !!button('Read current result')),
  );
}
async function run() {
  await mount();
  await lose();
  check(
    'lost response reads current journal without repeating next',
    writes === 1 &&
      content().includes('Original state still needs restoration') &&
      content().includes('current run was read from the journal') &&
      !!button('Record note and continue'),
  );
  await mount();
  detailStatus = 500;
  const note = document.querySelector('.run-record-tools textarea');
  await setValue(note, 'Preserved operator draft');
  await lose();
  check(
    'failed recovery marks last-known report and blocks next',
    writes === 1 &&
      content().includes('last known report') &&
      button('Refresh run before continuing')?.disabled,
  );
  check(
    'unresolved draft is retained and note mutation is blocked',
    note.value === 'Preserved operator draft' && button('Append note').disabled,
  );
  check(
    'all three unresolved exports are disabled with explanation',
    button('Export report').disabled &&
      button('JSON package').disabled &&
      button('Printable report').disabled &&
      content().includes('Actions and exports are paused'),
  );
  await click('Refresh runs');
  await settle(() => !button('Refresh runs').disabled, 'list-only refresh');
  check(
    'successful list with failed detail does not release guard',
    button('Refresh run before continuing')?.disabled && writes === 1,
  );
  await select('run-b');
  check(
    'guard for run A does not block separately read run B',
    document.querySelector('.run-heading h2').textContent === 'Run run-b' &&
      !button('Suspend future scheduling').disabled &&
      !button('Export report').disabled,
  );
  await select('run-a');
  check(
    'failed selection of A retains allowed B without transferring A guard',
    document.querySelector('.run-heading h2').textContent === 'Run run-b' &&
      !button('Suspend future scheduling').disabled,
  );
  detailStatus = 200;
  await select('run-a');
  check(
    'successful detail read releases only recovered run guard',
    !content().includes('last known report') &&
      !button('Export report').disabled &&
      content().includes('Original state still needs restoration') &&
      writes === 1,
  );
  for (const kind of ['unreadable', 502]) {
    await mount();
    fault = kind;
    detailStatus = 500;
    await lose();
    check(
      `${kind} result loss is guarded after one recovery read`,
      button('Refresh run before continuing')?.disabled &&
        writes === 1 &&
        requests.at(-1).url === '/api/runs/run-a',
    );
  }
  for (const status of [403, 409]) {
    await mount();
    fault = status;
    const start = requests.length;
    await lose();
    check(
      `explicit ${status} rejection retains exact message and no ambiguous recovery`,
      content().includes(`Explicit rejection ${status}`) &&
        !content().includes('may have been applied') &&
        !button('Suspend future scheduling').disabled &&
        requests.length === start + 1,
    );
  }
  await mount();
  detailStatus = 403;
  await lose();
  check(
    'denied recovery clears matching protected run rather than reviving old closure',
    !document.querySelector('.run-detail') &&
      !content().includes('Run run-a') &&
      content().includes('No run selected') &&
      writes === 1,
  );
  await commandCase(false);
  await commandCase(true);
  await act(async () => root.render(null));
  return { results, requests, nativeCalls: 0, appliedWrites: 0 };
}
async function publish(report) {
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await reportFetch('/_test/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
}
run()
  .then(publish)
  .catch((error) =>
    publish({ error: error.stack, results, requests, nativeCalls: 0, appliedWrites: 0 }),
  );
