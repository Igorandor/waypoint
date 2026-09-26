import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildObservationPlan } from '../shared/observation-plan.js';
import { writeStep } from '../shared/runbook.js';
test('observation plans preserve chosen order and cannot include writes', () => {
  const plan = buildObservationPlan(['logs', 'processes', 'health']);
  assert.deepEqual(
    plan.map((step) => step.kind),
    ['logs', 'processes', 'health'],
  );
  assert.ok(plan.every((step) => !writeStep(step.kind)));
  for (const value of [
    [],
    ['host', 'host'],
    ['disable-app'],
    ['__proto__'],
    Array(9).fill('host'),
    '/v2/tasks',
  ])
    assert.throws(() => buildObservationPlan(value));
});
