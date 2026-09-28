import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window);
const results = [],
  requests = [];
window.fetch = async (input, options = {}) => {
  const url = String(input),
    method = options.method ?? 'GET';
  requests.push({ url, method });
  const body =
    url === '/api/session' ? { info: { username: 'fixture-operator' }, csrf: 'fixture-only' } : [];
  const allowed = method === 'GET' && ['/api/session', '/api/runs', '/api/commands'].includes(url);
  return new Response(JSON.stringify(allowed ? body : { error: 'Unexpected fixture request.' }), {
    status: allowed ? 200 : 403,
    headers: { 'Content-Type': 'application/json' },
  });
};
const root = createRoot(document.getElementById('probe'));
const check = (name, pass) => results.push({ name, pass: !!pass });
const dialog = (title) =>
  [...document.querySelectorAll('#probe dialog')].find(
    (node) => node.querySelector('h2')?.textContent === title,
  );
const button = (label, scope = document.getElementById('probe')) =>
  [...scope.querySelectorAll('button')].find((node) => node.textContent.trim() === label);
const click = async (node) => act(async () => node.click());
async function waitFor(condition) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  }
  throw new Error('Actual App did not finish the expected asynchronous render.');
}
async function finder() {
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })),
  );
}
async function navigate(name) {
  await finder();
  await click(button(name, dialog('Find a tool')));
}
async function hash(page) {
  await act(async () => {
    location.hash = page;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}
async function fill(node, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function suite() {
  location.hash = 'runbooks';
  await act(async () => root.render(<App />));
  await waitFor(() => !!button('New run') && !button('New run').disabled);
  check(
    'actual App loads run queue without a native modal',
    !!button('New run') && !document.querySelector('dialog:modal'),
  );
  await click(button('New run'));
  const chooser = dialog('Choose a runbook');
  check('runbook chooser opens as a native modal', chooser?.matches(':modal'));
  await finder();
  check(
    'tool finder opens above the retained chooser',
    dialog('Find a tool')?.matches(':modal') && chooser.matches(':modal'),
  );
  await click(button('Command history', dialog('Find a tool')));
  await waitFor(() => !!document.querySelector('.command-history-layout'));
  check(
    'navigation closes and hides retained dialog without removing it',
    chooser.isConnected && !chooser.open && chooser.hidden && !!chooser.closest('[hidden]'),
  );
  check(
    'new page has no modal left making it inert',
    !document.querySelector('dialog:modal') && !!document.querySelector('.command-history-layout'),
  );
  const nextPageButton = button('Refresh history');
  const focusTarget = nextPageButton ?? document.querySelector('.command-history-stats');
  focusTarget.tabIndex = 0;
  focusTarget.focus();
  check(
    'new page accepts focus after retained modal suspension',
    document.activeElement === focusTarget,
  );
  await navigate('Runbooks');
  check(
    'returning reopens same chooser without resetting its component',
    dialog('Choose a runbook') === chooser && chooser.matches(':modal') && !chooser.hidden,
  );
  await click(chooser.querySelector('[aria-label="Close dialog"]'));
  check(
    'explicit close still removes the chooser',
    !dialog('Choose a runbook') && !document.querySelector('dialog:modal'),
  );
  await click(button('Create observation report'));
  const editor = document.querySelector('dialog:modal');
  const title = editor.querySelector('input:not([type="checkbox"])');
  await fill(title, 'Read-only preflight before handover');
  const source = editor.querySelector('input[type="checkbox"]');
  await click(source);
  const selected = source.checked;
  await navigate('Command history');
  check(
    'observation plan is retained but ceases to be modal away from Runs',
    editor.isConnected &&
      !editor.open &&
      editor.hidden &&
      title.value === 'Read-only preflight before handover',
  );
  await navigate('Runbooks');
  check(
    'returning preserves unsaved plan title and source selection',
    editor.matches(':modal') &&
      title.value === 'Read-only preflight before handover' &&
      source.checked === selected,
  );
  check('returned editor receives focus', editor.contains(document.activeElement));
  await hash('command-history');
  check(
    'direct hash navigation also suspends retained native dialog',
    !editor.open && editor.hidden && !document.querySelector('dialog:modal'),
  );
  await hash('runbooks');
  check(
    'direct return restores the same unsaved plan',
    editor.matches(':modal') &&
      title.value === 'Read-only preflight before handover' &&
      source.checked === selected,
  );
  await act(async () => editor.dispatchEvent(new Event('cancel', { cancelable: true })));
  check(
    'ordinary modal cancel handler still closes the editor',
    !editor.isConnected && !document.querySelector('dialog:modal'),
  );
  check(
    'navigation does not create runs or issue native requests',
    requests.every(
      (item) =>
        item.method === 'GET' && ['/api/session', '/api/runs', '/api/commands'].includes(item.url),
    ),
  );
}
(async () => {
  let error;
  try {
    await suite();
  } catch (caught) {
    error = caught.stack || String(caught);
  }
  const report = {
    results,
    error,
    nativeCalls: 0,
    appliedWrites: 0,
    limitations:
      'Synthetic transport. Cancel handler exercised; native keyboard Escape is checked separately.',
  };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await reportFetch('/_test/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
})();
