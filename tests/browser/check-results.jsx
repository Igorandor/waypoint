import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { RunDetail } from '../../src/features/runbooks/RunDetail';
import { templates } from '../../shared/runbook';
import { checkRun } from './check-results-fixture';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window),
  results = [],
  actions = [];
const root = createRoot(document.getElementById('probe'));
let generation = 0;
const onAction = async (action, body) => {
  actions.push({ action, body });
  return { ok: true };
};
const check = (name, pass) => results.push({ name, pass: !!pass });
const button = (label) =>
  [...document.querySelectorAll('#probe button')].find((node) => node.textContent.trim() === label);
const step = (title) =>
  [...document.querySelectorAll('.step-index button')].find(
    (node) => node.querySelector('strong')?.textContent === title,
  );
const badge = () => document.querySelector('.step-inspector-heading .badge');
async function render(run) {
  await act(async () =>
    root.render(<RunDetail key={++generation} run={run} busy={false} onAction={onAction} />),
  );
}
async function select(title) {
  await act(async () => step(title).click());
}
async function fillNote(value) {
  const node = document.querySelector('.run-control textarea');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function suite() {
  const run = checkRun();
  const before = JSON.stringify(run);
  await render(run);
  check(
    'read-only checkpoint asks for decision and retains required-item gate',
    document.querySelector('.run-control textarea').placeholder ===
      'Record your decision, unresolved findings and the next action.' &&
      button('Record note and continue').disabled &&
      document.querySelectorAll('.run-checklist input').length === 3,
  );
  check(
    'failed assertion is explicitly labelled without changing recorded execution',
    step('Check available memory').textContent.includes('Recorded · Check failed') &&
      step('Check available memory').classList.contains('step-done') &&
      !!step('Check available memory').querySelector('.lucide-triangle-alert'),
  );
  check(
    'unknown assertion has a separate label and question icon',
    step('Check free disk space').textContent.includes('Recorded · Result unknown') &&
      !!step('Check free disk space').querySelector('.lucide-circle-question-mark'),
  );
  check(
    'passed assertion retains positive check label',
    step('Check that capacity was captured').textContent.includes('Recorded · Check passed') &&
      !!step('Check that capacity was captured').querySelector('.lucide-check'),
  );
  await select('Check available memory');
  check(
    'selected failed assertion has warning badge and original evidence',
    badge().classList.contains('warning') &&
      badge().textContent === 'Recorded · Check failed' &&
      document
        .querySelector('.step-inspector')
        .textContent.includes('The recorded observation differs from the expected state.'),
  );
  await select('Check free disk space');
  check(
    'selected unknown assertion explains missing typed fields without green success',
    badge().classList.contains('warning') &&
      !badge().classList.contains('good') &&
      document.querySelector('.step-inspector').textContent.includes('No pass is inferred.'),
  );
  await select('Check that capacity was captured');
  check(
    'selected passed assertion retains positive badge',
    badge().classList.contains('good') && badge().textContent === 'Recorded · Check passed',
  );
  await select('Read host-visible capacity');
  check(
    'ordinary successful observation keeps existing execution label',
    badge().textContent === 'done' &&
      step('Read host-visible capacity').querySelector('small').textContent === 'Recorded',
  );
  await fillNote('Defer the workload and assign the missing disk check.');
  check(
    'a note alone cannot bypass required checklist items',
    button('Record note and continue').disabled,
  );
  await act(async () =>
    document.querySelectorAll('.run-checklist input').forEach((node) => node.click()),
  );
  await act(async () => button('Record note and continue').click());
  check(
    'completed checkpoint sends exactly the chosen note and required item IDs',
    actions.length === 1 &&
      actions[0].action === 'next' &&
      actions[0].body.note === 'Defer the workload and assign the missing disk check.' &&
      actions[0].body.completedItems.length === 3 &&
      JSON.stringify(run) === before,
  );
  await render(checkRun(true));
  check(
    'completed read-only run distinguishes finished steps from outstanding check results',
    document.querySelector('.run-closed strong').textContent ===
      'Steps finished; checks may still need review' &&
      document.querySelector('.run-meta .badge').classList.contains('warning') &&
      document.querySelector('.run-check-results').textContent.includes('1 failed') &&
      document.querySelector('.run-check-results').textContent.includes('1 unknown'),
  );
  await render(checkRun(true, true));
  check(
    'all-passed run does not receive an unwarranted review warning',
    document.querySelector('.run-closed strong').textContent === 'Run complete' &&
      document.querySelector('.run-meta .badge').classList.contains('good'),
  );
  const maintenance = {
    ...checkRun(),
    template: 'task-window',
    target: '7',
    needsRestore: true,
    original: false,
    steps: templates['task-window'].steps.map((value, index) => ({
      ...value,
      status: index < 2 ? 'done' : 'pending',
      attempts: index < 2 ? 1 : 0,
    })),
  };
  await render(maintenance);
  check(
    'maintenance checkpoint keeps restoration wording and note requirement',
    document
      .querySelector('.run-control textarea')
      .placeholder.includes('whether the target is ready to restore') &&
      button('Record note and continue').disabled,
  );
  const failedRead = checkRun();
  failedRead.steps = failedRead.steps.map((value, index) => ({
    ...value,
    status: index === 0 ? 'failed' : 'pending',
    error: index === 0 ? 'Synthetic unavailable source' : undefined,
  }));
  await render(failedRead);
  check(
    'failed native read remains a retryable execution failure rather than a check result',
    !!button('Retry this step') &&
      badge().textContent === 'failed' &&
      badge().classList.contains('warning') &&
      ![...document.querySelectorAll('.step-index small')].some(
        (node) =>
          node.textContent.includes('Check failed') || node.textContent.includes('Result unknown'),
      ),
  );
  await act(async () => root.unmount());
  return {
    results,
    actions,
    nativeCalls: 0,
    appliedWrites: 0,
    limitations:
      'Actual RunDetail component with observations and assertions produced by the existing planner/evaluator. The checkpoint callback records synthetic input only; no run or IRIS data is saved.',
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
suite()
  .then(publish)
  .catch((error) =>
    publish({ error: error.stack, results, actions, nativeCalls: 0, appliedWrites: 0 }),
  );
