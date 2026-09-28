import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { OperationsDesk } from '../../src/desk/OperationsDesk';
import { summarize, templates } from '../../shared/runbook';
import { validateStoredRun } from '../../server/run-validation';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window),
  results = [],
  calls = [];
const at = '2026-09-28T12:00:00Z';
const run = {
  id: '77777777-7777-4777-8777-777777777777',
  revision: 1,
  version: 1,
  owner: 'Synthetic operator',
  instance: 'synthetic-only',
  title: 'Synthetic maintenance',
  target: '/synthetic-app',
  template: 'application-window',
  status: 'active',
  needsRestore: true,
  original: true,
  createdAt: at,
  updatedAt: at,
  steps: templates['application-window'].steps.map((step, index) => ({
    ...step,
    status: index === 1 ? 'uncertain' : index === 0 ? 'done' : 'pending',
    attempts: index <= 1 ? 1 : 0,
    ...(index === 1 ? { error: 'Protected run detail marker' } : {}),
  })),
  events: [],
};
validateStoredRun(run);
const command = {
  format: 1,
  id: '88888888-8888-4888-8888-888888888888',
  owner: 'Synthetic operator',
  instance: 'synthetic-only',
  createdAt: at,
  updatedAt: at,
  expiresAt: at,
  status: 'uncertain',
  operation: { path: '/v2/web-apps', method: 'PUT', query: { application: '/synthetic-app' } },
  title: 'Synthetic command',
  target: '/synthetic-app',
  confirmation: '/synthetic-app',
  before: { Enabled: true },
  proposed: { Enabled: false },
  fields: ['Enabled'],
  writeOnlyFields: [],
  read: { path: '/v2/web-apps', query: { application: '/synthetic-app' }, mode: 'fields' },
  message: 'Protected command detail marker',
  events: [],
};
let listCodes,
  detailCodes,
  held,
  release,
  nextHold,
  generation = 0;
const records = { runs: run, commands: command };
window.fetch = async (url, init = {}) => {
  const method = init.method ?? 'GET',
    parts = url.split('/'),
    source = parts[2],
    detail = parts.length > 3;
  calls.push({ url, method });
  if (method === 'POST' && url === '/api/commands/' + command.id + '/reconcile')
    return Response.json({
      ...command,
      status: 'verified',
      message: 'Confirmed synthetic readback',
      observedAt: at,
    });
  if (method !== 'GET' || !['runs', 'commands', 'procedures'].includes(source))
    throw Error('Unexpected synthetic request ' + url);
  const code = detail ? detailCodes[source] : listCodes[source];
  const body =
    code === 200
      ? detail
        ? records[source]
        : source === 'runs'
          ? [summarize(run)]
          : source === 'commands'
            ? [command]
            : []
      : { error: 'Synthetic ' + source + ' ' + code };
  const respond = () => Response.json(body, { status: code });
  if (nextHold === url) {
    nextHold = undefined;
    held = true;
    return new Promise((resolve) => {
      release = () => resolve(respond());
    });
  }
  return respond();
};
const root = createRoot(document.getElementById('probe'));
const inspector = () => document.querySelector('.desk-inspector');
const button = (name) =>
  [...document.querySelectorAll('#probe button')].find((node) => node.textContent.trim() === name);
const inspectButton = (source) =>
  [...document.querySelectorAll('.desk-issue')]
    .find((node) => node.querySelector('h3')?.textContent === records[source].title)
    ?.querySelector('button');
