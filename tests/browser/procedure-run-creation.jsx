import React, { act, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ProcedureLibrary } from '../../src/procedures/ProcedureLibrary';
import { RunDetail } from '../../src/features/runbooks/RunDetail';
import { procedureBodySchema, procedureSummary } from '../../shared/procedure';
import { summarize } from '../../shared/runbook';
import '../../src/styles.css';
import '../../src/layout/WaypointShell.css';
import '../../src/features/runbooks/runbooks.css';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const realFetch = window.fetch.bind(window),
  results = [],
  calls = [];
const id = '11111111-1111-4111-8111-111111111111',
  at = '2026-09-28T12:00:00.000Z';
const body = procedureBodySchema.parse({
  title: 'Shift check',
  description: 'Synthetic procedure',
  expectedOutcome: '',
  tags: [],
  steps: [
    {
      id: 'identity',
      kind: 'observation',
      title: 'Read identity',
      instruction: '',
      source: 'identity',
      target: '',
    },
  ],
});
const record = {
  format: 1,
  id,
  owner: 'Fixture',
  instance: 'synthetic',
  revision: 2,
  createdAt: at,
  updatedAt: at,
  archived: false,
  versions: [1, 2].map((number) => ({
    number,
    createdAt: at,
    createdBy: 'Fixture',
    changeNote: 'Saved',
    body: { ...body, title: 'Shift check v' + number },
  })),
};
let records = [],
  fault = 'transport',
  historyStatus = 200,
  emptyHistory = false,
  holdPost = false,
  holdRead = false,
  release,
  setActive;
