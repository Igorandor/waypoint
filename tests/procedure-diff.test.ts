import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareProcedureVersions } from '../shared/procedure-diff';
import type { ProcedureVersion } from '../shared/procedure';
test('procedure comparison preserves step identity, order and changed check dependencies', () => {
  const before: ProcedureVersion = {
    number: 1,
    createdAt: '2026-09-27T00:00:00Z',
    createdBy: 'alice',
    changeNote: 'Original',
    body: {
      title: 'Review',
      description: '',
      expectedOutcome: '',
      tags: [],
      steps: [
        {
          id: 'a',
          kind: 'observation',
          title: 'Read',
          instruction: '',
          source: 'health',
          target: '',
        },
        {
          id: 'b',
          kind: 'assertion',
          title: 'Check',
          instruction: '',
          sourceStepId: 'a',
          check: 'monitor-running',
          expected: true,
        },
      ],
    },
  };
  const after = structuredClone(before);
  after.number = 2;
  after.body.steps[1] = {
    ...after.body.steps[1],
    title: 'Changed check',
    expected: false,
  } as (typeof after.body.steps)[1];
  const result = compareProcedureVersions(before, after);
  assert.equal(result.changedSteps, 1);
  assert.equal(result.addedSteps, 0);
  assert.equal(result.steps[1].fields[1].field, 'expected');
  after.body.steps[1].id = 'new-check';
  const recreated = compareProcedureVersions(before, after);
  assert.equal(recreated.addedSteps, 1);
  assert.equal(recreated.removedSteps, 1);
});
