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

test('legacy steps retain their report metadata and missing assertion sources are explicit', () => {
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
  const missing = stepHtml(run);
  assert.match(
    missing,
    /Referenced observation<\/dt><dd>Not available in this run \(read-scheduling\)/,
  );
  assert.match(missing, /<dt>Status<\/dt><dd>done<\/dd>/);
  assert.doesNotMatch(missing, /<dt>Source<\/dt>|<dt>Target<\/dt>/);
});

function assertionRun(): Run {
  const run = recorded();
  const second = structuredClone(run.steps[0]);
  assert.ok(second.procedureStep?.kind === 'observation');
  second.procedureStep.id = 'read-second';
  second.procedureStep.target = '8392';
  second.evidence = { Suspended: true };
  run.steps.push(second, {
    kind: 'info',
    title: 'Review scheduling',
    description: 'Review the second observation.',
    status: 'done',
    attempts: 1,
    procedureStep: {
      id: 'assert-second',
      kind: 'assertion',
      title: 'Review scheduling',
      instruction: '',
      check: 'task-suspended',
      sourceStepId: 'read-second',
      expected: false,
    },
    evidence: {
      outcome: 'failed',
      sourceStepId: 'read-second',
      check: 'task-suspended',
      expected: false,
      observed: true,
      message: 'Recorded scheduling differs.',
    },
  });
  return run;
}
function assertionHtml(run: Run) {
  return stepHtml(run).split('<section class="step">')[3];
}
test('same-titled observations are joined by exact ID and identify the referenced source and target', () => {
  const run = assertionRun(),
    original = structuredClone(run);
  const html = assertionHtml(run);
  assert.match(html, /Referenced observation<\/dt><dd>2\. Check scheduling \(read-second\)/);
  assert.match(html, /Source<\/dt><dd>Task scheduling state \(task-state\)/);
  assert.match(html, /Target<\/dt><dd>8392/);
  assert.doesNotMatch(html, /<dd>7241<\/dd>/);
  assert.match(html, /&quot;outcome&quot;: &quot;failed&quot;/);
  assert.deepEqual(run, original);
});
test('reference metadata is neutral for pending and unknown assertions and does not evaluate evidence', () => {
  const run = assertionRun(),
    step = run.steps[2];
  step.status = 'pending';
  step.attempts = 0;
  delete step.evidence;
  let html = assertionHtml(run);
  assert.match(html, /Referenced observation<\/dt><dd>2\. Check scheduling/);
  assert.match(html, /Status<\/dt><dd>pending/);
  assert.match(html, /No result recorded/);
  assert.doesNotMatch(html, /outcome|Checked observation/);
  step.status = 'done';
  step.evidence = {
    outcome: 'unknown',
    sourceStepId: 'read-second',
    message: 'Required typed state absent.',
  };
  html = assertionHtml(run);
  assert.match(html, /&quot;outcome&quot;: &quot;unknown&quot;/);
  assert.match(html, /Required typed state absent/);
  assert.doesNotMatch(html, /&quot;outcome&quot;: &quot;failed&quot;/);
});
test('missing or wrong-kind references never fall back to matching titles', () => {
  const run = assertionRun();
  const assertion = run.steps[2].procedureStep;
  assert.ok(assertion?.kind === 'assertion');
  assertion.sourceStepId = 'missing-observation';
  assert.match(assertionHtml(run), /Not available in this run \(missing-observation\)/);
  assertion.sourceStepId = 'assert-second';
  const html = assertionHtml(run);
  assert.match(html, /Not available in this run \(assert-second\)/);
  assert.doesNotMatch(html, /<dt>Source<\/dt>|<dt>Target<\/dt>/);
});
test('reference labels, identifiers and source metadata are escaped as report text', () => {
  const run = assertionRun();
  const source = run.steps[1].procedureStep,
    assertion = run.steps[2].procedureStep;
  assert.ok(source?.kind === 'observation' && assertion?.kind === 'assertion');
  source.id = assertion.sourceStepId = '<source&"id">';
  run.steps[1].title = '<script>bad()</script>';
  source.target = '<img src=x onerror=bad()> & target';
  source.source = '<source>' as ObservationSource;
  const html = assertionHtml(run);
  assert.match(
    html,
    /2\. &lt;script&gt;bad\(\)&lt;\/script&gt; \(&lt;source&amp;&quot;id&quot;&gt;\)/,
  );
  assert.match(html, /<dt>Source<\/dt><dd>&lt;source&gt;<\/dd>/);
  assert.match(html, /&lt;img src=x onerror=bad\(\)&gt; &amp; target/);
  assert.doesNotMatch(html, /<script|<img/);
});
