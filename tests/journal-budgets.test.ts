import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { RunStore } from '../server/run-store';
import { RunEngine } from '../server/run-engine';
import { IrisClient } from '../server/upstream';
import { CommandJournal } from '../server/command-journal';
import { CommandService } from '../server/command-service';
import { TargetReservations } from '../server/target-reservations';
import { journalDiagnostic, JOURNAL_DIAGNOSTIC_BYTES } from '../server/journal-diagnostic';

const actor = { owner: 'budget-fixture', auth: 'Basic synthetic-auth' };
async function temporary(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'waypoint-journal-budget-'));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(root.includes('waypoint-journal-budget-'));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value, null, 2));

test('three large native diagnostics do not prevent restoration when the upstream recovers', async (t) => {
  const root = await temporary(t);
  let enabled = true,
    writes = 0,
    diagnosticLength = 0,
    errors = 0;
  const client = new IrisClient('http://synthetic.invalid', async (_url, options) => {
    if (options?.method !== 'GET') {
      writes++;
      enabled = JSON.parse(String(options?.body)).Enabled;
    } else if (diagnosticLength) {
      errors++;
      return Response.json({ error: 'd'.repeat(diagnosticLength) }, { status: 503 });
    }
    return Response.json({ result: { Enabled: enabled } });
  });
  const store = new RunStore(root),
    engine = new RunEngine(store, client, 'fixture');
  let run = await engine.create(actor, 'application-window', '/budget-app', '/budget-app');
  run = await engine.next(actor, run.id);
  run = await engine.next(actor, run.id);
  assert.equal(enabled, false);
  assert.equal(writes, 1);
  for (const length of [1_000_000, 1_000_000, 1_095_072]) {
    diagnosticLength = length;
    run = await engine.restore(actor, run.id, '/budget-app');
    const saved = await store.read(actor.owner, engine.instance, run.id);
    const step = saved.steps.find((item) => item.kind === 'restore-app')!;
    assert.equal(step.status, 'failed');
    assert.equal(saved.needsRestore, true);
    assert.match(step.error!, /Diagnostic shortened/);
    assert.ok(bytes(step.error) <= JOURNAL_DIAGNOSTIC_BYTES);
    assert.match(saved.events.at(-1)!.message, /Diagnostic shortened/);
    assert.ok(bytes(saved.events.at(-1)!.message) <= JOURNAL_DIAGNOSTIC_BYTES);
    assert.ok(bytes(saved) < 20000);
    assert.equal(writes, 1);
  }
  assert.equal(errors, 3);
  diagnosticLength = 0;
  run = await engine.restore(actor, run.id, '/budget-app');
  assert.equal(enabled, true);
  assert.equal(writes, 2);
  assert.equal(run.needsRestore, false);
  assert.equal(run.steps.find((item) => item.kind === 'restore-app')!.status, 'done');
  const reopened = await store.read(actor.owner, engine.instance, run.id);
  assert.equal(reopened.needsRestore, false);
  assert.ok(reopened.events.some((item) => item.message.includes('Diagnostic shortened')));
});

test('a compact nested reply is explicitly omitted so the command final outcome remains durable', async (t) => {
  const root = await temporary(t);
  let nested: unknown = Array.from({ length: 9000 }, () => 0);
  for (let depth = 0; depth < 58; depth++) nested = { layer: nested };
  assert.ok(Buffer.byteLength(JSON.stringify(nested)) < 150000);
  assert.ok(bytes(nested) > 1024 * 1024);
  let writes = 0;
  const client = new IrisClient('http://synthetic.invalid', async (_url, options) => {
    assert.equal(options?.method, 'POST');
    writes++;
    return Response.json({ result: nested });
  });
  const journal = new CommandJournal(root, 'fixture');
  const commands = new CommandService(journal, client, new TargetReservations(root, 'fixture'));
  const reviewed = await commands.review(actor, {
    path: '/v2/security/user/password',
    method: 'POST',
    query: { name: 'fixture-target' },
    body: { Password: 'synthetic-secret' },
  });
  assert.equal(writes, 0);
  const result = await commands.execute(actor, reviewed.id, reviewed.confirmation);
  assert.equal(result.status, 'acknowledged');
  assert.equal(writes, 1);
  const saved = await journal.read(actor.owner, reviewed.id);
  assert.equal(saved.status, 'acknowledged');
  assert.equal(saved.responseStatus, 200);
  assert.match(
    (saved.response as { notice: string }).notice,
    /Evidence omitted.*stored evidence limit/,
  );
  assert.ok(bytes(saved) < 10000);
  assert.doesNotMatch(JSON.stringify(saved), /synthetic-secret/);
  await assert.rejects(commands.execute(actor, reviewed.id, reviewed.confirmation), {
    status: 409,
  });
  assert.equal(writes, 1);
});

test('command readback and reconciliation retain bounded diagnostics without losing uncertain outcomes', async (t) => {
  const root = await temporary(t);
  let enabled = true,
    writes = 0;
  const client = new IrisClient('http://synthetic.invalid', async (_url, options) => {
    if (options?.method !== 'GET') {
      writes++;
      enabled = false;
      return Response.json({ result: {} });
    }
    if (writes) return Response.json({ error: '界\n'.repeat(500000) }, { status: 503 });
    return Response.json({ result: { Enabled: enabled } });
  });
  const journal = new CommandJournal(root, 'fixture');
  const commands = new CommandService(journal, client, new TargetReservations(root, 'fixture'));
  const reviewed = await commands.review(actor, {
    path: '/v2/web-app',
    method: 'PUT',
    query: { name: '/fixture-app' },
    body: { Enabled: false },
  });
  const executed = await commands.execute(actor, reviewed.id, reviewed.confirmation);
  assert.equal(executed.status, 'uncertain');
  assert.equal(writes, 1);
  assert.match(executed.message, /Diagnostic shortened/);
  const reconciled = await commands.reconcile(actor, reviewed.id);
  assert.equal(reconciled.status, 'uncertain');
  assert.equal(writes, 1);
  const saved = await journal.read(actor.owner, reviewed.id);
  assert.ok(bytes(saved.message) <= JOURNAL_DIAGNOSTIC_BYTES);
  assert.ok(saved.events.every((event) => bytes(event.message) <= JOURNAL_DIAGNOSTIC_BYTES));
  assert.match(saved.events.at(-1)!.message, /Diagnostic shortened/);
  assert.ok(bytes(saved) < 15000);
});

test('diagnostic budgets count UTF-8 and JSON escapes while preserving ordinary text and Unicode pairs', () => {
  assert.equal(journalDiagnostic('An ordinary error.'), 'An ordinary error.');
  for (const value of ['界'.repeat(4000), '\u0000'.repeat(4000), '🔧'.repeat(4000)]) {
    const retained = journalDiagnostic(value);
    assert.ok(bytes(retained) <= JOURNAL_DIAGNOSTIC_BYTES);
    assert.match(retained, /Diagnostic shortened/);
    assert.doesNotThrow(() => encodeURIComponent(retained));
  }
});
