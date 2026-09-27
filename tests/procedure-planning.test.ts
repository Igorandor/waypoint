import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeProcedure,
  buildSpecializedProcedure,
  type ProcedurePurpose,
} from '../shared/procedure-planning';
import { evaluateAssertion, procedureBodySchema } from '../shared/procedure';
test('each guided procedure produces a closed validated plan with native-source dependencies', () => {
  for (const purpose of ['capacity', 'application', 'task', 'shift'] as ProcedurePurpose[]) {
    const body = buildSpecializedProcedure({
      purpose,
      target: purpose === 'application' ? '/example' : '1',
      title: 'Review',
      minimumMemory: 20,
      minimumDisk: 15,
      expectedEnabled: true,
      includeLogs: true,
      reference: '',
    });
    assert.equal(procedureBodySchema.safeParse(body).success, true);
    assert.ok(analyzeProcedure(body).dependencies.length >= 2);
    assert.ok(analyzeProcedure(body).requiredItems >= 3);
  }
});
test('capacity checks distinguish absent, inconsistent and insufficient headroom', () => {
  const assertion = {
    id: 'check',
    kind: 'assertion' as const,
    title: 'Memory',
    instruction: '',
    sourceStepId: 'source',
    expected: true,
    check: 'memory-headroom' as const,
    threshold: 20,
  };
  assert.equal(
    evaluateAssertion(assertion, {
      status: 'done',
      evidence: { memory: { total: 100, available: 10 } },
    }).outcome,
    'failed',
  );
  assert.equal(
    evaluateAssertion(assertion, {
      status: 'done',
      evidence: { memory: { total: 100, available: 20 } },
    }).outcome,
    'passed',
  );
  assert.equal(
    evaluateAssertion(assertion, {
      status: 'done',
      evidence: { memory: { total: 100, available: 200 } },
    }).outcome,
    'unknown',
  );
  assert.equal(evaluateAssertion(assertion, { status: 'done', evidence: {} }).outcome, 'unknown');
});
test('closed assertions refuse incompatible thresholds and preserve unknown task states', () => {
  const body = buildSpecializedProcedure({
    purpose: 'capacity',
    target: '',
    title: 'Review',
    minimumMemory: 20,
    minimumDisk: 15,
    expectedEnabled: true,
    includeLogs: false,
    reference: '',
  });
  const check = body.steps[1];
  if (check.kind !== 'assertion') throw new Error('fixture');
  delete check.threshold;
  assert.equal(procedureBodySchema.safeParse(body).success, false);
  const task = { ...check, check: 'task-not-running' as const };
  assert.equal(
    evaluateAssertion(task, { status: 'done', evidence: { Status: 'custom' } }).outcome,
    'unknown',
  );
  assert.equal(
    evaluateAssertion(task, { status: 'done', evidence: { Status: '-1' } }).outcome,
    'failed',
  );
});
