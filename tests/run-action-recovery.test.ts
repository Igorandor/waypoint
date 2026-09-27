import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Run, RunSummary } from '../shared/runbook';
import { RequestError, type request } from '../src/api';

// These tests exercise the page's real action handler; styles have no server-side behavior.
register(
  'data:text/javascript,' +
    encodeURIComponent(
      'export async function load(url, context, next) {' +
        'if (url.endsWith(".css")) return { format: "module", source: "", shortCircuit: true };' +
        'return next(url, context); }',
    ),
  import.meta.url,
);
const { performRunAction } = await import('../src/pages/Runbooks');
const { RunDetail } = await import('../src/features/runbooks/RunDetail');
const saved = {
  id: 'fixture-run',
  revision: 2,
  notes: [{ id: 'note-1', text: 'Saved once' }],
} as Run;

test('a saved note remains successful when the subsequent history read fails', async () => {
  const calls: string[] = [];
  let current: Run | undefined;
  const priorList = [{ id: 'fixture-run' }] as RunSummary[];
  let list = priorList;
  const result = await performRunAction(
    saved.id,
    'notes',
    { revision: 1, text: 'Saved once', category: 'observation' },
    (run) => {
      current = run;
    },
    (runs) => {
      list = runs;
    },
    (async (path: string, body?: unknown) => {
      calls.push(path);
      if (body !== undefined) return saved;
      assert.equal(current, saved, 'the confirmed record is published before the list request');
      throw new Error('History unavailable (500).');
    }) as typeof request,
  );
  assert.equal(
    result.ok,
    true,
    'callers must clear the saved draft instead of inviting a duplicate',
  );
  assert.ok(result.ok && result.warning?.includes('The action was saved'));
  assert.ok(result.ok && result.warning?.includes('History unavailable (500)'));
  assert.ok(result.ok && result.warning?.includes('do not repeat the action'));
  assert.equal(current?.revision, 2);
  assert.equal(list, priorList, 'keep the existing history when its refresh fails');
  assert.deepEqual(calls, ['runs/fixture-run/notes', 'runs']);
});

test('an action rejection returns its actual error to the dialog and never fetches the list', async () => {
  for (const action of ['handover', 'restore']) {
    const calls: string[] = [];
    const result = await performRunAction(
      saved.id,
      action,
      { revision: 1 },
      () => assert.fail('a rejected write must not replace the selected run'),
      () => assert.fail('a rejected write must not replace the history'),
      (async (path: string) => {
        calls.push(path);
        throw new RequestError(
          action === 'handover' ? 'Run changed (409).' : 'Restoration denied (403).',
          action === 'handover' ? 409 : 403,
        );
      }) as typeof request,
    );
    assert.equal(result.ok, false);
    assert.ok(
      !result.ok &&
        result.error.includes(
          action === 'handover' ? 'Run changed (409).' : 'Restoration denied (403).',
        ),
    );
    assert.deepEqual(calls, ['runs/fixture-run/' + action]);
  }
});

test('successful actions publish the confirmed run and refreshed history once in order', async () => {
  const history = [{ id: saved.id, completed: 1 }] as RunSummary[];
  const events: string[] = [];
  const result = await performRunAction(
    saved.id,
    'handover',
    { revision: 1 },
    (run) => {
      assert.equal(run, saved);
      events.push('publish run');
    },
    (runs) => {
      assert.equal(runs, history);
      events.push('publish history');
    },
    (async (path: string, body?: unknown) => {
      events.push(path);
      return body === undefined ? history : saved;
    }) as typeof request,
  );
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(events, ['runs/fixture-run/handover', 'publish run', 'runs', 'publish history']);
});

test('checkpoint draft is locked while its action is pending and editable again afterward', () => {
  const run: Run = {
    version: 1,
    id: 'checkpoint-fixture',
    owner: 'Fixture',
    instance: 'Fixture',
    template: 'task-window',
    title: 'Checkpoint',
    target: '7',
    createdAt: '2026-09-27T10:00:00.000Z',
    updatedAt: '2026-09-27T10:00:00.000Z',
    status: 'active',
    needsRestore: true,
    original: false,
    events: [],
    steps: [
      {
        kind: 'checkpoint',
        title: 'Record maintenance',
        description: 'Record work.',
        status: 'pending',
        attempts: 0,
      },
    ],
  };
  for (const busy of [true, false]) {
    const html = renderToStaticMarkup(
      createElement(RunDetail, {
        run,
        busy,
        onAction: async () => ({ ok: true as const }),
      }),
    );
    const noteField = html.match(/Operator note<textarea([^>]*)>/)?.[1];
    assert.notEqual(noteField, undefined);
    assert.equal(noteField?.includes('disabled=""'), busy);
  }
});

test('missing run action outcomes are distinguished from explicit HTTP rejections', async () => {
  const missing = [
    new TypeError('Failed to fetch'),
    new RequestError('Unreadable gateway response', 200),
    new RequestError('Gateway unavailable', 502),
  ];
  const rejected = [new RequestError('Forbidden', 403), new RequestError('Run changed', 409)];
  for (const cause of [...missing, ...rejected]) {
    const calls: string[] = [];
    const result = await performRunAction(
      'fixture-run',
      'next',
      {},
      () => assert.fail('No response record exists'),
      () => assert.fail('Do not invent a successful list refresh'),
      (async (path: string) => {
        calls.push(path);
        throw cause;
      }) as typeof request,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, cause.message);
      assert.equal(result.outcomeUnknown, missing.includes(cause));
    }
    assert.deepEqual(calls, ['runs/fixture-run/next']);
  }
});
