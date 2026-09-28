import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import { procedureBodySchema, procedureSummary } from '../../shared/procedure';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window),
  results = [],
  calls = [];
const id = '11111111-1111-4111-8111-111111111111';
const at = '2026-09-28T12:00:00.000Z';
const body = procedureBodySchema.parse({
  title: 'Task handover',
  description: 'Synthetic task check',
  expectedOutcome: 'Record status',
  tags: [],
  steps: [
    {
      id: 'task-read',
      kind: 'observation',
      title: 'Read task',
      instruction: '',
      source: 'task',
      target: '7',
    },
    {
      id: 'checkpoint',
      kind: 'checklist',
      title: 'Review',
      instruction: '',
      items: [{ id: 'reviewed', text: 'Read the result', required: true }],
      requireNote: true,
      reference: '',
    },
    {
      id: 'check',
      kind: 'assertion',
      title: 'Recorded result',
      instruction: '',
      check: 'capture-present',
      sourceStepId: 'task-read',
      expected: true,
    },
  ],
});
const record = (revision = 1) => ({
  format: 1,
  id,
  owner: 'Fixture',
  instance: 'synthetic',
  revision,
  createdAt: at,
  updatedAt: at,
  archived: false,
  versions: Array.from({ length: revision }, (_, index) => ({
    number: index + 1,
    createdAt: at,
    createdBy: 'Fixture',
    changeNote: 'Saved',
    body: { ...body, title: `Task handover v${index + 1}` },
  })),
});
let current = record(),
  detailStatus = 200,
  listStatus = 200,
  holdDetail = false,
  holdSave = false,
  saveStatus = 200,
  releaseDetail,
  releaseSave;
window.fetch = async (input, options = {}) => {
  const url = String(input),
    method = options.method ?? 'GET';
  calls.push({ url, method, body: options.body ? JSON.parse(options.body) : undefined });
  if (url === '/api/session')
    return Response.json({ info: { username: 'Fixture' }, csrf: 'synthetic-only' });
  if (method === 'GET' && ['/api/runs', '/api/commands'].includes(url)) return Response.json([]);
  if (url === '/api/procedures' && method === 'GET')
    return Response.json(
      listStatus === 200 ? [procedureSummary(current)] : { error: 'Synthetic list denied' },
      { status: listStatus },
    );
  if (url === `/api/procedures/${id}` && method === 'GET') {
    const response = Response.json(
      detailStatus === 200 ? current : { error: `Synthetic read ${detailStatus}` },
      { status: detailStatus },
    );
    if (holdDetail)
      return new Promise((resolve) => {
        releaseDetail = () => resolve(response);
      });
    return response;
  }
  if (url === `/api/procedures/${id}/revisions` && method === 'POST') {
    if (holdSave)
      return new Promise((resolve) => {
        releaseSave = () => {
          if (saveStatus !== 200) {
            resolve(
              Response.json({ error: 'Synthetic pending save refused' }, { status: saveStatus }),
            );
            return;
          }
          current = record(2);
          current.versions[1].body = JSON.parse(options.body).body;
          resolve(Response.json(current));
        };
      });
    return Response.json({ error: 'Synthetic revision conflict' }, { status: 409 });
  }
  throw new Error(`Unexpected fixture request ${method} ${url}`);
};
const root = createRoot(document.getElementById('probe'));
const check = (name, pass) => results.push({ name, pass: !!pass });
const button = (label, scope = document.getElementById('probe')) =>
  [...scope.querySelectorAll('button')].find((node) => node.textContent.trim() === label);
const dialog = (title) =>
  [...document.querySelectorAll('#probe dialog')].find(
    (node) => node.querySelector('h2')?.textContent === title,
  );
const field = (label) =>
  [...document.querySelectorAll('.procedure-editor label')]
    .find((node) => node.textContent.trim().startsWith(label))
    ?.querySelector('input,textarea');
