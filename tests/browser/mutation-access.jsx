import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Runbooks } from '../../src/pages/Runbooks';
import { ProcedureLibrary } from '../../src/procedures/ProcedureLibrary';
import { summarize, templates } from '../../shared/runbook';
import { procedureSummary } from '../../shared/procedure';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window),
  results = [],
  calls = [];
const root = createRoot(document.getElementById('probe'));
const at = '2026-09-28T12:00:00.000Z';
const runId = '11111111-1111-4111-8111-111111111111';
const procedureId = '22222222-2222-4222-8222-222222222222';
const newId = '33333333-3333-4333-8333-333333333333';
let kind,
  runRecord,
  procedure,
  generation = 0,
  afterPost = false,
  postStatus = 403,
  detailStatus = 200,
  listStatus = 200,
  hold = false,
  release;
const draft = 'Retain this operator draft until access is checked.';
function records() {
  runRecord = {
    version: 1,
    id: runId,
    owner: 'Fixture',
    instance: 'synthetic',
    template: 'task-window',
    title: 'Protected run',
    target: '7',
    createdAt: at,
    updatedAt: at,
    status: 'active',
    needsRestore: false,
    original: false,
    revision: 1,
    events: [],
    steps: templates['task-window'].steps.map((step, index) => ({
      ...step,
      status: index === 0 ? 'done' : 'pending',
      attempts: index === 0 ? 1 : 0,
    })),
  };
  procedure = {
    format: 1,
    id: procedureId,
    owner: 'Fixture',
    instance: 'synthetic',
    revision: 1,
    createdAt: at,
    updatedAt: at,
    archived: false,
    versions: [
      {
        number: 1,
        createdAt: at,
        createdBy: 'Fixture',
        changeNote: 'Saved',
        body: {
          title: 'Protected procedure',
          description: 'Retained observations',
          expectedOutcome: 'Observe health',
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
        },
      },
    ],
  };
}
const refusal = (status) =>
  Response.json({ error: 'Synthetic access response ' + status }, { status });
window.fetch = async (url, init) => {
  calls.push({ url, method: init.method });
  if (init.method === 'POST') {
    afterPost = true;
    if (postStatus !== 200) return refusal(postStatus);
    const body = JSON.parse(init.body);
    if (kind === 'run') {
      runRecord = {
        ...runRecord,
        revision: runRecord.revision + 1,
        notes: [{ id: 'note', at, author: 'Fixture', category: 'observation', text: body.text }],
      };
      return Response.json(runRecord);
    }
    procedure = { ...procedure, revision: procedure.revision + 1 };
    if (url.endsWith('/duplicate')) procedure = { ...procedure, id: newId };
    if (body.body)
      procedure.versions.push({
        number: 2,
        createdAt: at,
        createdBy: 'Fixture',
        changeNote: body.changeNote,
        body: body.body,
      });
    return Response.json(procedure);
  }
  const list = url === '/api/runs' || url === '/api/procedures';
  const response = () => {
    const status = afterPost ? (list ? listStatus : detailStatus) : 200;
    if (status !== 200) return refusal(status);
    if (kind === 'run') return Response.json(list ? [summarize(runRecord)] : runRecord);
    return Response.json(list ? [procedureSummary(procedure)] : procedure);
  };
  if (afterPost && !list && hold)
    return new Promise((resolve) => {
      release = () => resolve(response());
    });
  return response();
};
const check = (name, pass) => results.push({ name, pass: !!pass });
const findButton = (label) => {
  const nodes = [...document.querySelectorAll('#probe button')].filter(
    (node) => node.textContent.trim() === label,
  );
  return nodes.find((node) => node.closest('dialog')) ?? nodes[0];
};
const field = (label) =>
  [...document.querySelectorAll('#probe label')]
    .find((node) => node.textContent.trim().startsWith(label))
    ?.querySelector('input,textarea');
