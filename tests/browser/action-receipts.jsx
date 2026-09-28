import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ReviewedAction } from '../../src/commands/ReviewedAction';
import { Operations } from '../../src/commands/Operations';
import {
  actionReview as review,
  actionCandidate as candidate,
  actionTarget as target,
} from './action-records';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window),
  calls = [],
  results = [];
let generation = 0,
  executeCode,
  readCode,
  readStatus,
  reconcileCode,
  holdUrl,
  release,
  wrongId,
  conflict,
  settled;
window.fetch = async (url, init = {}) => {
  const method = init.method ?? 'GET';
  calls.push({ url, method });
  let code = 200,
    body;
  if (url === '/api/iris' && method === 'POST') {
    const input = JSON.parse(init.body);
    if (input.method !== 'GET')
      throw Error('Native writes are forbidden in this synthetic fixture');
    body = {
      status: 200,
      data:
        input.path === '/v2/web-apps'
          ? [{ Name: target, Description: 'Training route' }]
          : { ...review.before, ...(conflict ? { Description: 'Changed since review' } : {}) },
      console: [],
    };
  } else if (url === '/api/commands/review' && method === 'POST') body = review;
  else if (url === '/api/commands/' + review.id + '/execute' && method === 'POST') {
    code = executeCode;
    body = { ...review, status: 'uncertain', message: 'Protected uncertain receipt' };
  } else if (url === '/api/commands/' + review.id + '/reconcile' && method === 'POST') {
    code = reconcileCode;
    body = { ...review, status: 'verified', message: 'Verified synthetic receipt' };
  } else if (url === '/api/commands/' + review.id && method === 'GET') {
    code = readCode;
    body = {
      ...review,
      id: wrongId ? '99999999-9999-4999-8999-999999999999' : review.id,
      status: readStatus,
      message: 'Protected current receipt',
    };
  } else throw Error('Unexpected synthetic request ' + method + ' ' + url);
  const respond = () =>
    Response.json(code === 200 ? body : { error: 'Synthetic ' + method + ' refusal ' + code }, {
      status: code,
    });
  if (holdUrl === url) {
    holdUrl = undefined;
    return new Promise((resolve) => {
      release = () => resolve(respond());
    });
  }
  return respond();
};
const root = createRoot(document.getElementById('probe'));
const button = (name) =>
  [...document.querySelectorAll('#probe button')].find((node) => node.textContent.trim() === name);
const text = () => document.getElementById('probe').textContent;
const count = (ending) => calls.filter((call) => call.url.endsWith(ending)).length;
const gets = () =>
  calls.filter((call) => call.url === '/api/commands/' + review.id && call.method === 'GET').length;