const click = async (node) => {
  if (!node || node.disabled) throw new Error('Unavailable control');
  await act(async () => node.click());
};
async function waitFor(condition) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  }
  throw new Error('Actual App did not reach expected state');
}
async function navigate(label) {
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })),
  );
  await click(button(label, dialog('Find a tool')));
}
async function fill(node, value) {
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
const reads = () =>
  calls.filter((call) => call.url === `/api/procedures/${id}` && call.method === 'GET').length;
const writes = () => calls.filter((call) => call.method === 'POST');
let generation = 0;
async function mountEditor() {
  current = record();
  detailStatus = listStatus = 200;
  holdDetail = holdSave = false;
  saveStatus = 200;
  releaseDetail = releaseSave = undefined;
  location.hash = 'procedures';
  await act(async () => root.render(<App key={++generation} />));
  await waitFor(
    () =>
      !!document.querySelector('.procedure-option') &&
      !document.querySelector('.procedure-option').disabled,
  );
  await click(document.querySelector('.procedure-option'));
  await click(button('Edit latest'));
  await fill(field('Procedure name'), 'Unfinished three-step draft');
  await fill(field('Version change note'), 'Preserve operator explanation');
  await fill(field('Task ID'), '42');
}
async function suite() {
  location.hash = 'runbooks';
  await act(async () => root.render(<App />));
  await waitFor(() => !!button('New run') && !button('New run').disabled);
  check(
    'Procedure library makes no requests before first visit',
    !calls.some((call) => call.url.startsWith('/api/procedures')),
  );
  await mountEditor();
  const editor = dialog('Edit procedure'),
    name = field('Procedure name');
  await navigate('Command history');
  await waitFor(() => !!document.querySelector('.command-history-layout'));
  check(
    'Navigation retains editor but closes and hides native modal',
    editor.isConnected &&
      !editor.open &&
      editor.hidden &&
      name.value === 'Unfinished three-step draft',
  );
  check('Destination has no modal making it inert', !document.querySelector('dialog:modal'));
  current = record(2);
  holdDetail = true;
  await navigate('Procedure library');
  await waitFor(() => !!releaseDetail);
  check(
    'Return checks protected record before exposing editor or export',
    !!name.closest('[hidden]') &&
      !button('Export version').checkVisibility() &&
      document.querySelector('.procedure-editor fieldset').disabled,
  );
  await act(async () => releaseDetail());
  holdDetail = false;
  await waitFor(() => !document.querySelector('.procedure-editor fieldset').disabled);
  check(
    'Successful return preserves exact mounted editor and three-step draft',
    dialog('Edit procedure') === editor &&
      editor.matches(':modal') &&
      name === field('Procedure name') &&
      name.value === 'Unfinished three-step draft' &&
      field('Task ID').value === '42' &&
      field('Version change note').value === 'Preserve operator explanation' &&
      document.querySelectorAll('.procedure-step-editor').length === 3,
  );
  await click(button('Save new version'));
  check(
    'Refreshed record never silently rebinds the draft revision',
    writes().at(-1)?.url === `/api/procedures/${id}/revisions` &&
      writes().at(-1)?.body.revision === 1 &&
      writes().at(-1)?.body.body.steps[0].target === '42',
  );
  check(
    'Revision conflict keeps draft and note for recovery',
    name.value === 'Unfinished three-step draft' &&
      field('Version change note').value === 'Preserve operator explanation' &&
      editor.textContent.includes('Synthetic revision conflict'),
  );
  await navigate('Command history');
  detailStatus = 503;
  await navigate('Procedure library');
  await waitFor(
    () =>
      !!button('Read procedure again', editor) && !button('Read procedure again', editor).disabled,
  );
  check(
    'Transient return read hides cached draft without discarding it',
    name.isConnected &&
      !!name.closest('[hidden]') &&
      editor.textContent.includes('Synthetic read 503'),
  );
  check('Transient return read hides exports', !button('Export version').checkVisibility());
  detailStatus = 200;
  await click(button('Read procedure again', editor));
  check(
    'Retry restores the exact draft and version note',
    !name.closest('[hidden]') &&
      name.value === 'Unfinished three-step draft' &&
      field('Version change note').value === 'Preserve operator explanation',
  );
  for (const status of [403, 404]) {
    await navigate('Command history');
    detailStatus = status;
    await navigate('Procedure library');
    await waitFor(() => !dialog('Edit procedure'));
    check(
      `Return GET ${status} clears protected editor, selected record and exports`,
      !document.querySelector('.procedure-editor') &&
        !button('Export version') &&
        !document.querySelector('.procedure-option'),
    );
    if (status === 403) await mountEditor();
  }
  await mountEditor();
  holdSave = true;
  await click(button('Save new version'));
  await waitFor(() => !!releaseSave);
  const readsBefore = reads(),
    writesBefore = writes().length;
  await navigate('Command history');
  await navigate('Procedure library');
  check(
    'Return waits for pending save before reading record',
    reads() === readsBefore && document.querySelector('.procedure-editor fieldset').disabled,
  );
  check('Navigation does not dispatch the pending save again', writes().length === writesBefore);
  await act(async () => releaseSave());
  await waitFor(() => !dialog('Edit procedure') && !button('Edit latest').disabled);
  check(
    'Confirmed save closes editor and return reads current record',
    reads() === readsBefore + 1 &&
      document.querySelector('.procedure-detail h2').textContent === 'Unfinished three-step draft',
  );
  await click(button('Edit latest'));
  await fill(field('Version change note'), 'Second version draft');
  holdSave = false;
  await click(button('Save new version'));
  check(
    'Next explicit edit binds the newly confirmed revision',
    writes().at(-1)?.body.revision === 2,
  );
  await mountEditor();
  holdSave = true;
  saveStatus = 409;
  await click(button('Save new version'));
  await waitFor(() => !!releaseSave);
  await navigate('Command history');
  await navigate('Procedure library');
  await act(async () => releaseSave());
  await waitFor(() => !document.querySelector('.procedure-editor fieldset').disabled);
  check(
    'Automatic return check preserves a pending save failure message',
    dialog('Edit procedure').textContent.includes('Synthetic pending save refused'),
  );
  check(
    'Refused pending save leaves the original draft and note intact',
    field('Procedure name').value === 'Unfinished three-step draft' &&
      field('Version change note').value === 'Preserve operator explanation' &&
      field('Task ID').value === '42',
  );
  await mountEditor();
  await navigate('Command history');
  holdDetail = true;
  releaseDetail = undefined;
  await navigate('Procedure library');
  await waitFor(() => !!releaseDetail);
  const staleRead = releaseDetail;
  releaseDetail = undefined;
  await navigate('Command history');
  await navigate('Procedure library');
  check(
    'Repeated navigation keeps an in-flight recheck gated',
    !!field('Procedure name').closest('[hidden]'),
  );
  detailStatus = 403;
  await act(async () => staleRead());
  await waitFor(() => !!releaseDetail);
  check(
    'Stale read cannot expose a draft after another return',
    !!field('Procedure name').closest('[hidden]'),
  );
  await act(async () => releaseDetail());
  holdDetail = false;
  await waitFor(() => !dialog('Edit procedure'));
  check(
    'Latest return denial wins over older successful read',
    !button('Export version') && !document.querySelector('.procedure-editor'),
  );
  await click(button('New procedure'));
  await fill(field('Procedure name'), 'New unsaved procedure');
  const newEditor = dialog('New procedure');
  await navigate('Command history');
  await navigate('Procedure library');
  await waitFor(() => !document.querySelector('.procedure-editor fieldset').disabled);
  check(
    'Unsaved new procedure also survives navigation without a record read',
    dialog('New procedure') === newEditor &&
      field('Procedure name').value === 'New unsaved procedure',
  );
  check(
    'All writes were intercepted revision fixtures, without native actions',
    writes().every((call) => call.url === `/api/procedures/${id}/revisions`) &&
      !calls.some((call) => call.url === '/api/iris'),
  );
}
(async () => {
  let error;
  try {
    await suite();
  } catch (cause) {
    error = cause.stack || String(cause);
  }
  const report = {
    results,
    error,
    nativeCalls: 0,
    appliedWrites: 0,
    limitations:
      'Actual App with synthetic records and intercepted transport; visual and physical keyboard checks are separate.',
  };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await reportFetch('/_test/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
})();