const check = (name, pass) => results.push({ name, pass: !!pass });
const has = (source) => inspector().textContent.includes(records[source].title);
async function tick() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
}
async function settle(condition) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await tick();
  }
  throw Error('Desk fixture did not settle');
}
async function click(node) {
  if (!node) throw Error('Missing desk control');
  await act(async () => node.click());
  await tick();
}
async function reset() {
  listCodes = { runs: 200, commands: 200, procedures: 200 };
  detailCodes = { runs: 200, commands: 200 };
  calls.length = 0;
  held = false;
  release = undefined;
  nextHold = undefined;
  await act(async () => root.render(<OperationsDesk key={++generation} />));
  await settle(() => !!inspectButton('runs') && !button('Refresh records').disabled);
}
async function inspect(source) {
  await click(inspectButton(source));
  await settle(() =>
    inspector().textContent.includes(
      source === 'runs' ? 'Protected run detail marker' : 'Protected command detail marker',
    ),
  );
}
async function refresh() {
  await click(button('Refresh records'));
  await settle(() => !button('Refresh records').disabled);
}
async function suite() {
  for (const source of ['runs', 'commands']) {
    await reset();
    await inspect(source);
    listCodes[source] = 403;
    await refresh();
    check(
      source + ' source403 clears selected title, detail and controls',
      !has(source) &&
        !inspector().textContent.includes('Protected ') &&
        !button('Read current result') &&
        !button('Open run controls') &&
        !inspectButton(source),
    );
  }
  for (const source of ['runs', 'commands']) {
    await reset();
    await inspect(source);
    listCodes[source === 'runs' ? 'commands' : 'runs'] = 403;
    await refresh();
    check(
      'Unrelated source403 retains authorized ' + source + ' inspector',
      has(source) && inspector().textContent.includes('Protected '),
    );
  }
  for (const source of ['runs', 'commands']) {
    await reset();
    await inspect(source);
    listCodes[source] = 503;
    await refresh();
    check(
      source + ' temporary list503 preserves last successfully read evidence',
      has(source) &&
        inspector().textContent.includes('Protected ') &&
        document.body.textContent.includes('Visibility is incomplete'),
    );
  }
  for (const source of ['runs', 'commands'])
    for (const code of [403, 404]) {
      await reset();
      detailCodes[source] = code;
      await click(inspectButton(source));
      check(
        source + ' detail' + code + ' clears selected summary and matching list row',
        !has(source) &&
          !inspectButton(source) &&
          !!inspectButton(source === 'runs' ? 'commands' : 'runs') &&
          !inspector().querySelector('.loading'),
      );
    }
  await reset();
  nextHold = '/api/runs/' + run.id;
  await click(inspectButton('runs'));
  await settle(() => held);
  listCodes.runs = 403;
  await refresh();
  await act(async () => release());
  await tick();
  check(
    'Late detail200 after a newer source403 cannot restore inspector or busy state',
    !has('runs') &&
      !button('Open run controls') &&
      inspector().textContent.includes('Select an attention item'),
  );

  await reset();
  nextHold = '/api/runs';
  await click(button('Refresh records'));
  await settle(() => held);
  detailCodes.runs = 403;
  await click(inspectButton('runs'));
  await act(async () => release());
  await tick();
  check(
    'Older list200 cannot restore a row after explicit detail403',
    !has('runs') && !inspectButton('runs') && !button('Refresh records').disabled,
  );

  await reset();
  await inspect('runs');
  listCodes.runs = 403;
  nextHold = '/api/runs';
  await click(button('Refresh records'));
  await settle(() => held);
  await inspect('commands');
  await act(async () => release());
  await tick();
  check(
    'Pending source denial uses current selection and preserves a newly selected other source',
    has('commands') && !inspectButton('runs') && !button('Read current result').disabled,
  );

  for (const code of [200, 503]) {
    await reset();
    await inspect('commands');
    listCodes.commands = code;
    await click(button('Read current result'));
    await settle(() => !button('Refresh records').disabled);
    check(
      'Confirmed reconciliation survives subsequent list' + code + ' without replay',
      inspector().textContent.includes('Confirmed synthetic readback') &&
        inspector().textContent.includes('Observed result matches') &&
        calls.filter((call) => call.method === 'POST').length === 1,
    );
  }
  await reset();
  await inspect('commands');
  listCodes.commands = 403;
  await click(button('Read current result'));
  await settle(() => !button('Refresh records').disabled);
  check(
    'Denied source after confirmed reconciliation removes protected result without replay',
    !has('commands') &&
      !inspector().textContent.includes('Confirmed synthetic readback') &&
      calls.filter((call) => call.method === 'POST').length === 1,
  );

  await reset();
  await inspect('commands');
  nextHold = '/api/commands';
  await click(button('Refresh records'));
  await settle(() => held);
  listCodes.commands = 403;
  await click(button('Read current result'));
  await tick();
  await act(async () => release());
  await tick();
  check(
    'Old refresh completion cannot resurrect a source after a newer denied refresh',
    !has('commands') &&
      !inspectButton('commands') &&
      document.body.textContent.includes('Synthetic commands 403') &&
      !button('Refresh records').disabled,
  );

  await reset();
  detailCodes.runs = 403;
  nextHold = '/api/runs/' + run.id;
  await click(inspectButton('runs'));
  await settle(() => held);
  await inspect('commands');
  await act(async () => release());
  await tick();
  check(
    'Delayed denied detail from previous selection cannot clear current authorized command',
    has('commands') && !button('Read current result').disabled,
  );

  await reset();
  await inspect('runs');
  listCodes.runs = 403;
  nextHold = '/api/commands';
  await click(button('Refresh records'));
  await settle(() => held);
  check(
    'Known run denial removes its cache and inspector before an unrelated source settles',
    !has('runs') &&
      !inspectButton('runs') &&
      !!inspectButton('commands') &&
      button('Refresh records').disabled,
  );
  await act(async () => release());
  await tick();

  await reset();
  nextHold = '/api/runs/' + run.id;
  await click(inspectButton('runs'));
  await settle(() => held);
  const lateDetail = release;
  held = false;
  nextHold = '/api/commands';
  listCodes.runs = 403;
  await click(button('Refresh records'));
  await settle(() => held);
  await act(async () => lateDetail());
  await tick();
  check(
    'Late detail cannot reappear between source denial and the remaining list response',
    !has('runs') && !button('Open run controls') && button('Refresh records').disabled,
  );
  await act(async () => release());
  await tick();
}
(async () => {
  let error;
  try {
    await suite();
  } catch (cause) {
    error = cause.stack;
  }
  const report = { results, error, nativeCalls: 0, appliedWrites: 0 };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await reportFetch('/_test/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
})();
