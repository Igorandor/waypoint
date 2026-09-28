import { buildSpecializedProcedure } from '../../shared/procedure-planning';
import { evaluateAssertion } from '../../shared/procedure';

export function checkRun(completed = false, allPassed = false) {
  const body = buildSpecializedProcedure({
    purpose: 'capacity',
    target: '',
    title: 'Capacity review before the maintenance window',
    minimumMemory: 20,
    minimumDisk: 15,
    expectedEnabled: true,
    includeLogs: false,
    reference: '',
  });
  body.steps.splice(3, 0, {
    id: 'capture-check',
    kind: 'assertion',
    title: 'Check that capacity was captured',
    instruction: 'Capture presence does not establish adequate capacity.',
    sourceStepId: 'capacity',
    check: 'capture-present',
    expected: true,
  });
  const source = {
    status: 'done',
    evidence: allPassed
      ? { memory: { total: 100, available: 50 }, disk: { total: 100, free: 50 } }
      : { memory: { total: 100, available: 5 } },
  };
  const at = '2026-09-28T12:00:00.000Z';
  return {
    version: 1,
    id: '11111111-1111-4111-8111-111111111111',
    owner: 'Fixture operator',
    instance: 'Synthetic instance',
    template: 'observe',
    title: body.title,
    target: '',
    createdAt: at,
    updatedAt: at,
    status: completed ? 'completed' : 'active',
    needsRestore: false,
    revision: 1,
    events: [],
    steps: body.steps.map((definition) => ({
      kind: definition.kind === 'checklist' ? 'checkpoint' : 'info',
      title: definition.title,
      description: definition.instruction,
      procedureStep: definition,
      status: definition.kind === 'checklist' && !completed ? 'pending' : 'done',
      attempts: definition.kind === 'checklist' && !completed ? 0 : 1,
      ...(definition.kind === 'assertion'
        ? { evidence: evaluateAssertion(definition, source) }
        : definition.kind === 'observation'
          ? { evidence: source.evidence }
          : completed
            ? {
                note: 'Keep the workload deferred; collect the missing disk measurement.',
                evidence: {
                  operator: 'Fixture operator',
                  note: 'Keep the workload deferred; collect the missing disk measurement.',
                },
              }
            : {}),
    })),
  };
}
