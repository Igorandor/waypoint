import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RunComparison } from '../../src/features/runbooks/RunComparison';
import { compareRuns } from '../../shared/run-records';
import { summarize } from '../../shared/runbook';
import { collectionComparisonPair } from '../fixtures/comparison-collection';
import { validateStoredRun } from '../../server/run-validation';
import '../../src/styles.css';
import '../../src/layout/WaypointShell.css';
import '../../src/features/runbooks/runbooks.css';
import '../../src/features/runbooks/records.css';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById('probe'));
const reportFetch = window.fetch.bind(window),
  results = [],
  blobs = new Map(),
  downloads = [];
let mode = 'shifted',
  showDownload = () => {};
window.fetch = async (url, options) => {
  if (url !== '/api/runs/compare' || options?.method !== 'POST')
    throw Error('Unexpected fixture request');
  const pair = collectionComparisonPair(mode),
    input = JSON.parse(options.body);
  validateStoredRun(pair.before);
  validateStoredRun(pair.after);
  if (input.before !== pair.before.id || input.after !== pair.after.id)
    throw Error('Wrong fixture pair');
  return Response.json(compareRuns(pair.before, pair.after));
};
URL.createObjectURL = (blob) => {
  const url = 'blob:synthetic-' + blobs.size;
  blobs.set(url, blob);
  return url;
};
URL.revokeObjectURL = () => {};
HTMLAnchorElement.prototype.click = function () {
  const record = { filename: this.download, text: '' };
  downloads.push(record);
  record.ready = blobs
    .get(this.href)
    .text()
    .then((text) => {
      record.text = text;
      showDownload(record);
    });
};
function Harness() {
  const [scenario, setScenario] = useState('shifted'),
    [download, setDownload] = useState(null),
    [visible, setVisible] = useState(true);
  mode = scenario;
  showDownload = setDownload;
  const pair = collectionComparisonPair(scenario);
  return (
    <main style={{ padding: '1rem' }}>
      <p>Synthetic comparison fixture. No native calls or saved changes.</p>
      <label>
        Fixture scenario{' '}
        <select
          aria-label="Fixture scenario"
          value={scenario}
          onChange={(event) => {
            setScenario(event.target.value);
            setDownload(null);
          }}
        >
          <option value="shifted">Shifted 100-row windows</option>
          <option value="identical">Identical bounded windows</option>
          <option value="different-limits">Different requested limits</option>
          <option value="legacy">Legacy before capture</option>
          <option value="failed">Failed after capture</option>
          <option value="missing">Missing after source</option>
        </select>
      </label>
      <button onClick={() => setVisible(true)}>Open fixture comparison</button>
      {visible && (
        <RunComparison
          key={scenario}
          runs={[summarize(pair.before), summarize(pair.after)]}
          initial={pair.before.id}
          onClose={() => setVisible(false)}
        />
      )}
      {download && (
        <section id="download-output">
          <h2>{download.filename}</h2>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{download.text}</pre>
        </section>
      )}
    </main>
  );
}
function check(name, pass) {
  results.push({ name, pass: !!pass });
  if (!pass) throw Error(name);
}
async function click(text) {
  const node = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
  if (!node) throw Error('Missing button ' + text);
  await act(async () => node.click());
}
async function compare(scenario) {
  const node = document.querySelector('select[aria-label="Fixture scenario"]');
  await act(async () => {
    node.value = scenario;
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click('Compare runs');
}
async function exportResult() {
  await click('Export comparison');
  const file = downloads.at(-1);
  await act(async () => file.ready);
  return JSON.parse(file.text);
}
async function suite() {
  await act(async () => root.render(<Harness />));
  if (location.search === '?manual') {
    document.getElementById('result').textContent = 'Manual comparison fixture ready.';
    return;
  }
  await click('Compare runs');
  let source = document.querySelector('.source-comparison');
  check(
    'Shifted windows display both recorded row limits and native lifecycle warning',
    source.querySelectorAll('.comparison-collection-limits p').length === 2 &&
      source.textContent.includes('Requested row limit: 100') &&
      source.textContent.includes('does not establish native object creation or deletion'),
  );
  check(
    'Presence differences use before/after language instead of native lifecycle labels',
    source.textContent.includes('Only in before') &&
      source.textContent.includes('Only in after') &&
      ![...source.querySelectorAll('td')].some((cell) =>
        ['added', 'removed'].includes(cell.textContent),
      ),
  );
  let exported = await exportResult();
  check(
    'Actual comparison JSON preserves limits, notices, raw enums and nontruncated status',
    exported.sources[0].beforeCollection.requestedRowLimit === 100 &&
      exported.sources[0].afterCollectionNotice.includes('Requested row limit: 100') &&
      exported.sources[0].changes.some((change) => change.change === 'removed') &&
      exported.sources[0].truncated === false,
  );
  await compare('identical');
  check(
    'Bounded-source warning remains visible when unchanged results are filtered',
    !document.querySelector('.source-comparison') &&
      document
        .querySelector('.collection-boundary-summary')
        .textContent.includes('1 source with bounded or unrecorded collection limits'),
  );
  const show = document.querySelector('.check-option input');
  await act(async () => show.click());
  check(
    'Showing unchanged sources reveals both collection boundaries',
    document.querySelectorAll('.comparison-collection-limits p').length === 2,
  );
  await compare('different-limits');
  check(
    'Before and after retain different requested limits',
    document
      .querySelector('.comparison-collection-limits')
      .textContent.includes('Requested row limit: 100') &&
      document
        .querySelector('.comparison-collection-limits')
        .textContent.includes('Requested row limit: 50'),
  );
  await compare('legacy');
  exported = await exportResult();
  check(
    'Legacy side shows unavailable limit without numeric inference in UI or JSON',
    document
      .querySelector('.comparison-collection-limits p')
      .textContent.includes('limit was not recorded') &&
      !exported.sources[0].beforeCollection &&
      exported.sources[0].beforeCollectionNotice.includes('not recorded'),
  );
  await compare('failed');
  exported = await exportResult();
  check(
    'Failed source remains unavailable and never gains an after collection claim',
    exported.sources[0].state === 'unavailable' &&
      exported.sources[0].changes.length === 0 &&
      !exported.sources[0].afterCollectionNotice &&
      document.querySelectorAll('.comparison-collection-limits p').length === 1,
  );
  await compare('missing');
  check(
    'Missing source retains explicit nondeletion explanation',
    document
      .querySelector('.source-comparison')
      .textContent.includes('absence is not evidence that a native object was deleted'),
  );
}
suite()
  .then(async () => {
    if (location.search === '?manual') return;
    const report = { results, nativeCalls: 0, appliedWrites: 0 };
    document.getElementById('result').textContent = JSON.stringify(report, null, 2);
    await reportFetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
  })
  .catch(async (error) => {
    const report = {
      results,
      error: String(error),
      stack: error.stack,
      nativeCalls: 0,
      appliedWrites: 0,
    };
    document.getElementById('result').textContent = JSON.stringify(report, null, 2);
    await reportFetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
  });
