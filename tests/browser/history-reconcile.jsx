import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CommandHistory } from '../../src/commands/CommandHistory';
import { commandA as a, commandB as b, summary } from './history-records';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window),
  results = [],
  calls = [],
  exports = [];
let generation = 0,
  listCode,
  detailCode,
  postCode,
  returned,
  listed,
  holdUrl,
  release;
window.fetch = async (url, init = {}) => {
  const method = init.method ?? 'GET';
  calls.push({ url, method });
  let code, body;
  if (method === 'POST' && url === '/api/commands/' + a.id + '/reconcile') {
    code = postCode;
    body = { ...a, status: 'verified', message: 'Reconciled synthetic result' };
  } else if (method === 'GET' && url === '/api/commands') {
    code = listCode;
    body = listed.map(summary);
  } else if (method === 'GET' && url === '/api/commands/' + a.id) {
    code = detailCode;
    body = returned;
  } else if (method === 'GET' && url === '/api/commands/' + b.id) {
    code = 200;
    body = b;
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
URL.createObjectURL = (blob) => {
  exports.push(blob);
  return 'blob:synthetic-history';
};
URL.revokeObjectURL = () => {};
HTMLAnchorElement.prototype.click = function () {};
const root = createRoot(document.getElementById('probe'));
const button = (name) =>
  [...document.querySelectorAll('#probe button')].find((node) => node.textContent.trim() === name);
const row = (id) =>
  [...document.querySelectorAll('.history-item')].find(
    (node) => node.querySelector('strong')?.textContent === (id === a.id ? a.title : b.title),
  );
const title = () => document.querySelector('.command-history-detail h2')?.textContent;
const check = (name, pass) => results.push({ name, pass: !!pass });
async function tick() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
}
async function click(node) {
  if (!node) throw Error('Missing history control');
  await act(async () => node.click());
  await tick();
}
async function settle(condition) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await tick();
  }
  throw Error('History fixture did not settle');
}
async function reset() {
  listCode = detailCode = postCode = 200;
  returned = a;
  listed = [a, b];
  holdUrl = release = undefined;
  calls.length = exports.length = 0;
  await act(async () => root.render(<CommandHistory key={++generation} />));
  await settle(() => row(a.id));
  await click(row(a.id));
}
const posts = () => calls.filter((call) => call.method === 'POST').length;
const gets = () =>
  calls.filter((call) => call.method === 'GET' && call.url === '/api/commands/' + a.id).length;
