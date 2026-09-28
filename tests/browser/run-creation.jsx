import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Runbooks } from '../../src/pages/Runbooks';
import { summarize } from '../../shared/runbook';
import { buildObservationPlan, defaultObservation } from '../../shared/observation-plan';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window),
  results = [],
  calls = [];
const at = '2026-09-28T12:00:00.000Z';
const previousId = '11111111-1111-4111-8111-111111111111';
let fault = 'transport',
  listStatus = 200,
  listEmpty = false,
  generation = 0,
  records,
  holdPost = false,
  holdList = false,
  release;
let ended = 0;
window.addEventListener('session-ended', () => ended++);
function make(id, title, sources = defaultObservation) {
  return {
    version: 1,
    id,
    revision: 1,
    owner: 'Fixture',
    instance: 'Synthetic instance',
    template: 'observe',
    title,
    target: 'Instance',
    createdAt: at,
    updatedAt: at,
    status: 'active',
    needsRestore: false,
    steps: buildObservationPlan(sources).map((step) => ({
      ...step,
      status: 'pending',
      attempts: 0,
    })),
    events: [],
  };
}
window.fetch = async (url, init = {}) => {
  const method = init.method ?? 'GET';
  calls.push({ url, method, body: init.body ? JSON.parse(init.body) : undefined });
  if (url === '/api/runs' && method === 'POST') {
    const input = JSON.parse(init.body),
      record = make(crypto.randomUUID(), input.observation.title, input.observation.sources);
    const accepted = ['transport', 'unreadable201', 503, 200].includes(fault);
    if (accepted) records.set(record.id, record);
    const respond = () => {
      if (fault === 'transport') throw new TypeError('Failed to fetch');
      if (fault === 'unreadable201') return new Response('truncated', { status: 201 });
      return Response.json(
        fault === 200 ? record : { error: 'Synthetic create refusal ' + fault },
        { status: fault === 200 ? 201 : fault },
      );
    };
    if (holdPost) {
      holdPost = false;
      return new Promise((resolve, reject) => {
        release = () => {
          try {
            resolve(respond());
          } catch (error) {
            reject(error);
          }
        };
      });
    }
    return respond();
  }
  if (url === '/api/runs' && method === 'GET') {
    const respond = () =>
      listStatus === 'unreadable200'
        ? new Response('truncated', { status: 200 })
        : Response.json(
            listStatus === 200
              ? listEmpty
                ? []
                : [...records.values()].map(summarize)
              : { error: 'Synthetic list ' + listStatus },
            { status: listStatus },
          );
    if (holdList) {
      holdList = false;
      return new Promise((resolve) => {
        release = () => resolve(respond());
      });
    }
    return respond();
  }
  if (method === 'GET' && records.has(url.slice('/api/runs/'.length)))
    return Response.json(records.get(url.slice('/api/runs/'.length)));
  throw Error('Unexpected fixture request ' + url);
};
const root = createRoot(document.getElementById('probe'));
const modal = () => document.querySelector('#probe dialog');
const button = (name, scope = document.getElementById('probe')) =>
  [...scope.querySelectorAll('button')].find((node) => node.textContent.trim() === name);
