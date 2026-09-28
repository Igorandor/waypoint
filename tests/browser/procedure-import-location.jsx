import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ProcedureLibrary } from '../../src/procedures/ProcedureLibrary';
import { importBody } from '../fixtures/procedure-import';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window);
const root = createRoot(document.getElementById('probe'));
const results = [],
  writes = [];
window.fetch = async (url, init) => {
  if (url === '/api/procedures' && init.method === 'GET') return Response.json([]);
  if (url === '/api/procedures/import' && init.method === 'POST') {
    writes.push(JSON.parse(init.body));
    return Response.json(
      { error: 'Synthetic import refusal; no procedure saved.' },
      { status: 409 },
    );
  }
  throw Error('Unexpected request ' + url);
};
const button = (name) =>
  [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === name);
const tick = () => act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
const pack = (body) => ({ format: 'waypoint-procedure-1', body });
async function attempt(value, raw = false) {
  const text = raw ? value : JSON.stringify(value, null, 2);
  await act(async () => {
    const area = document.querySelector('dialog textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area, text);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => button('Validate and import').click());
  await tick();
  return {
    text,
    message: document.querySelector('dialog [role=alert]')?.textContent,
    retained: document.querySelector('dialog textarea')?.value === text,
  };
}
const check = (name, pass) => results.push({ name, pass: !!pass });
(async () => {
  await act(async () => root.render(<ProcedureLibrary />));
  await tick();
  await act(async () => button('Import').click());
  const nested = structuredClone(importBody);
  nested.steps[17].items[0].text = 42;
  let result = await attempt(pack(nested));
  check(
    'Nested validation identifies the exact checklist item and keeps pasted input',
    result.message.includes('$.body.steps[17].items[0].text:') &&
      result.message.includes('expected string, received number') &&
      result.retained &&
      writes.length === 0,
  );
  const references = structuredClone(importBody);
  references.steps[15].reference = 'http://example.com/step16';
  references.steps[17].reference = 'javascript:void(0)';
  result = await attempt(pack(references));
  check(
    'Repeated reference errors identify both distinct locations',
    result.message.includes('$.body.steps[15].reference:') &&
      result.message.includes('$.body.steps[17].reference:') &&
      result.retained &&
      writes.length === 0,
  );
  const extra = structuredClone(importBody);
  extra.steps[17].unsupportedSetting = 'unsupported';
  result = await attempt(pack(extra));
  check(
    'Unknown nested properties identify their containing step',
    result.message.includes('$.body.steps[17]: Unrecognized key:') &&
      result.message.includes('unsupportedSetting') &&
      result.retained &&
      writes.length === 0,
  );
  const malicious = '<img data-import-injected="yes" src=x onerror="window.importExecuted=true">';
  result = await attempt({ ...pack(importBody), [malicious]: 'unsupported' });
  check(
    'Root unknown fields and markup in validation messages remain inert text',
    result.message.startsWith('$: Unrecognized key:') &&
      result.message.includes(malicious) &&
      !document.querySelector('[data-import-injected]') &&
      !window.importExecuted &&
      result.retained &&
      writes.length === 0,
  );
  result = await attempt({ ...pack(importBody), format: 'unsupported' });
  check(
    'Unsupported format identifies the envelope field without making a request',
    result.message.includes('$.format:') && result.retained && writes.length === 0,
  );
  const assertion = {
    ...importBody,
    steps: [
      {
        id: 'check',
        kind: 'assertion',
        title: 'Check absent observation',
        instruction: '',
        check: 'capture-present',
        sourceStepId: 'absent',
        expected: false,
      },
    ],
  };
  result = await attempt(pack(assertion));
  check(
    'Semantic step errors retain the step location and original explanation',
    result.message.includes(
      '$.body.steps[0]: An assertion must refer to an earlier observation.',
    ) &&
      result.retained &&
      writes.length === 0,
  );
  result = await attempt('{broken', true);
  check(
    'Malformed JSON remains a clear parse error with original input retained',
    result.message === 'Paste a valid Waypoint procedure JSON document.' &&
      result.retained &&
      writes.length === 0,
  );
  result = await attempt(pack(importBody));
  check(
    'Corrected definition keeps IDs, false flags and references; server refusal keeps the modal and input',
    writes.length === 1 &&
      JSON.stringify(writes[0]) === JSON.stringify(pack(importBody)) &&
      result.message === 'Synthetic import refusal; no procedure saved.' &&
      result.retained &&
      document.querySelector('dialog').open,
  );
  const report = { results, nativeCalls: 0, appliedWrites: 0 };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await reportFetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
})().catch(async (error) => {
  const report = { results, error: error.stack, nativeCalls: 0, appliedWrites: 0 };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await reportFetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
});
