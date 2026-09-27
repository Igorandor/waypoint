import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deskCounts, deskIssues, exportDesk, type DeskSnapshot } from '../shared/operations-desk';
import { summarize, type Run } from '../shared/runbook';
const at = '2026-09-27T12:00:00Z';
test('operations desk retains restoration and follow-up obligations even on stopped or archived records', () => {
  const run = {
    id: 'run',
    title: 'Window',
    target: '/app',
    template: 'application-window',
    createdAt: at,
    updatedAt: at,
    status: 'stopped',
    needsRestore: true,
    archivedAt: at,
    completed: 1,
    total: 4,
    attention: false,
    openFollowUps: 2,
    nextFollowUpAt: '2026-09-26T12:00:00Z',
    unresolvedSteps: 1,
  } as const;
  const snapshot: DeskSnapshot = {
    runs: { readAt: at, data: [run] },
    commands: { readAt: at, data: [] },
    procedures: { readAt: at, data: [] },
  };
  const issues = deskIssues(snapshot, Date.parse(at));
  assert.equal(issues[0].kind, 'restore');
  assert.ok(issues.some((issue) => issue.kind === 'uncertain-run'));
  assert.ok(issues.some((issue) => issue.kind === 'follow-up' && issue.urgency === 'verify'));
  assert.equal(deskCounts(snapshot, Date.parse(at)).followUps, 2);
});
test('an inaccessible source is distinct from no obligations and exports preserve that boundary', () => {
  const snapshot: DeskSnapshot = {
    runs: { readAt: at, error: 'Current operating privilege required' },
    commands: { readAt: at, data: [] },
    procedures: { readAt: at, data: [] },
  };
  assert.equal(deskCounts(snapshot).incompleteSources, 1);
  assert.equal(exportDesk(snapshot).sources.runs.error, 'Current operating privilege required');
});
test('run summaries expose unresolved counts and open follow-up deadline without note contents', () => {
  const run = {
    id: 'run',
    title: 'Check',
    status: 'completed',
    steps: [{ status: 'uncertain', title: 'Read state' }],
    handover: {
      summary: 'private detailed note',
      nextActions: [
        { completed: false, dueAt: '2026-09-28T12:00:00Z' },
        { completed: true, dueAt: '2026-09-25T12:00:00Z' },
      ],
    },
  } as unknown as Run;
  const summary = summarize(run);
  assert.equal(summary.unresolvedSteps, 1);
  assert.equal(summary.openFollowUps, 1);
  assert.equal(summary.nextFollowUpAt, '2026-09-28T12:00:00Z');
  assert.doesNotMatch(JSON.stringify(summary), /private detailed note/);
});