const detail = () => document.querySelector(kind === 'run' ? '.run-detail' : '.procedure-detail');
const hidden = () => !detail() || getComputedStyle(detail()).display === 'none';
const exportButton = () => findButton(kind === 'run' ? 'Export report' : 'Export version');
const draftValue = () => field(kind === 'run' ? 'Add a note' : 'Procedure name')?.value;
const retry = () => (kind === 'run' ? 'Read run again' : 'Read procedure again');
const posts = () => calls.filter((call) => call.method === 'POST').length;
async function click(label) {
  const node = findButton(label);
  if (!node || node.disabled) throw new Error('Unavailable ' + label);
  await act(async () => node.click());
}
async function fill(label, value) {
  const node = field(label);
  if (!node) throw new Error('Missing ' + label);
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
async function settle(test) {
  for (let i = 0; i < 100; i++) {
    if (test()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  throw new Error('Did not settle');
}
async function mount(next) {
  kind = next;
  afterPost = false;
  postStatus = 403;
  detailStatus = 200;
  listStatus = 200;
  hold = false;
  release = undefined;
  calls.length = 0;
  records();
  await act(async () =>
    root.render(
      kind === 'run' ? <Runbooks key={++generation} /> : <ProcedureLibrary key={++generation} />,
    ),
  );
  if (kind === 'procedure') {
    await settle(
      () => !!document.querySelector('.procedure-option') && !findButton('Refresh').disabled,
    );
    await act(async () => document.querySelector('.procedure-option').click());
  }
  await settle(
    () => !!exportButton() && !findButton(kind === 'run' ? 'Refresh runs' : 'Refresh').disabled,
  );
}
async function prepare() {
  if (kind === 'run') await fill('Add a note', draft);
  else {
    await click('Edit latest');
    await fill('Procedure name', draft);
    await fill('Version change note', 'Explain the retained changes.');
  }
}
async function submit() {
  await click(kind === 'run' ? 'Append note' : 'Save new version');
}
async function finished() {
  await settle(() => !findButton(kind === 'run' ? 'Refresh runs' : 'Refresh').disabled);
}
async function suite() {
  for (const target of ['run', 'procedure']) {
    await mount(target);
    await prepare();
    await submit();
    await finished();
    check(
      target + ': denied mutation rechecks detail with GET without replay',
      calls
        .slice(-2)
        .map((call) => call.method)
        .join(',') === 'POST,GET' && posts() === 1,
    );
    check(
      target + ': allowed read retains draft and export',
      !hidden() && draftValue() === draft && !exportButton().disabled,
    );
    for (const status of [403, 404]) {
      await mount(target);
      await prepare();
      detailStatus = status;
      await submit();
      await finished();
      check(
        target + ': detail ' + status + ' removes cached evidence and exports',
        !detail() && !exportButton() && !document.querySelector('dialog') && posts() === 1,
      );
    }
    await mount(target);
    await prepare();
    detailStatus = 503;
    await submit();
    await finished();
    check(
      target + ': transient access failure hides evidence and disables exports',
      hidden() && exportButton().disabled && draftValue() === draft && !!findButton(retry()),
    );
    detailStatus = 200;
    await click(retry());
    await finished();
    check(
      target + ': explicit successful read restores draft without another mutation',
      !hidden() && draftValue() === draft && !exportButton().disabled && posts() === 1,
    );
    await mount(target);
    await prepare();
    hold = true;
    await submit();
    await settle(() => !!release);
    check(
      target + ': held access check hides evidence and blocks further work',
      hidden() && exportButton().disabled && findButton(retry()).disabled && posts() === 1,
    );
    hold = false;
    await act(async () => release());
    await finished();
    await mount(target);
    await prepare();
    postStatus = 200;
    listStatus = 403;
    detailStatus = 403;
    await submit();
    await finished();
    check(
      target +
        ': saved mutation followed by list denial rechecks detail and preserves saved warning',
      !detail() &&
        !exportButton() &&
        posts() === 1 &&
        calls.at(-1).url.endsWith(target === 'run' ? runId : procedureId) &&
        document
          .getElementById('probe')
          .textContent.includes(
            target === 'run' ? 'The action was saved' : 'The procedure was saved',
          ),
    );
    await mount(target);
    await prepare();
    postStatus = 409;
    await submit();
    await finished();
    check(
      target + ': revision conflict retains draft without an access recheck',
      draftValue() === draft && !hidden() && calls.at(-1).method === 'POST' && posts() === 1,
    );
  }
  await mount('procedure');
  await click('Duplicate');
  await fill('New procedure name', 'Independent copy');
  postStatus = 200;
  listStatus = 403;
  detailStatus = 403;
  await click('Create independent copy');
  await finished();
  check(
    'successful duplicate rechecks newly created record rather than old selection',
    calls.at(-1).url === '/api/procedures/' + newId && !detail() && posts() === 1,
  );
  await act(async () => root.unmount());
  return {
    results,
    calls,
    nativeCalls: 0,
    appliedWrites: 0,
    limitations:
      'Actual React components with synthetic transport. Success responses update only fixture data; there are no IRIS requests or durable writes.',
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
    publish({ error: error.stack, results, calls, nativeCalls: 0, appliedWrites: 0 }),
  );
