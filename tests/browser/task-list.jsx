import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TaskWorkspace } from '../../src/tasks/TaskWorkspace';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window);
const results = [];
const requests = [];
const status = { list: 200, configuration: 200, state: 200, history: 200 };
let holdSeven = false;
const held = [];
let exported;
URL.createObjectURL = (blob) => {
  exported = blob;
  return 'blob:synthetic-task-export';
};
URL.revokeObjectURL = () => {};
HTMLAnchorElement.prototype.click = () => {};
window.fetch = async (_url, init) => {
  const command = JSON.parse(init.body);
  const source = {
    '/v2/tasks': 'list',
    '/v2/task': 'configuration',
    '/v2/task/info': 'state',
    '/v2/task/history': 'history',
  }[command.path];
  if (command.method !== 'GET' || !source)
    throw new Error('Unexpected operation in read-only test.');
  const id = command.query?.id ?? command.query?.taskId;
  requests.push({ source, id, status: status[source] });
  const data =
    source === 'list'
      ? [7, 8].map((Id) => ({ Id, Name: `List-only task ${Id}`, Namespace: '%SYS', Type: 'User' }))
      : source === 'configuration'
        ? {
            Id: +id,
            Name: `Allowed configuration ${id}`,
            TaskClass: 'Fixture.Task',
            NameSpace: '%SYS',
          }
        : source === 'state'
          ? { Suspended: false, Status: 'Scheduled' }
          : [{ TaskId: +id, Result: `Protected history ${id}`, LastStart: '2026-09-27 12:00:00' }];
  const response =
    status[source] === 200
      ? Response.json({ data, status: 200, console: [] })
      : Response.json({ error: `${source} denied ${status[source]}` }, { status: status[source] });
  if (holdSeven && id === '7') return new Promise((resolve) => held.push(() => resolve(response)));
  return response;
};
const content = () => document.getElementById('probe').textContent;
const root = createRoot(document.getElementById('probe'));
const check = (name, pass) => results.push({ name, pass: !!pass });
async function settle(ready, name) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (ready()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  throw new Error(`Bounded settle failed: ${name}`);
}
function button(label) {
  const result = [...document.querySelectorAll('#probe button')].find(
    (node) => node.textContent.trim() === label,
  );
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}
async function click(label) {
  await act(async () => button(label).click());
}
async function select(id) {
  const row = [...document.querySelectorAll('.task-choice')].find(
    (node) => node.querySelector('strong').textContent === `List-only task ${id}`,
  );
  if (!row) throw new Error(`Missing task: ${id}`);
  await act(async () => row.click());
}
async function exportDossier() {
  exported = undefined;
  await click('Export dossier');
  return JSON.parse(await exported.text());
}
async function publish(report) {
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await reportFetch('/_test/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
}
async function run() {
  await act(async () => root.render(<TaskWorkspace />));
  await settle(() => content().includes('List-only task 7'), 'initial inventory');
  await select(7);
  await settle(() => content().includes('Allowed configuration 7'), 'initial dossier');
  status.list = 403;
  await click('Refresh inventory');
  await settle(() => content().includes('list denied 403'), 'inventory403');
  check(
    'inventory403 removes inventory rows and collection timestamp',
    !content().includes('List-only task') && !content().includes('Inventory read'),
  );
  check(
    'inventory403 preserves independently allowed selected dossier',
    content().includes('Allowed configuration 7') &&
      (await exportDossier()).configuration.data.Name === 'Allowed configuration 7',
  );

  status.list = 200;
  await click('Refresh inventory');
  await settle(() => content().includes('List-only task 7'), 'inventory recovery');
  status.list = 500;
  await click('Refresh inventory');
  await settle(() => content().includes('list denied 500'), 'inventory500');
  check(
    'inventory500 preserves previously captured list and timestamp',
    content().includes('List-only task 7') && content().includes('Inventory read'),
  );
  check(
    'inventory500 also preserves selected dossier export',
    (await exportDossier()).configuration.data.Name === 'Allowed configuration 7',
  );

  status.history = 403;
  await click('Refresh task');
  await settle(() => content().includes('history denied 403'), 'history403');
  const partialHistory = await exportDossier();
  check(
    'denied history is absent from export while independently read configuration and state remain',
    !partialHistory.history.data &&
      !!partialHistory.history.error &&
      !!partialHistory.configuration.data &&
      !!partialHistory.state.data &&
      !JSON.stringify(partialHistory).includes('Protected history 7'),
  );
  status.history = 200;
  status.configuration = 403;
  await click('Refresh task');
  await settle(() => content().includes('configuration denied 403'), 'configuration403');
  const partialConfiguration = await exportDossier();
  check(
    'denied configuration is absent while independently read history and state remain',
    !partialConfiguration.configuration.data &&
      !!partialConfiguration.configuration.error &&
      !!partialConfiguration.history.data &&
      !!partialConfiguration.state.data,
  );

  status.configuration = 200;
  holdSeven = true;
  await select(7);
  check(
    'selecting a pending dossier hides the preceding dossier and its export',
    !content().includes('Export dossier'),
  );
  await select(8);
  await settle(() => content().includes('Allowed configuration 8'), 'second selected task');
  holdSeven = false;
  await act(async () => {
    held.splice(0).forEach((release) => release());
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  const latest = await exportDossier();
  check(
    'late task7 responses cannot replace selected task8 or its export',
    latest.id === '8' &&
      latest.configuration.data.Name === 'Allowed configuration 8' &&
      !JSON.stringify(latest).includes('Protected history 7'),
  );
  await act(async () => root.render(null));
  await publish({ results, requests, nativeCalls: 0, appliedWrites: 0 });
}
run().catch(async (error) =>
  publish({ error: error.stack, results, requests, nativeCalls: 0, appliedWrites: 0 }),
);
