import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { RunRecordTools } from '../../src/features/runbooks/RunRecordTools';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const results = [],
  calls = [];
const root = createRoot(document.getElementById('probe'));
const runRecord = {
  id: 'synthetic-run',
  revision: 7,
  owner: 'Fixture',
  steps: [],
  status: 'active',
  needsRestore: false,
};
let response = { ok: false, error: 'Synthetic save conflict. Reload before saving.' },
  release;
const onAction = async (action, body) => {
  calls.push({ action, body });
  return response === 'held'
    ? new Promise((resolve) => {
        release = resolve;
      })
    : response;
};
const check = (name, pass) => results.push({ name, pass: !!pass });
const dialog = () => document.querySelector('#probe dialog');
const button = (label) =>
  [...document.querySelectorAll('#probe button')].find((node) => node.textContent.trim() === label);
const field = (label) =>
  [...document.querySelectorAll('.handover-editor label')]
    .find((node) => node.textContent.trim().startsWith(label))
    ?.querySelector('input,textarea');
async function click(label) {
  const node = button(label);
  if (!node || node.disabled) throw new Error('Unavailable button: ' + label);
  await act(async () => node.click());
}
async function fill(label, value) {
  const node = field(label);
  if (!node) throw new Error('Missing field: ' + label);
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
async function cancelEvent() {
  await act(async () => dialog().dispatchEvent(new Event('cancel', { cancelable: true })));
}
async function render(busy = false) {
  await act(async () =>
    root.render(<RunRecordTools run={runRecord} busy={busy} onAction={onAction} />),
  );
}
async function run() {
  await render();
  await click('Prepare handover');
  await click('Cancel');
  check('unchanged handover closes without a prompt', !dialog());
  await click('Prepare handover');
  const summary =
    'Checked the recorded observations. Follow up on the missing task history before the next window.';
  await fill('Summary', summary);
  await click('Add follow-up');
  await fill('Action', 'Check task history');
  await click('Cancel');
  check(
    'Cancel requests explicit discard of unsaved summary and follow-up',
    !!button('Keep editing') && !!button('Discard draft') && calls.length === 0,
  );
  if (!button('Keep editing')) {
    await click('Prepare handover');
    throw new Error(
      'Draft silently lost after Cancel and reopen: ' +
        JSON.stringify({ summary: field('Summary')?.value, action: field('Action')?.value }),
    );
  }
  await click('Keep editing');
  check(
    'Keep editing retains the complete draft',
    dialog().open &&
      field('Summary').value === summary &&
      field('Action').value === 'Check task history',
  );
  await cancelEvent();
  check('dialog cancel event requests discard', dialog().open && !!button('Discard draft'));
  await cancelEvent();
  check(
    'canceling the discard prompt returns to the draft',
    dialog().open &&
      field('Summary')?.value === summary &&
      field('Action')?.value === 'Check task history',
  );
  await act(async () => dialog().querySelector('[aria-label="Close dialog"]').click());
  check('close button uses the same discard guard', !!button('Discard draft'));
  await click('Discard draft');
  await click('Prepare handover');
  check('explicit discard reopens saved values', field('Summary').value === '' && !field('Action'));
  await fill('Summary', summary);
  await click('Save handover details');
  check(
    'failed save retains draft and explains the failure',
    field('Summary')?.value === summary &&
      document.querySelector('[role="alert"]')?.textContent.includes('Synthetic save conflict'),
  );
  await click('Cancel');
  await click('Keep editing');
  check(
    'save failure does not make the dirty draft disposable',
    field('Summary')?.value === summary,
  );
  await render(true);
  await cancelEvent();
  check(
    'parent busy blocks dismissal',
    !!field('Summary') && !button('Discard draft') && button('Cancel').disabled,
  );
  await render(false);
  response = 'held';
  const save = button('Save handover details');
  const before = calls.length;
  await act(async () => {
    save.click();
    save.click();
  });
  await cancelEvent();
  check(
    'in-flight save blocks duplicate dispatch and dismissal before parent busy changes',
    calls.length === before + 1 &&
      !!field('Summary') &&
      !button('Discard draft') &&
      button('Cancel').disabled,
  );
  await act(async () => release({ ok: true }));
  check(
    'successful save closes the editor with the original revision and draft',
    !dialog() && calls.at(-1).body.revision === 7 && calls.at(-1).body.handover.summary === summary,
  );
  runRecord.handover = {
    recipient: 'Next operator',
    summary: 'Saved handover',
    outstandingRisks: '',
    nextActions: [],
    references: [],
    delivered: false,
  };
  await render();
  await click('Prepare handover');
  await fill('Summary', 'Changed existing handover');
  await click('Cancel');
  await click('Keep editing');
  check(
    'saved handover edits also receive the guard',
    field('Summary').value === 'Changed existing handover',
  );
  await fill('Summary', 'Saved handover');
  await click('Cancel');
  check('reverting to the initial values removes the discard prompt', !dialog());
  await act(async () => root.unmount());
  return {
    results,
    calls,
    nativeCalls: 0,
    appliedWrites: 0,
    limitations:
      'Actual React component with a synthetic onAction callback. The cancel event exercises the shared modal Escape handler; real keyboard and responsive checks are separate.',
  };
}
async function publish(report) {
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await fetch('/_test/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
}
run()
  .then(publish)
  .catch((error) =>
    publish({ error: error.stack, results, calls, nativeCalls: 0, appliedWrites: 0 }),
  );