async function input(node, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await tick();
}
async function suite() {
  for (const post of [403, 404])
    for (const read of [200, 403, 404, 503]) {
      await reset();
      postCode = post;
      detailCode = read;
      await click(button('Read current state'));
      const allowed = read === 200,
        temporary = read === 503;
      check(
        'POST' + post + ' rechecks GET' + read + ' before allowing command exports',
        gets() === 2 &&
          posts() === 1 &&
          (allowed
            ? title() === a.title && !!button('Export result') && !!row(a.id)
            : !title() && !button('Export result') && !row(a.id)) &&
          (temporary ? !!button('Retry record access') : !button('Retry record access')) &&
          !!row(b.id),
      );
    }
  for (const code of [403, 404]) {
    await reset();
    detailCode = code;
    await click(button('Refresh'));
    check(
      'Explicit record GET' + code + ' removes detail and matching index entry',
      !title() &&
        !row(a.id) &&
        !!row(b.id) &&
        !button('Export result') &&
        document.body.textContent.includes('Synthetic GET refusal ' + code),
    );
  }
  await reset();
  detailCode = 503;
  await click(button('Refresh'));
  check(
    'Ordinary temporary refresh retains historical result and export',
    title() === a.title &&
      !!button('Export result') &&
      document.body.textContent.includes('Synthetic GET refusal 503'),
  );
  await reset();
  detailCode = 503;
  await click(row(a.id));
  check(
    'Reopening the selected command after GET503 retains its historical evidence',
    title() === a.title &&
      !!button('Export result') &&
      document.body.textContent.includes('Synthetic GET refusal 503'),
  );
  for (const code of [403, 503]) {
    await reset();
    listCode = code;
    await click(button('Refresh'));
    check(
      'ListGET' + code + ' does not skip an independently authorized detail read',
      gets() === 2 &&
        title() === a.title &&
        !!button('Export result') &&
        (code === 503 || !row(a.id)),
    );
  }
  await reset();
  listed = [b];
  detailCode = 403;
  await click(button('Refresh'));
  check(
    'Filtered index followed by denied detail removes old selected evidence',
    !title() && !button('Export result') && !!row(b.id) && gets() === 2,
  );
  await reset();
  holdUrl = '/api/commands';
  await click(button('Refresh'));
  await settle(() => release);
  await click(row(b.id));
  await act(async () => release());
  await tick();
  check(
    'Refresh of A cannot replace newer selected B after held list finishes',
    title() === b.title && gets() === 1,
  );
  await reset();
  holdUrl = '/api/commands/' + a.id;
  await click(button('Refresh'));
  await settle(() => release);
  await click(row(b.id));
  await act(async () => release());
  await tick();
  check('Already pending refresh detail A cannot replace newer selected B', title() === b.title);
  await reset();
  holdUrl = '/api/commands';
  await click(button('Refresh'));
  await settle(() => release);
  detailCode = 403;
  await click(row(a.id));
  await act(async () => release());
  await tick();
  check(
    'Older list success cannot restore a record after a newer detail refusal',
    !row(a.id) && !title() && !!row(b.id),
  );
  await reset();
  postCode = 403;
  detailCode = 503;
  const search = document.querySelector('.command-history-index input');
  await input(search, 'synthetic');
  const dates = [...document.querySelectorAll('input[type="date"]')];
  await input(dates[0], '2026-09-28');
  await input(dates[1], '2026-09-28');
  holdUrl = '/api/commands/' + a.id;
  await click(button('Read current state'));
  await settle(() => release);
  check(
    'Pending recovery hides result/index exports and focuses the opaque-ID notice',
    !title() &&
      !row(a.id) &&
      !button('Export result') &&
      button('Retry record access')?.disabled &&
      document.activeElement?.classList.contains('notice') &&
      document.activeElement.textContent.includes(a.id),
  );
  await click(button('Export filtered index'));
  const pendingExport = await exports.at(-1).text();
  check(
    'Filtered export excludes the unverified record and retains permitted B',
    !pendingExport.includes(a.id) && pendingExport.includes(b.id),
  );
  await act(async () => release());
  await tick();
  await click(button('Refresh'));
  check(
    'Fresh list alone cannot restore temporarily unverified detail/index',
    !title() && !row(a.id) && !!button('Retry record access') && !!row(b.id),
  );
  detailCode = 200;
  returned = {
    ...a,
    title: 'Synthetic renamed A',
    status: 'verified',
    message: 'Fresh verified record',
  };
  await click(button('Retry record access'));
  check(
    'Explicit GET recovery preserves filters and shows the current renamed verified record',
    title() === 'Synthetic renamed A' &&
      document.querySelector('.command-outcome-message').textContent === 'Fresh verified record' &&
      search.value === 'synthetic' &&
      dates.every((node) => node.value === '2026-09-28') &&
      posts() === 1 &&
      !button('Read current state'),
  );
  check(
    'Recovery focuses the restored detail and clears its retry notice',
    document.activeElement === document.querySelector('.command-history-detail') &&
      !button('Retry record access'),
  );
  await click(button('Export filtered index'));
  const recoveredIndex = await exports.at(-1).text();
  check(
    'Recovered index contains summary fields rather than full command evidence',
    recoveredIndex.includes('Synthetic renamed A') &&
      !recoveredIndex.includes('"before"') &&
      !recoveredIndex.includes('"proposed"'),
  );
  for (const code of [400, 503]) {
    await reset();
    postCode = code;
    await click(button('Read current state'));
    check(
      'POST' + code + ' keeps prior result without automatic GET or POST replay',
      title() === a.title && gets() === 1 && posts() === 1 && !button('Retry record access'),
    );
  }
  await reset();
  listCode = 403;
  await click(button('Read current state'));
  check(
    'Successful reconciliation followed by list403 keeps the authorized outcome without labeling POST refused',
    document.querySelector('.command-outcome-message')?.textContent ===
      'Reconciled synthetic result' &&
      !row(a.id) &&
      gets() === 1 &&
      posts() === 1 &&
      !button('Retry record access'),
  );
  await reset();
  postCode = 403;
  returned = b;
  await click(button('Read current state'));
  check(
    'Mismatched GET response cannot become the selected or exportable command',
    !title() &&
      !row(a.id) &&
      !!button('Retry record access') &&
      document.body.textContent.includes('different record'),
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
