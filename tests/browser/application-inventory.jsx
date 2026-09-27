import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ApplicationWorkspace } from '../../src/applications/ApplicationWorkspace';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window);
const results = [],
  requests = [];
const status = { inventory: 200, configuration: 200, namespace: 200, resource: 200 };
let exported,
  emptyInventory = false,
  holdInventory = false,
  releaseInventory;
URL.createObjectURL = (blob) => {
  exported = blob;
  return 'blob:synthetic-application-export';
};
URL.revokeObjectURL = () => {};
HTMLAnchorElement.prototype.click = () => {};
window.fetch = async (_url, init) => {
  const command = JSON.parse(init.body);
  const source = {
    '/v2/web-apps': 'inventory',
    '/v2/web-app': 'configuration',
    '/v2/namespace': 'namespace',
    '/v2/security/resource': 'resource',
  }[command.path];
  if (!source || command.method !== 'GET')
    throw new Error('Read-only application test received unexpected operation.');
  requests.push({ source, status: status[source] });
  const data =
    source === 'inventory'
      ? emptyInventory
        ? []
        : [
            { Name: '/fixture-a', NameSpace: 'InventoryNamespace' },
            { Name: '/fixture-b', NameSpace: 'InventoryNamespace' },
          ]
      : source === 'configuration'
        ? {
            Name: command.query.name,
            NameSpace: 'DetailNamespace',
            Resource: '%Fixture',
            Enabled: true,
            DispatchClass: 'Historical.ConfigClass',
          }
        : source === 'namespace'
          ? { Name: 'DetailNamespace', Globals: 'HistoricalDatabase' }
          : { Name: '%Fixture', PublicPermission: '' };
  const response =
    status[source] === 200
      ? Response.json({ data, status: 200, console: [] })
      : Response.json({ error: `${source} denied ${status[source]}` }, { status: status[source] });
  if (source === 'inventory' && holdInventory)
    return new Promise((resolve) => {
      releaseInventory = () => resolve(response);
    });
  return response;
};
const root = createRoot(document.getElementById('probe'));
const content = () => document.getElementById('probe').textContent;
const check = (name, pass) => results.push({ name, pass: !!pass });
function button(label) {
  const found = [...document.querySelectorAll('#probe button')].find(
    (node) => node.textContent.trim() === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
const click = async (label) => act(async () => button(label).click());
async function settle(ready, label) {
  for (let n = 0; n < 100; n++) {
    if (ready()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  throw new Error(`Bounded settle failed: ${label}`);
}
async function capture() {
  await click('Export evidence');
  return JSON.parse(await exported.text());
}
async function publish(report) {
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await reportFetch('/_test/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
}
async function run() {
  await act(async () => root.render(<ApplicationWorkspace />));
  await settle(() => content().includes('InventoryNamespace'), 'inventory');
  status.inventory = 500;
  await click('Refresh inventory');
  await settle(() => content().includes('inventory denied 500'), 'inventory500');
  check(
    'inventory500 preserves last successful rows and collection time',
    content().includes('InventoryNamespace') && content().includes('Inventory read'),
  );
  status.inventory = 403;
  await click('Refresh inventory');
  await settle(() => content().includes('inventory denied 403'), 'inventory403');
  check(
    'inventory403 clears rows/time and presents unavailable rather than empty success',
    !content().includes('InventoryNamespace') &&
      !content().includes('Inventory read') &&
      content().includes('Application inventory unavailable') &&
      !content().includes('No matching applications'),
  );
  status.inventory = 200;
  holdInventory = true;
  await click('Refresh inventory');
  check(
    'inventory denial remains visible during an explicit retry',
    content().includes('Application inventory: inventory denied 403'),
  );
  holdInventory = false;
  await act(async () => releaseInventory());
  await settle(() => content().includes('InventoryNamespace'), 'recovery');
  check(
    'successful retry clears the separate inventory error',
    !content().includes('inventory denied 403'),
  );

  await click('/fixture-a');
  await settle(() => !button('Export evidence').disabled, 'detail');
  await click('Compare');
  await click('Keep current observation as baseline');
  const saved = await capture();
  status.configuration = 403;
  await click('Refresh observation');
  await settle(() => !button('Export evidence').disabled, 'configuration403');
  const denied = await capture();
  check(
    'configuration403 replaces current evidence but preserves explicitly historical baseline and original timestamp',
    denied.dossier.configuration.outcome === 'denied' &&
      !denied.dossier.configuration.data &&
      denied.baseline.configuration.data.DispatchClass === 'Historical.ConfigClass' &&
      denied.baseline.capturedAt === saved.dossier.capturedAt &&
      content().includes('Both native application configurations must be available.'),
  );
  status.configuration = 200;
  status.namespace = 403;
  await click('Refresh observation');
  await settle(() => !button('Export evidence').disabled, 'namespace403');
  const partial = await capture();
  check(
    'partial namespace denial preserves independently successful configuration/resource and historical baseline',
    partial.dossier.configuration.outcome === 'read' &&
      partial.dossier.entryResource.outcome === 'read' &&
      partial.dossier.namespace.outcome === 'denied' &&
      !partial.dossier.namespace.data &&
      partial.baseline.namespace.data.Globals === 'HistoricalDatabase',
  );

  await click('All applications');
  emptyInventory = true;
  await click('Refresh inventory');
  await settle(() => content().includes('No matching applications'), 'successful empty inventory');
  check(
    'successfully empty inventory keeps collection time and does not claim unavailable',
    content().includes('Inventory read') &&
      !content().includes('Application inventory unavailable'),
  );
  await act(async () => root.render(null));
  status.inventory = 500;
  await act(async () => root.render(<ApplicationWorkspace />));
  await settle(() => content().includes('inventory denied 500'), 'initial500');
  check(
    'initial500 without an earlier capture reports unavailable rather than zero applications',
    content().includes('Application inventory unavailable') &&
      !content().includes('No matching applications') &&
      !content().includes('Inventory read'),
  );
  await act(async () => root.render(null));
  await publish({ results, requests, nativeCalls: 0, appliedWrites: 0 });
}
run().catch(async (error) =>
  publish({ error: error.stack, results, requests, nativeCalls: 0, appliedWrites: 0 }),
);
