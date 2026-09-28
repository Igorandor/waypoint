import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ProcedureVersionDiff } from '../../src/procedures/ProcedureVersionDiff';
import { comparisonVersions } from '../fixtures/procedure-versions';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById('probe')),
  results = [],
  blobs = [],
  filenames = [];
const originalCreate = URL.createObjectURL.bind(URL);
URL.createObjectURL = (blob) => {
  blobs.push(blob);
  return originalCreate(blob);
};
document.addEventListener(
  'click',
  (event) => {
    const anchor = event.target.closest?.('a[download]');
    if (anchor) {
      filenames.push(anchor.download);
      event.preventDefault();
    }
  },
  true,
);
const check = (name, pass) => results.push({ name, pass: !!pass });
const tick = () => act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
const button = (name) =>
  [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === name);
const article = (title, kind) =>
  [...document.querySelectorAll('.version-step-change')].find(
    (node) =>
      node.querySelector('h4').textContent === title &&
      node.querySelector('.badge').textContent === kind,
  );
async function select(index, value) {
  await act(async () => {
    const node = document.querySelectorAll('.planner-thresholds select')[index];
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(
      node,
      String(value),
    );
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await tick();
}
async function exportComparison() {
  await act(async () => button('Export version comparison').click());
  return JSON.parse(await blobs.at(-1).text());
}
(async () => {
  const versions = structuredClone(comparisonVersions);
  versions[1].body.steps[0].instruction = 'Display <img data-qa-injection="true"> as literal text';
  await act(async () => root.render(<ProcedureVersionDiff versions={versions} />));
  await tick();
  check(
    'Added observation shows its source and exact target',
    article('Read application', 'added').textContent.includes('/csp/training-new') &&
      article('Read application', 'added').textContent.includes('application'),
  );
  check(
    'Removed observation shows the previous target',
    article('Read application', 'removed').textContent.includes('/csp/training-old'),
  );
  check(
    'Added checklist shows nested items, reference and false note requirement',
    article('Operator review', 'added').textContent.includes('Confirm new destination') &&
      article('Operator review', 'added').textContent.includes('https://example.com/new') &&
      article('Operator review', 'added').textContent.includes('false'),
  );
  check(
    'Removed checklist preserves its original required note',
    article('Operator review', 'removed').textContent.includes('Confirm old destination') &&
      article('Operator review', 'removed').textContent.includes('true'),
  );
  check(
    'Both assertion definitions retain source IDs and false/true expectations',
    article('Check application', 'added').textContent.includes('read-new') &&
      article('Check application', 'added').textContent.includes('false') &&
      article('Check application', 'removed').textContent.includes('read-old') &&
      article('Check application', 'removed').textContent.includes('true'),
  );
  check(
    'Untrusted instruction is rendered as literal text',
    article('Read application', 'added').textContent.includes('<img data-qa-injection="true">') &&
      !document.querySelector('[data-qa-injection]'),
  );
  const forward = await exportComparison(),
    added = forward.steps.find((step) => step.id === 'read-new');
  check(
    'Actual download payload contains added and removed definitions with raw keys',
    forward.format === 'waypoint-procedure-comparison-1' &&
      forward.addedSteps === 3 &&
      forward.removedSteps === 3 &&
      added.fields.find((field) => field.field === 'target').after === '/csp/training-new' &&
      forward.steps
        .find((step) => step.id === 'checkpoint-old')
        .fields.find((field) => field.field === 'items').before[0].required === true &&
      filenames.at(-1) === 'waypoint-procedure-v1-v2-comparison.json',
  );
  await select(0, 2);
  await select(1, 1);
  const reverse = await exportComparison();
  check(
    'Reverse comparison shows and exports definitions on the opposite side',
    reverse.before === 2 &&
      reverse.after === 1 &&
      reverse.steps
        .find((step) => step.id === 'read-new')
        .fields.find((field) => field.field === 'target').before === '/csp/training-new' &&
      article('Read application', 'removed').textContent.includes('/csp/training-new'),
  );
  await select(0, 1);
  check(
    'Identical versions do not invent additions or removals',
    !document.querySelector('.version-step-change') &&
      document.getElementById('probe').textContent.includes('No differences are shown'),
  );
  const changed = structuredClone(comparisonVersions[0]);
  changed.number = 2;
  changed.body.steps[0].target = '/csp/changed-same-id';
  await act(async () =>
    root.render(<ProcedureVersionDiff key="changed" versions={[comparisonVersions[0], changed]} />),
  );
  await tick();
  check(
    'Existing step changes keep the Before/After comparison',
    article('Read application', 'changed')
      .querySelector('table')
      .textContent.includes('BeforeAfter') &&
      article('Read application', 'changed').textContent.includes('/csp/training-old') &&
      article('Read application', 'changed').textContent.includes('/csp/changed-same-id'),
  );
  const report = { results, nativeCalls: 0, appliedWrites: 0 };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await fetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
})().catch(async (error) => {
  const report = { results, error: error.stack, nativeCalls: 0, appliedWrites: 0 };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await fetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
});
