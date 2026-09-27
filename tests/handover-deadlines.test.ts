import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RunStore } from '../server/run-store';
import { RunEngine } from '../server/run-engine';
import { IrisClient } from '../server/upstream';
import { summarize, type Run } from '../shared/runbook';
import { deskIssues } from '../shared/operations-desk';

test('saved follow-ups use chronological deadlines across accepted timestamp precision', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'waypoint-handover-deadline-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.includes('waypoint-handover-deadline-'));
    await rm(directory, { recursive: true, force: true });
  });
  const store = new RunStore(directory);
  const client = new IrisClient('http://synthetic.invalid', async () => {
    assert.fail('Saving handover metadata must not contact IRIS.');
  });
  const engine = new RunEngine(store, client, 'deadline-fixture');
  const actor = { owner: 'fixture-operator', auth: 'unused' };
  const run: Run = {
    version: 1,
    id: randomUUID(),
    owner: actor.owner,
    instance: engine.instance,
    template: 'observe',
    title: 'Follow-up review',
    target: '',
    createdAt: '2026-09-27T12:00:00Z',
    updatedAt: '2026-09-27T12:00:00Z',
    revision: 0,
    status: 'completed',
    needsRestore: false,
    events: [],
    steps: [{ kind: 'health', title: 'Health', description: '', status: 'done', attempts: 1 }],
  };
  await store.save(run);
  const earliest = '2026-09-28T12:00:00Z';
  const followUp = (id: string, dueAt: string, completed = false) => ({
    id,
    title: id,
    dueAt,
    completed,
  });
  const input = {
    recipient: 'Next shift',
    summary: 'Review outstanding observations.',
    outstandingRisks: '',
    references: [],
    delivered: false,
    nextActions: [
      followUp('later', '2026-09-28T12:00:00.500Z'),
      followUp('first', earliest),
      followUp('completed', '2026-09-27T12:00:00Z', true),
      followUp('undated', ''),
    ],
  };
  await engine.handover(actor, run.id, 0, input);
  const saved = await store.read(actor.owner, engine.instance, run.id);
  assert.deepEqual(saved.handover?.nextActions, input.nextActions);
  const summary = summarize(saved);
  assert.equal(summary.openFollowUps, 3);
  assert.equal(summary.nextFollowUpAt, earliest);
  const snapshot = {
    runs: { data: [summary], readAt: '2026-09-28T12:00:00.250Z' },
    commands: { data: [], readAt: '' },
    procedures: { data: [], readAt: '' },
  };
  const overdue = deskIssues(snapshot, Date.parse(snapshot.runs.readAt));
  assert.equal(overdue.length, 1);
  assert.equal(overdue[0].kind, 'follow-up');
  assert.equal(overdue[0].urgency, 'verify');
  assert.equal(overdue[0].dueAt, earliest);
  assert.match(overdue[0].detail, /earliest recorded deadline has passed/);
  assert.equal(deskIssues(snapshot, Date.parse(earliest) - 1)[0].urgency, 'review');
});