const check = (name, pass) => results.push({ name, pass: !!pass });
async function tick() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
}
async function click(node) {
  if (!node) throw Error('Missing action control');
  await act(async () => node.click());
  await tick();
}
async function settle(condition) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await tick();
  }
  throw Error('Action fixture did not settle');
}
async function input(node, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await tick();
}
async function reset(kind) {
  executeCode = readCode = 200;
  readStatus = 'uncertain';
  reconcileCode = 403;
  wrongId = conflict = false;
  settled = 0;
  holdUrl = release = undefined;
  calls.length = 0;
  await act(async () =>
    root.render(
      kind === 'ReviewedAction' ? (
        <ReviewedAction
          key={++generation}
          candidate={candidate}
          title="Training action"
          onClose={() => {}}
          onSettled={() => settled++}
        />
      ) : (
        <Operations key={++generation} area="apps" operator="Synthetic operator" />
      ),
    ),
  );
  if (kind === 'Operations') await settle(() => document.querySelector('.target-options button'));
}
async function prepare(kind) {
  if (kind === 'ReviewedAction') await click(button('Prepare review'));
  else {
    await click(document.querySelector('.target-options button'));
    await click(button('Prepare deletion'));
    await click(button('Review command'));
  }
  await input(
    document.querySelector(
      kind === 'ReviewedAction'
        ? '.reviewed-action form input'
        : '[aria-label="Confirm command target"]',
    ),
    target,
  );
}
async function suite() {
  for (const kind of ['ReviewedAction', 'Operations']) {
    for (const path of ['execute', 'reconcile'])
      for (const code of [200, 403, 404, 503]) {
        await reset(kind);
        await prepare(kind);
        executeCode = path === 'execute' ? 503 : 200;
        readCode = code;
        await click(button('Execute once'));
        if (path === 'reconcile') await click(button('Read current result'));
        const allowed = code === 200;
        check(
          kind +
            ' ' +
            path +
            ' recovery GET' +
            code +
            ' retains consumed ID without replayable controls',
          count('/execute') === 1 &&
            gets() === 1 &&
            text().includes(review.id) &&
            !button('Execute once') &&
            !button('Prepare review') &&
            !button('Review command') &&
            (allowed
              ? text().includes('Protected current receipt') && !button('Retry receipt access')
              : !text().includes('Protected before evidence') &&
                !text().includes('Protected uncertain receipt') &&
                !button('Read current result') &&
                !!button('Retry receipt access') &&
                document.activeElement?.classList.contains('notice')),
        );
        if (!allowed) {
          const reconBefore = count('/reconcile');
          readCode = 200;
          readStatus = 'reviewed';
          await click(button('Retry receipt access'));
          check(
            kind +
              ' ' +
              path +
              ' GET' +
              code +
              ' recovery uses GET only and cannot reenable dispatch for restored reviewed status',
            gets() === 2 &&
              count('/execute') === 1 &&
              count('/reconcile') === reconBefore &&
              text().includes('Protected current receipt') &&
              !button('Execute once') &&
              !button('Prepare review') &&
              !button('Review command') &&
              !button('Retry receipt access') &&
              text().includes('Execution outcome unconfirmed') &&
              !text().includes('Ready for confirmation') &&
              document.activeElement?.textContent.includes('Protected current receipt'),
          );
        }
      }
    await reset(kind);
    await prepare(kind);
    executeCode = 503;
    readStatus = 'reviewed';
    holdUrl = '/api/commands/' + review.id;
    const executeButton = button('Execute once');
    await act(async () => {
      executeButton.click();
      executeButton.click();
    });
    await settle(() => release);
    check(
      kind +
        ' pending execution-recovery GET hides evidence and prevents duplicate execution or receipt retries',
      count('/execute') === 1 &&
        gets() === 1 &&
        !text().includes('Protected before evidence') &&
        !button('Execute once') &&
        !button('Prepare review') &&
        button('Retry receipt access')?.disabled &&
        document.activeElement?.classList.contains('notice'),
    );
    await act(async () => release());
    await tick();
    check(
      kind + ' successful initial recovery focuses the returned receipt without reopening execute',
      text().includes('Protected current receipt') &&
        document.activeElement?.textContent.includes('Protected current receipt') &&
        text().includes('Execution outcome unconfirmed') &&
        !text().includes('Ready for confirmation') &&
        !button('Execute once') &&
        !button('Retry receipt access'),
    );
    await reset(kind);
    await prepare(kind);
    await click(button('Execute once'));
    reconcileCode = 503;
    await click(button('Read current result'));
    check(
      kind + ' temporary reconciliation failure retains historical receipt without new GET',
      gets() === 0 &&
        text().includes('Protected uncertain receipt') &&
        !!button('Read current result') &&
        !button('Retry receipt access'),
    );
    await reset(kind);
    await prepare(kind);
    await click(button('Execute once'));
    reconcileCode = 404;
    await click(button('Read current result'));
    check(
      kind + ' missing reconciliation response rechecks the same authorized receipt without replay',
      gets() === 1 &&
        count('/execute') === 1 &&
        count('/reconcile') === 1 &&
        text().includes('Protected current receipt') &&
        !button('Retry receipt access') &&
        !button('Execute once'),
    );
    await reset(kind);
    await prepare(kind);
    executeCode = 503;
    wrongId = true;
    await click(button('Execute once'));
    check(
      kind + ' mismatched receipt cannot replace consumed identity or expose its evidence',
      text().includes(review.id) &&
        !text().includes('99999999-9999-4999-8999-999999999999') &&
        !text().includes('Protected before evidence') &&
        !!button('Retry receipt access') &&
        !button('Execute once'),
    );
    await reset(kind);
    await prepare(kind);
    executeCode = 503;
    holdUrl = '/api/commands/' + review.id;
    await click(button('Execute once'));
    await settle(() => release);
    const finishOld = release;
    await act(async () => root.render(<section>New workspace</section>));
    await act(async () => finishOld());
    await tick();
    check(
      kind + ' unmounted receipt read cannot restore old evidence or invoke completion callback',
      text() === 'New workspace' && settled === 0 && count('/execute') === 1,
    );
  }
  await reset('Operations');
  await prepare('Operations');
  conflict = true;
  await click(button('Execute once'));
  check(
    'Operations pre-dispatch conflict preserves preparation and never creates a consumed receipt',
    count('/execute') === 0 &&
      gets() === 0 &&
      !!button('Review command') &&
      !button('Execute once') &&
      !button('Retry receipt access') &&
      text().includes('No command was sent'),
  );
}
(async () => {
  let error;
  try {
    await suite();
  } catch (cause) {
    error = cause.stack;
  }
  const report = { results, error, nativeCalls: 0, appliedWrites: 0 };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await reportFetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
})();
