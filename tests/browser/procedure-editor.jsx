import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ProcedureLibrary } from '../../src/procedures/ProcedureLibrary';
import { procedureSummary } from '../../shared/procedure';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window);
const results = [],
  requests = [],
  writes = [];
let errorFocusCount = 0;
document.addEventListener(
  'focus',
  (event) => {
    if (event.target?.getAttribute('aria-label') === 'Procedure save error') errorFocusCount++;
  },
  true,
);
const at = '2026-09-27T12:00:00.000Z';
const idA = '11111111-1111-4111-8111-111111111111',
  idB = '22222222-2222-4222-8222-222222222222';
const definition = (title) => ({
  title,
  description: 'Synthetic observation.',
  expectedOutcome: 'Record health',
  tags: [],
  steps: [
    {
      id: 'health',
      kind: 'observation',
      title: 'Health',
      instruction: '',
      source: 'health',
      target: '',
    },
  ],
});
function record(id, revision) {
  return {
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
      changeNote: 'Saved version',
      body: definition(`Procedure ${id === idA ? 'A' : 'B'} version ${index + 1}`),
    })),
  };
}
let currentA = record(idA, 1),
  hold = true,
  release;
const currentB = record(idB, 1);
window.fetch = async (url, init) => {
  requests.push({ url, method: init.method });
  if (url === '/api/procedures' && init.method === 'GET')
    return Response.json([currentA, currentB].map(procedureSummary));
  if (url === '/api/procedures/' + idA && init.method === 'GET') {
    const response = Response.json(currentA);
    if (hold)
      return new Promise((resolve) => {
        release = () => resolve(response);
      });
    return response;
  }
  if (url === '/api/procedures/' + idB && init.method === 'GET') return Response.json(currentB);
  if (url.endsWith('/revisions') && init.method === 'POST') {
    writes.push({ url, payload: JSON.parse(init.body) });
    return Response.json(
      { error: 'Synthetic revision conflict. Reload the latest version before saving.' },
      { status: 409 },
    );
  }
  throw new Error(`Unexpected synthetic request ${init.method} ${url}`);
};
const root = createRoot(document.getElementById('probe'));
const check = (name, pass) => results.push({ name, pass: !!pass });
function button(label) {
  return [...document.querySelectorAll('#probe button')].find(
    (node) => node.textContent.trim() === label,
  );
}
function field(label) {
  return [...document.querySelectorAll('.procedure-editor label')]
    .find((node) => node.textContent.trim().startsWith(label))
    ?.querySelector('input,textarea');
}
async function click(label) {
  const node = button(label);
  if (!node || node.disabled) throw new Error(`Unavailable button: ${label}`);
  await act(async () => node.click());
}
async function settle(test, label) {
  for (let count = 0; count < 100; count++) {
    if (test()) return;
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
async function save() {
  const count = writes.length;
  await click('Save new version');
  await settle(
    () =>
      writes.length === count + 1 && !document.querySelector('.procedure-editor fieldset').disabled,
    'save rejection',
  );
  return writes.at(-1);
}
async function run() {
  await act(async () => root.render(<ProcedureLibrary />));
  await settle(
    () =>
      document.querySelectorAll('.procedure-option').length === 2 && !button('Refresh').disabled,
    'list',
  );
  await act(async () => document.querySelector('.procedure-option').click());
  await settle(() => !!release, 'held selection');
  check(
    'pending selection blocks selecting another record',
    [...document.querySelectorAll('.procedure-option')].every((node) => node.disabled),
  );
  hold = false;
  await act(async () => release());
  await settle(() => !!button('Edit latest') && !button('Edit latest').disabled, 'selected A');
  currentA = record(idA, 2);
  hold = true;
  release = undefined;
  await click('Refresh');
  await settle(() => !!release, 'held refresh');
  await act(async () => button('Edit latest').click());
  check(
    'Edit latest is disabled while refreshing and cannot open a stale editor',
    button('Edit latest').disabled && !document.querySelector('.procedure-editor'),
  );
  hold = false;
  await act(async () => release());
  await settle(() => !button('Refresh').disabled, 'refresh completed');
  await click('Edit latest');
  await settle(() => !!field('Procedure name'), 'editor');
  const initialTitle = field('Procedure name').value;
  await setValue(field('Procedure name'), 'Draft from A revision 2');
  await setValue(field('Version change note'), 'Preserve this explanation');
  let sent = await save();
  check(
    'fresh editor saves captured ID and revision with its draft',
    initialTitle === 'Procedure A version 2' &&
      sent.url === `/api/procedures/${idA}/revisions` &&
      sent.payload.revision === 2 &&
      sent.payload.body.title === 'Draft from A revision 2',
  );
  check(
    'explicit conflict keeps draft, note and usable cancel control',
    document.querySelector('.procedure-editor') &&
      field('Procedure name').value === 'Draft from A revision 2' &&
      field('Version change note').value === 'Preserve this explanation' &&
      document.getElementById('probe').textContent.includes('Synthetic revision conflict') &&
      !button('Cancel').disabled,
  );
  const errorBlock = document.querySelector('[aria-label="Procedure save error"]');
  check(
    'remote failure focuses its named error next to save after busy ends',
    document.activeElement === errorBlock &&
      errorFocusCount === 1 &&
      errorBlock.nextElementSibling?.tagName === 'FOOTER' &&
      !document.querySelector('.procedure-editor fieldset').disabled,
  );
  const noteField = field('Version change note');
  noteField.focus();
  await setValue(noteField, 'Preserve this explanation — reviewed');
  check(
    'editing after a failure does not repeatedly steal focus',
    document.activeElement === noteField && errorFocusCount === 1,
  );
  // Deliberately invoke existing background controls programmatically while the
  // modal is open. This is callback-ownership coverage, not a user modality claim.
  currentA = record(idA, 3);
  hold = true;
  release = undefined;
  await click('Refresh');
  await settle(() => !!release, 'background callback refresh');
  hold = false;
  await act(async () => release());
  await settle(() => !button('Refresh').disabled, 'late background refresh');
  sent = await save();
  check(
    'a separate failed attempt focuses the error once again',
    document.activeElement?.getAttribute('aria-label') === 'Procedure save error' &&
      errorFocusCount === 2,
  );
  check(
    'late newer record does not silently advance the open draft revision',
    document.querySelectorAll('.procedure-toolbar select option').length === 3 &&
      sent.payload.revision === 2 &&
      sent.payload.body.title === 'Draft from A revision 2',
  );
  await act(async () => document.querySelectorAll('.procedure-option')[1].click());
  await settle(
    () =>
      document.querySelector('.procedure-detail h2')?.textContent === 'Procedure B version 1' &&
      !document.querySelector('.procedure-editor fieldset').disabled,
    'background callback selection',
  );
  sent = await save();
  check(
    'changing selected record does not retarget an already-open draft',
    sent.url === `/api/procedures/${idA}/revisions` &&
      sent.payload.revision === 2 &&
      sent.payload.body.title === 'Draft from A revision 2',
  );
  await click('Cancel');
  await click('Discard draft');
  await click('Edit latest');
  await settle(() => field('Procedure name')?.value === 'Procedure B version 1', 'new editor B');
  await setValue(field('Version change note'), 'Independent B edit');
  sent = await save();
  check(
    'closing and reopening binds a fresh editor to the new record',
    sent.url === `/api/procedures/${idB}/revisions` &&
      sent.payload.revision === 1 &&
      sent.payload.body.title === 'Procedure B version 1',
  );
  await act(async () => root.render(null));
  return {
    results,
    requests,
    writes,
    nativeCalls: 0,
    appliedWrites: 0,
    limitations:
      'Actual React components with synthetic fetch. Two ownership checks invoke background controls programmatically despite modal UI; they do not claim those clicks are user-accessible. Every captured write receives a synthetic409 and changes no stored record.',
  };
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
    publish({ error: error.stack, results, requests, writes, nativeCalls: 0, appliedWrites: 0 }),
  );