function makeRun(version) {
  return {
    version: 1,
    id: crypto.randomUUID(),
    owner: 'Fixture',
    instance: 'synthetic',
    template: 'observe',
    title: version.body.title,
    target: 'Instance',
    createdAt: at,
    updatedAt: at,
    status: 'active',
    needsRestore: false,
    procedure: { id, version: structuredClone(version) },
    steps: version.body.steps.map((step) => ({
      kind: 'info',
      title: step.title,
      description: step.instruction,
      status: 'pending',
      attempts: 0,
      procedureStep: step,
    })),
    events: [],
  };
}
window.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  calls.push({ url, method, body: options.body ? JSON.parse(options.body) : undefined });
  if (url === '/api/procedures' && method === 'GET')
    return Response.json([procedureSummary(record)]);
  if (url === '/api/procedures/' + id && method === 'GET') return Response.json(record);
  if (url === '/api/procedures/' + id + '/run' && method === 'POST') {
    const run = makeRun(record.versions.find((v) => v.number === JSON.parse(options.body).version));
    if (['transport', 'malformed', 'shape', 503, 200].includes(fault)) records.push(run);
    const respond = () => {
      if (fault === 'transport') throw new TypeError('Synthetic response lost after saving plan');
      if (fault === 'shape') return Response.json({}, { status: 201 });
      if (fault === 'malformed') return new Response('truncated', { status: 201 });
      return Response.json(fault === 200 ? run : { error: 'Synthetic refusal ' + fault }, {
        status: fault === 200 ? 201 : fault,
      });
    };
    if (holdPost)
      return new Promise((resolve, reject) => {
        release = () => {
          try {
            resolve(respond());
          } catch (e) {
            reject(e);
          }
        };
      });
    return respond();
  }
  if (url === '/api/runs' && method === 'GET') {
    const respond = () =>
      Response.json(
        historyStatus === 'shape'
          ? [{}]
          : historyStatus === 200
            ? emptyHistory
              ? []
              : records.map(summarize)
            : { error: 'Synthetic history ' + historyStatus },
        { status: historyStatus === 'shape' ? 200 : historyStatus },
      );
    if (holdRead)
      return new Promise((resolve) => {
        release = () => resolve(respond());
      });
    return respond();
  }
  throw Error('Unexpected request ' + url);
};
function App() {
  const [active, changeActive] = useState(true),
    [opened, setOpened] = useState();
  setActive = changeActive;
  useEffect(() => {
    const handler = (e) => {
      setOpened(records.find((r) => r.id === e.detail));
    };
    window.addEventListener('waypoint-run-created', handler);
    return () => window.removeEventListener('waypoint-run-created', handler);
  }, []);
  return (
    <main style={{ padding: 16 }}>
      <h1>Procedure run creation recovery</h1>
      <p>Synthetic records only. No native or durable writes.</p>
      <div className="inline-actions">
        <button
          onClick={() => {
            fault = 'transport';
          }}
        >
          Lose next response
        </button>
        <button
          onClick={() => {
            historyStatus = 503;
          }}
        >
          Refuse history
        </button>
        <button
          onClick={() => {
            historyStatus = 200;
            emptyHistory = false;
          }}
        >
          Allow history
        </button>
        <button
          onClick={() => {
            historyStatus = 403;
          }}
        >
          Deny history
        </button>
        <button
          onClick={() => {
            historyStatus = 200;
            emptyHistory = true;
          }}
        >
          Empty history
        </button>
        <button
          onClick={() => {
            fault = 409;
          }}
        >
          Refuse next creation
        </button>
        <button onClick={() => location.reload()}>Reset fixture</button>
        <button onClick={() => changeActive((a) => !a)}>Leave / return</button>
      </div>
      <div hidden={!active}>
        <ProcedureLibrary active={active} />
      </div>
      {opened && (
        <RunDetail
          run={opened}
          busy={false}
          onAction={async () => ({ ok: false, error: 'Fixture executes no steps.' })}
        />
      )}
    </main>
  );
}
const root = createRoot(document.getElementById('probe'));
const button = (text) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const create = () => button('Create run from version 2');
const recovery = () => document.querySelector('.procedure-run-recovery');
const posts = () => calls.filter((c) => c.method === 'POST');
const tick = () => act(async () => new Promise((r) => setTimeout(r, 10)));
async function settle(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await tick();
  }
  throw Error('Fixture did not settle');
}
const click = async (b) => {
  if (!b) throw Error('Missing button');
  await act(async () => b.click());
  await tick();
};
const check = (name, pass) => results.push({ name, pass: !!pass });
async function reset() {
  records = [];
  calls.length = 0;
  fault = 'transport';
  historyStatus = 200;
  emptyHistory = false;
  holdPost = false;
  holdRead = false;
  release = undefined;
  await act(async () => root.render(<App key={Math.random()} />));
  await settle(() => !!document.querySelector('.procedure-option'));
  await click(document.querySelector('.procedure-option'));
  await settle(() => !!create());
}
async function version(number) {
  await act(async () => {
    const select = document.querySelector('.procedure-toolbar select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(
      select,
      String(number),
    );
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await tick();
}
async function suite() {
  for (const kind of ['transport', 'malformed', 'shape', 503]) {
    await reset();
    fault = kind;
    await click(create());
    await click(create());
    check(
      kind + ' uncertainty prevents duplicate creation and does not automatically read history',
      posts().length === 1 &&
        create().disabled &&
        !!recovery() &&
        !calls.some((c) => c.url === '/api/runs'),
    );
  }
  await reset();
  fault = 409;
  await click(create());
  check(
    'Definite refusal retains retry without claiming uncertainty',
    !create().disabled && !recovery() && records.length === 0,
  );
  await reset();
  holdPost = true;
  await click(create());
  const count = calls.length;
  await click(create());
  check(
    'Pending creation locks version selection and rejects double click',
    calls.length === count && document.querySelector('.procedure-toolbar select').disabled,
  );
  await act(async () => release());
  await tick();
  await version(1);
  const otherEnabled = !button('Create run from version 1').disabled;
  await version(2);
  check(
    'Uncertainty is bound to exact immutable version and survives switching',
    otherEnabled && create().disabled && recovery().textContent.includes('version 2'),
  );
  await click(button('Check saved runs'));
  check(
    'Successful history read does not unlock creation or infer a match',
    create().disabled &&
      recovery().textContent.includes('not automatically matched') &&
      recovery().querySelectorAll('li').length === 1 &&
      posts().length === 1,
  );
  historyStatus = 403;
  await click(button('Check saved runs'));
  check(
    'Denied history clears prior summaries and keeps creation blocked',
    !recovery().querySelector('li') &&
      !button('I checked saved runs; allow another plan') &&
      create().disabled,
  );
  historyStatus = 'shape';
  await click(button('Check saved runs'));
  check(
    'Malformed history cannot publish unusable rows or authorize another plan',
    !recovery().querySelector('li') &&
      create().disabled &&
      !button('I checked saved runs; allow another plan'),
  );
  historyStatus = 404;
  await click(button('Check saved runs'));
  check(
    'Missing history never retains cached summaries or unlocks',
    !recovery().querySelector('li') && create().disabled,
  );
  historyStatus = 200;
  emptyHistory = true;
  await click(button('Check saved runs'));
  check(
    'Empty history remains uncertain and requires explicit acknowledgement',
    create().disabled &&
      recovery().textContent.includes('absent run does not prove') &&
      !!button('I checked saved runs; allow another plan'),
  );
  await click(button('I checked saved runs; allow another plan'));
  check(
    'Acknowledgement permits deliberate new plan without posting automatically',
    !create().disabled && !recovery() && posts().length === 1,
  );
  await reset();
  await click(create());
  await click(button('Check saved runs'));
  await act(async () => setActive(false));
  await tick();
  await act(async () => setActive(true));
  await settle(() => !button('Check saved runs').disabled);
  check(
    'Leaving and returning discards history cache but retains uncertainty',
    !recovery().querySelector('li') && create().disabled,
  );
  holdRead = true;
  await click(button('Check saved runs'));
  await act(async () => setActive(false));
  await act(async () => release());
  await tick();
  await act(async () => setActive(true));
  await settle(() => !button('Check saved runs').disabled);
  check(
    'Late history response from a departed page cannot restore cache or approval',
    !recovery().querySelector('li') &&
      !button('I checked saved runs; allow another plan') &&
      create().disabled,
  );
  holdRead = false;
  await click(button('Check saved runs'));
  await click(button('Open run'));
  check(
    'Opened real RunDetail identifies exact procedure and saved version without running steps',
    document.querySelector('.run-procedure-identity')?.textContent.includes(id + ' - version 2') &&
      posts().length === 1 &&
      records[0].steps.every((s) => s.status === 'pending'),
  );
  await reset();
  fault = 200;
  await click(create());
  check(
    'Known success keeps ordinary run opening and immutable identity',
    !!document.querySelector('.run-procedure-identity') && !recovery() && posts().length === 1,
  );
  await reset();
  await click(create());
  historyStatus = 503;
  await click(button('Check saved runs'));
  check(
    'Transient history failure retains recovery and does not replay creation',
    recovery().querySelector('[role=alert]')?.textContent.includes('Synthetic history 503') &&
      create().disabled &&
      !button('I checked saved runs; allow another plan') &&
      posts().length === 1,
  );
  return { results, nativeCalls: 0, appliedWrites: 0 };
}
if (new URLSearchParams(location.search).has('manual')) root.render(<App />);
else
  suite()
    .then((report) => {
      document.getElementById('result').textContent = JSON.stringify(report, null, 2);
      return realFetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
    })
    .catch((error) => {
      const report = {
        error: String(error),
        stack: error.stack,
        results,
        nativeCalls: 0,
        appliedWrites: 0,
      };
      document.getElementById('result').textContent = JSON.stringify(report, null, 2);
      realFetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
    });
