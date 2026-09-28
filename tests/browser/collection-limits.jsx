import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RunDetail } from '../../src/features/runbooks/RunDetail';
import { validateStoredRun } from '../../server/run-validation';
import '../../src/styles.css';
import '../../src/layout/WaypointShell.css';
import '../../src/features/runbooks/runbooks.css';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById('probe'));
const reportFetch = window.fetch.bind(window),
  results = [],
  downloads = [],
  blobs = new Map();
window.fetch = async () => {
  throw Error('No API calls allowed');
};
let showDownload = () => {};
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
      showDownload({ filename: record.filename, text });
    });
};
function runFor(mode = 'current') {
  const source = mode === 'history' ? 'task-history' : 'tasks';
  const definition = {
    id: 'observe',
    kind: 'observation',
    title: 'Inventory review',
    instruction: '',
    source,
    target: source === 'task-history' ? '7' : '',
  };
  const run = {
    version: 1,
    id: '22222222-2222-4222-8222-222222222222',
    owner: 'Fixture',
    instance: 'synthetic-only',
    template: 'observe',
    title: 'Recorded task review',
    target: 'Instance',
    createdAt: '2026-09-28T12:00:00.000Z',
    updatedAt: '2026-09-28T12:01:00.000Z',
    status: 'completed',
    needsRestore: false,
    events: [],
    procedure: {
      id: 'fixture-procedure',
      version: {
        number: 1,
        createdAt: '2026-09-28T11:00:00.000Z',
        createdBy: 'Fixture',
        changeNote: '',
        body: {
          title: 'Task review',
          description: '',
          expectedOutcome: '',
          tags: [],
          steps: [definition],
        },
      },
    },
    steps: [
      {
        kind: 'info',
        title: definition.title,
        description: '',
        status: 'done',
        attempts: 1,
        startedAt: '2026-09-28T12:00:30.000Z',
        finishedAt: '2026-09-28T12:01:00.000Z',
        procedureStep: definition,
        collection: { requestedRowLimit: mode === 'history' ? 50 : 100 },
        evidence: [{ Id: 7, Name: 'Synthetic task', Suspended: false }],
      },
    ],
  };
  if (mode === 'legacy') delete run.steps[0].collection;
  if (mode === 'failed') {
    run.status = 'active';
    run.steps[0].status = 'failed';
    delete run.steps[0].collection;
    delete run.steps[0].evidence;
    run.steps[0].error = 'Synthetic source unavailable';
  }
  if (mode === 'pending') {
    run.status = 'active';
    run.steps[0].status = 'pending';
    run.steps[0].attempts = 0;
    delete run.steps[0].collection;
    delete run.steps[0].evidence;
    delete run.steps[0].startedAt;
    delete run.steps[0].finishedAt;
  }
  validateStoredRun(run);
  return run;
}
function Harness() {
  const [mode, setMode] = useState('current'),
    [download, setDownload] = useState(null);
  showDownload = setDownload;
  return (
    <main style={{ padding: '1rem', minWidth: 0 }}>
      <p>Synthetic fixture only. Source results and downloads stay in memory.</p>
      <label>
        Fixture scenario{' '}
        <select
          aria-label="Fixture scenario"
          value={mode}
          onChange={(event) => {
            setMode(event.target.value);
            setDownload(null);
          }}
        >
          <option value="current">Current inventory, requested 100</option>
          <option value="history">Task history, requested 50</option>
          <option value="legacy">Legacy observation, no recorded limit</option>
          <option value="failed">Failed read</option>
          <option value="pending">Pending read</option>
        </select>
      </label>
      <RunDetail
        key={mode}
        run={runFor(mode)}
        busy={false}
        onAction={async () => ({ ok: false, error: 'Fixture does not execute actions.' })}
      />
      {download && (
        <section id="download-output">
          <h2>Captured download: {download.filename}</h2>
          {download.filename.endsWith('.html') ? (
            <iframe
              title="Downloaded printable report"
              sandbox=""
              srcDoc={download.text}
              style={{ width: '100%', height: 1000, border: 0 }}
            />
          ) : (
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{download.text}</pre>
          )}
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
  await act(async () => node.click());
}
async function download(text) {
  await click(text);
  const record = downloads.at(-1);
  await act(async () => record.ready);
  return record.text;
}
async function select(mode) {
  const node = document.querySelector('select[aria-label="Fixture scenario"]');
  await act(async () => {
    node.value = mode;
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function suite() {
  await act(async () => root.render(<Harness />));
  if (location.search === '?manual') {
    document.getElementById('result').textContent = 'Manual collection-limit fixture ready.';
    return;
  }
  check(
    'Selected result shows recorded requested limit without claiming complete inventory',
    document
      .querySelector('.step-inspector .collection-limit-notice')
      ?.textContent.includes('Requested row limit: 100. This bounded response does not establish'),
  );
  const raw = JSON.parse(await download('Export report'));
  check(
    'Raw run JSON preserves collection metadata and unwrapped evidence',
    raw.steps[0].collection.requestedRowLimit === 100 &&
      Array.isArray(raw.steps[0].evidence) &&
      raw.steps[0].evidence[0].Id === 7,
  );
  const pack = JSON.parse(await download('JSON package'));
  check(
    'Handover JSON retains exact procedure version, timestamps and requested limit',
    pack.run.procedure.version.number === 1 &&
      pack.run.steps[0].finishedAt === raw.steps[0].finishedAt &&
      pack.run.steps[0].collection.requestedRowLimit === 100,
  );
  let html = await download('Printable report');
  check(
    'Actual HTML download includes the same bounded-collection notice',
    html.includes(document.querySelector('.step-inspector .collection-limit-notice').textContent),
  );
  await select('history');
  html = await download('Printable report');
  check(
    'Task history reports its recorded 50-row request in UI and HTML',
    document
      .querySelector('.step-inspector .collection-limit-notice')
      .textContent.includes('Requested row limit: 50') && html.includes('Requested row limit: 50'),
  );
  await select('legacy');
  html = await download('Printable report');
  check(
    'Legacy UI and HTML explicitly lack recorded limits without inferring 100',
    document
      .querySelector('.step-inspector .collection-limit-notice')
      .textContent.includes('limit was not recorded') &&
      html.includes('limit was not recorded') &&
      !html.includes('Requested row limit:'),
  );
  await select('failed');
  html = await download('Printable report');
  check(
    'Failed read retains error and does not claim captured collection metadata',
    document
      .querySelector('.step-inspector')
      .textContent.includes('Synthetic source unavailable') &&
      !document.querySelector('.step-inspector .collection-limit-notice') &&
      !html.includes('Requested row limit:'),
  );
  await select('pending');
  html = await download('Printable report');
  check(
    'Pending observation does not present an unperformed request as recorded evidence',
    !document.querySelector('.step-inspector .collection-limit-notice') &&
      html.includes('No result recorded.') &&
      !html.includes('Requested row limit:'),
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
