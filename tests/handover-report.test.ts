import test from 'node:test';
import assert from 'node:assert/strict';
import { handoverHtml } from '../shared/handover-report';
import type { Run } from '../shared/runbook';
import type { ObservationSource } from '../shared/procedure';

function recorded(): Run {
  return {
    version: 1,
    id: 'report-fixture',
    owner: 'Fixture operator',
    instance: 'Isolated report fixture',
    template: 'observe',
    title: 'Scheduling review',
    target: '',
    createdAt: '2026-09-27T08:00:00.000Z',
    updatedAt: '2026-09-27T08:01:00.000Z',
    status: 'completed',
    needsRestore: false,
    events: [],
    steps: [
      {
        kind: 'inspect-task',
        title: 'Check scheduling',
        description: 'Record the current state.',
        status: 'done',
        attempts: 1,
        finishedAt: '2026-09-27T08:00:30.000Z',
        evidence: { Suspended: false },
        procedureStep: {
          id: 'read-scheduling',
          kind: 'observation',
          title: 'Check scheduling',
          instruction: 'Record the current state.',
          source: 'task-state',
          target: '7241',
        },
      },
    ],
  };
}
function stepHtml(run: Run) {
  return handoverHtml(run).split('<h2>Step results</h2>')[1].split('<h2>Operator notes</h2>')[0];
}

test('handover HTML identifies the observation source and target independently of its custom title', () => {
  const run = recorded();
  const before = structuredClone(run);
  const html = stepHtml(run);
  assert.match(html, /<dt>Source<\/dt><dd>Task scheduling state \(task-state\)<\/dd>/);
  assert.match(html, /<dt>Target<\/dt><dd>7241<\/dd>/);
  assert.match(html, /Check scheduling/);
  assert.match(html, /2026-09-27T08:00:30\.000Z/);
  assert.match(html, /&quot;Suspended&quot;: false/);
  assert.deepEqual(run, before);
});

test('observation source fallback and target are escaped even for a malformed stored record', () => {
  const run = recorded();
  const step = run.steps[0].procedureStep;
  assert.ok(step?.kind === 'observation');
  step.source = '<img src=x onerror="alert(1)">&' as ObservationSource;
  step.target = "/app/'quoted' & <script>alert(2)</script>";
  const html = stepHtml(run);
  assert.match(
    html,
    /<dt>Source<\/dt><dd>&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;<\/dd>/,
  );
  assert.match(
    html,
    /<dt>Target<\/dt><dd>\/app\/&#39;quoted&#39; &amp; &lt;script&gt;alert\(2\)&lt;\/script&gt;<\/dd>/,
  );
  assert.doesNotMatch(html, /<img|<script/);
  step.source = '__proto__' as ObservationSource;
  assert.match(stepHtml(run), /<dt>Source<\/dt><dd>__proto__<\/dd>/);
});

test('an instance-wide observation does not invent a target identifier', () => {
  const run = recorded();
  const step = run.steps[0].procedureStep;
  assert.ok(step?.kind === 'observation');
  step.source = 'health';
  step.target = '';
  assert.match(stepHtml(run), /<dt>Source<\/dt><dd>System monitor \(health\)<\/dd>/);
  assert.match(stepHtml(run), /<dt>Target<\/dt><dd>No specific target<\/dd>/);
});

test('legacy steps and non-observation procedure steps keep their existing report metadata', () => {
  const run = recorded();
  delete run.steps[0].procedureStep;
  const legacy = stepHtml(run);
  assert.doesNotMatch(legacy, /<dt>Source<\/dt>|<dt>Target<\/dt>/);
  assert.match(legacy, /<dt>Status<\/dt><dd>done<\/dd>/);
  assert.match(legacy, /<dt>Recorded at<\/dt><dd>2026-09-27T08:00:30\.000Z<\/dd>/);
  run.steps[0].procedureStep = {
    id: 'check',
    kind: 'assertion',
    title: 'Check scheduling',
    instruction: 'Check the captured state.',
    check: 'task-suspended',
    sourceStepId: 'read-scheduling',
    expected: false,
  };
  assert.equal(stepHtml(run), legacy);
});