const title = () => modal()?.querySelector('input[maxlength="80"]');
const posts = () => calls.filter((call) => call.method === 'POST');
const check = (name, pass) => results.push({ name, pass: !!pass });
async function settle(condition) {
  for (let n = 0; n < 100; n++) {
    if (condition()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  throw Error('Creation fixture did not settle.');
}
async function click(node) {
  if (!node) throw Error('Missing control.');
  await act(async () => node.click());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
}
async function fill(node, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      'value',
    ).set.call(node, value);
    node.dispatchEvent(
      new Event(node instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
    );
  });
}
async function open() {
  await click(button('New run'));
  await click(
    [...modal().querySelectorAll('button')].find(
      (node) => node.querySelector('h3')?.textContent === 'Observe an instance',
    ),
  );
  await settle(() => !!title());
  await fill(title(), 'Check before maintenance');
}
async function reset(next = 'transport') {
  fault = next;
  listStatus = 200;
  listEmpty = false;
  holdPost = false;
  holdList = false;
  release = undefined;
  ended = 0;
  calls.length = 0;
  records = new Map([[previousId, make(previousId, 'Previously selected run')]]);
  await act(async () => root.render(<Runbooks key={++generation} />));
  await settle(() => !!document.querySelector('.run-detail') && !button('Refresh runs').disabled);
  await open();
}
async function fail() {
  await click(button('Create run', modal()));
  await settle(() => !!button('Check saved runs', modal()));
}
async function suite() {
  for (const kind of ['transport', 'unreadable201', 503]) {
    await reset(kind);
    await fail();
    const before = calls.length;
    await click(button('Create run', modal()));
    check(
      `${kind} creation uncertainty retains draft, blocks retry and never reads/replays automatically`,
      posts().length === 1 &&
        records.size === 2 &&
        calls.length === before &&
        title().value === 'Check before maintenance' &&
        button('Create run', modal()).disabled &&
        modal().textContent.includes('plan may have been saved') &&
        modal().textContent.includes('executes no run steps'),
    );
  }

  await reset();
  await fail();
  const recoveryFocused = document.activeElement === button('Check saved runs', modal());
  title().focus();
  await fill(title(), 'Retained title while investigating');
  check(
    'Uncertain creation focuses recovery once without stealing focus from subsequent editing',
    recoveryFocused && document.activeElement === title(),
  );

  await reset();
  holdPost = true;
  await click(button('Create run', modal()));
  await settle(() => !!release);
  const pendingModal = modal();
  await click(button('Saving plan…', modal()));
  await click(button('Cancel', modal()));
  await act(async () =>
    pendingModal.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })),
  );
  const blocked =
    modal() === pendingModal && posts().length === 1 && modal().querySelector('fieldset').disabled;
  await act(async () => release());
  await settle(() => !!button('Check saved runs', modal()));
  check(
    'Pending creation blocks duplicate request, dismissal and field changes',
    blocked && title().value === 'Check before maintenance',
  );

  await reset();
  await click(button('Cancel', modal()));
  await fill(document.querySelector('input[aria-label="Find a run"]'), 'not-a-match');
  await fill(document.querySelector('select[aria-label="Run status filter"]'), 'closed');
  const dates = document.querySelectorAll('.runs-filters input[type="date"]');
  await fill(dates[0], '2020-01-01');
  await fill(dates[1], '2020-02-01');
  await click(document.querySelector('.runs-filters input[type="checkbox"]'));
  await open();
  await fail();
  const reads = calls.length;
  await click(button('Check saved runs', modal()));
  await settle(() => !modal());
  check(
    'Check saved runs reads only history, resets filters, reveals saved plan and does not select it',
    calls.length === reads + 1 &&
      calls.at(-1).url === '/api/runs' &&
      calls.at(-1).method === 'GET' &&
      posts().length === 1 &&
      document.querySelector('input[aria-label="Find a run"]').value === '' &&
      document.querySelector('select[aria-label="Run status filter"]').value === 'all' &&
      [...document.querySelectorAll('.runs-filters input[type="date"]')].every(
        (node) => !node.value,
      ) &&
      !document.querySelector('.runs-filters input[type="checkbox"]').checked &&
      document.querySelector('.run-options').textContent.includes('Check before maintenance') &&
      document.querySelector('.run-detail').textContent.includes('Previously selected run'),
  );

  await reset();
  await fail();
  listStatus = 503;
  holdList = true;
  release = undefined;
  await click(button('Check saved runs', modal()));
  await settle(() => !!release);
  const count = calls.length,
    current = modal();
  await click(button('Reading runs…', modal()));
  await click(button('Create run', modal()));
  await act(async () =>
    current.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })),
  );
  const held = calls.length === count && modal() === current;
  current.querySelector('[aria-label="Close dialog"]').focus();
  await act(async () => release());
  await settle(() => !!button('Check saved runs', modal()));
  check(
    'Failed explicit history read returns keyboard focus to recovery',
    document.activeElement === button('Check saved runs', modal()),
  );
  const retained =
    title().value === 'Check before maintenance' &&
    button('Create run', modal()).disabled &&
    modal().textContent.includes('Could not read saved runs');
  listStatus = 200;
  await click(button('Check saved runs', modal()));
  await settle(() => !modal());
  check(
    'Failed held list read preserves draft and uncertainty; explicit read retry never creates again',
    held && retained && posts().length === 1,
  );

  await reset();
  await fail();
  listStatus = 403;
  await click(button('Check saved runs', modal()));
  await settle(() => modal().textContent.includes('Synthetic list 403'));
  const retained403 =
    title().value === 'Check before maintenance' && button('Create run', modal()).disabled;
  await click(button('Cancel', modal()));
  check(
    'Recovery list403 removes previously selected protected run while retaining the independent draft until close',
    retained403 &&
      !document.querySelector('.run-detail') &&
      !document.querySelector('.run-options button') &&
      posts().length === 1,
  );

  await reset();
  await fail();
  listEmpty = true;
  await click(button('Check saved runs', modal()));
  await settle(() => !modal());
  check(
    'Empty authorized history does not claim the uncertain plan was never saved',
    document.getElementById('probe').textContent.includes('Creation could not be confirmed') &&
      posts().length === 1 &&
      records.size === 2,
  );

  for (const status of [400, 403, 409, 401]) {
    await reset(status);
    await click(button('Create run', modal()));
    await settle(() => !!modal().querySelector('[role="alert"]'));
    check(
      `Known ${status} stays an exact editable refusal without an uncertain-recovery claim`,
      !button('Create run', modal()).disabled &&
        !button('Check saved runs', modal()) &&
        title().value === 'Check before maintenance' &&
        records.size === 1 &&
        posts().length === 1 &&
        (status !== 401 || ended === 1),
    );
  }

  await reset();
  await fail();
  listStatus = 'unreadable200';
  await click(button('Check saved runs', modal()));
  await settle(() => modal().textContent.includes('Could not read saved runs'));
  check(
    'Unreadable history response preserves exact draft and cannot unlock Create',
    title().value === 'Check before maintenance' &&
      button('Create run', modal()).disabled &&
      posts().length === 1,
  );

  await reset(200);
  await click(button('Create run', modal()));
  await settle(
    () =>
      !modal() &&
      document.querySelector('.run-detail')?.textContent.includes('Check before maintenance'),
  );
  check(
    'Known successful creation retains ordinary selection and list refresh',
    records.size === 2 &&
      posts().length === 1 &&
      !document.getElementById('probe').textContent.includes('Creation could not be confirmed'),
  );

  await reset();
  await fail();
  await click(button('Cancel', modal()));
  await open();
  check(
    'Explicit close and reopening starts a fresh dialog without automatically retrying creation',
    !button('Create run', modal()).disabled &&
      !button('Check saved runs', modal()) &&
      posts().length === 1 &&
      records.size === 2,
  );
}
(async () => {
  let error;
  try {
    await suite();
  } catch (failure) {
    error = failure.stack;
  }
  const report = {
    results,
    error,
    nativeCalls: 0,
    appliedWrites: 0,
    syntheticPlans: records?.size,
  };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await reportFetch('/_test/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
})();
