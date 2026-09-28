import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareProcedureVersions, displayProcedureValue } from '../shared/procedure-diff';
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

import { comparisonVersions } from './fixtures/procedure-versions';

test('added and removed observations include their actual source, target and instructions', () => {
  const result = compareProcedureVersions(
    ...(comparisonVersions as [ProcedureVersion, ProcedureVersion]),
  );
  const added = result.steps.find((step) => step.id === 'read-new')!,
    removed = result.steps.find((step) => step.id === 'read-old')!;
  assert.equal(added.kind, 'added');
  assert.equal(removed.kind, 'removed');
  assert.equal(added.fields.find((field) => field.field === 'target')?.after, '/csp/training-new');
  assert.equal(
    removed.fields.find((field) => field.field === 'target')?.before,
    '/csp/training-old',
  );
  assert.equal(added.fields.find((field) => field.field === 'source')?.after, 'application');
  assert.ok(added.fields.every((field) => field.before === undefined));
  assert.ok(removed.fields.every((field) => field.after === undefined));
  assert.ok(
    !added.fields.some((field) => field.field === 'id'),
    'Stored identity remains the explicit step id, not a guessed field match',
  );
  assert.equal(result.addedSteps, 3);
  assert.equal(result.removedSteps, 3);
  assert.equal(result.changedSteps, 0);
});
test('added and removed checkpoints retain nested required items, reference and false note requirements', () => {
  const result = compareProcedureVersions(
    ...(comparisonVersions as [ProcedureVersion, ProcedureVersion]),
  );
  const added = result.steps.find((step) => step.id === 'checkpoint-new')!,
    removed = result.steps.find((step) => step.id === 'checkpoint-old')!;
  assert.deepEqual(added.fields.find((field) => field.field === 'items')?.after, [
    { id: 'confirm', text: 'Confirm new destination', required: true },
  ]);
  assert.equal(added.fields.find((field) => field.field === 'requireNote')?.after, false);
  assert.equal(removed.fields.find((field) => field.field === 'requireNote')?.before, true);
  assert.equal(
    removed.fields.find((field) => field.field === 'reference')?.before,
    'https://example.com/old',
  );
});
test('added assertion definitions retain dependency, false expected value and zero threshold', () => {
  const versions = structuredClone(comparisonVersions);
  const body = versions[1].body;
  body.steps[0] = { ...body.steps[0], source: 'capacity', target: '' } as (typeof body.steps)[0];
  body.steps[2] = {
    ...body.steps[2],
    check: 'memory-headroom',
    threshold: 0,
    expected: false,
  } as (typeof body.steps)[2];
  const result = compareProcedureVersions(...(versions as [ProcedureVersion, ProcedureVersion]));
  const added = result.steps.find((step) => step.id === 'assertion-new')!;
  assert.equal(added.fields.find((field) => field.field === 'sourceStepId')?.after, 'read-new');
  assert.equal(added.fields.find((field) => field.field === 'check')?.after, 'memory-headroom');
  assert.equal(added.fields.find((field) => field.field === 'expected')?.after, false);
  assert.equal(added.fields.find((field) => field.field === 'threshold')?.after, 0);
  assert.equal(displayProcedureValue(false), 'false');
  assert.equal(displayProcedureValue(0), '0');
  assert.equal(displayProcedureValue(''), '(empty)');
  assert.equal(displayProcedureValue(undefined), '(not present)');
});
test('reverse comparison preserves the same definitions on the opposite side', () => {
  const forward = compareProcedureVersions(
    ...(comparisonVersions as [ProcedureVersion, ProcedureVersion]),
  );
  const reverse = compareProcedureVersions(comparisonVersions[1], comparisonVersions[0]);
  for (const step of forward.steps) {
    const reversed = reverse.steps.find((item) => item.id === step.id)!;
    assert.equal(reversed.kind, step.kind === 'added' ? 'removed' : 'added');
    assert.deepEqual(
      reversed.fields,
      step.fields.map((field) => ({ ...field, before: field.after, after: field.before })),
    );
  }
});
test('reordering existing steps does not invent definition changes or replacements', () => {
  const before = comparisonVersions[0],
    after = structuredClone(before);
  after.number = 2;
  after.body.steps = [after.body.steps[1], after.body.steps[0], after.body.steps[2]];
  const result = compareProcedureVersions(before, after);
  assert.equal(result.addedSteps, 0);
  assert.equal(result.removedSteps, 0);
  assert.equal(result.changedSteps, 0);
  assert.equal(result.movedSteps, 2);
  assert.ok(result.steps.every((step) => step.fields.length === 0));
});
