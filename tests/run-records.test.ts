import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canArchive,
  compareRuns,
  exportHandover,
  handoverInputSchema,
} from '../shared/run-records';
import type { Run } from '../shared/runbook';
function recorded(evidence: unknown): Run {
  return {
    version: 1,
    id: 'test',
    owner: 'alice',
    instance: 'instance',
    template: 'observe',
    title: 'Recorded',
    target: '',
    status: 'completed',
    needsRestore: false,
    createdAt: '2026-09-27T00:00:00Z',
    updatedAt: '2026-09-27T00:00:00Z',
    events: [],
    steps: [{ id: 'source', kind: 'health', title: 'Source', status: 'done', evidence }],
  } as unknown as Run;
}
test('comparison preserves ordered configuration arrays and escapes field paths without collisions', () => {
  const before = recorded({
    rows: [
      { Name: 'a', Enabled: true },
      { Name: 'b', Enabled: false },
    ],
    'a/b': 1,
    a: { b: 2 },
  });
  const after = recorded({
    rows: [
      { Name: 'b', Enabled: false },
      { Name: 'a', Enabled: true },
    ],
    'a/b': 3,
    a: { b: 4 },
  });
  const comparison = compareRuns(before, after);
  const paths = comparison.sources[0].changes.map((row) => row.path);
  assert.ok(paths.includes('/a/b'));
  assert.ok(paths.includes('/a~1b'));
  assert.ok(paths.includes('/rows/0/Name'));
  assert.ok(paths.includes('/rows/1/Name'));
});
test('only known root inventories align unordered identities, with process generations kept distinct', () => {
  const before = recorded([
    { Name: 'a', Enabled: true },
    { Name: 'b', Enabled: false },
  ]);
  const after = recorded([
    { Name: 'b', Enabled: false },
    { Name: 'a', Enabled: true },
  ]);
  before.steps[0].kind = 'application-inventory';
  after.steps[0].kind = 'application-inventory';
  assert.equal(compareRuns(before, after).sources[0].changes.length, 0);
  before.steps[0].kind = 'task-inventory';
  after.steps[0].kind = 'task-inventory';
  before.steps[0].evidence = [{ Id: 1, Name: 'old name' }];
  after.steps[0].evidence = [{ Id: 1, Name: 'new name' }];
  assert.deepEqual(
    compareRuns(before, after).sources[0].changes.map((change) => change.change),
    ['changed'],
  );
  before.steps[0].kind = 'processes';
  after.steps[0].kind = 'processes';
  before.steps[0].evidence = [{ Pid: 12, JobNumber: 1, StartTimeUTC: 'old', Name: 'worker' }];
  after.steps[0].evidence = [{ Pid: 12, JobNumber: 2, StartTimeUTC: 'new', Name: 'worker' }];
  const changes = compareRuns(before, after).sources[0].changes;
  assert.ok(changes.some((change) => change.change === 'removed'));
  assert.ok(changes.some((change) => change.change === 'added'));
});
test('partial and failed observations are never evidence of removed native objects', () => {
  const before = recorded({
    rows: Array.from({ length: 300 }, (_, index) => ({ Name: 'row' + index, Value: index })),
  });
  const after = recorded({ rows: [] });
  const comparison = compareRuns(before, after);
  assert.equal(comparison.sources[0].truncated, true);
  assert.equal(comparison.sources[0].changes.length, 0);
  after.steps[0].status = 'failed';
  assert.equal(compareRuns(before, after).sources[0].state, 'unavailable');
});
test('archive never hides an active restoration obligation or uncertain step', () => {
  const run = recorded({});
  assert.equal(canArchive(run).allowed, true);
  run.needsRestore = true;
  assert.equal(canArchive(run).allowed, false);
  run.needsRestore = false;
  run.steps[0].status = 'uncertain';
  assert.equal(canArchive(run).allowed, false);
  run.steps[0].status = 'done';
  run.status = 'active';
  assert.equal(canArchive(run).allowed, false);
});
test('handover validates references and explicitly preserves execution ownership', () => {
  const run = recorded({});
  const result = exportHandover(run);
  assert.equal(result.authority, 'READ_ONLY_PACKAGE');
  assert.equal(result.executionOwner, 'alice');
  const body = {
    recipient: 'bob',
    summary: 'The check completed.',
    outstandingRisks: '',
    nextActions: [],
    references: [],
    delivered: false,
  };
  assert.equal(handoverInputSchema.safeParse(body).success, true);
  assert.equal(
    handoverInputSchema.safeParse({ ...body, references: ['javascript:alert(1)'] }).success,
    false,
  );
  assert.equal(handoverInputSchema.safeParse({ ...body, newOwner: 'bob' }).success, false);
});
