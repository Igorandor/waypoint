import type { Run } from '../../shared/runbook';
export function comparisonCollectionRun(id: string, first: number): Run {
  const at = first === 1 ? '2026-09-28T12:00:00.000Z' : '2026-09-28T13:00:00.000Z';
  return {
    version: 1,
    id,
    owner: 'Fixture',
    instance: 'synthetic-only',
    template: 'observe',
    title: first === 1 ? 'Earlier task inventory' : 'Later task inventory',
    target: 'Instance',
    createdAt: at,
    updatedAt: at,
    status: 'completed',
    needsRestore: false,
    events: [],
    steps: [
      {
        kind: 'task-inventory',
        title: 'Task inventory',
        description: 'Read up to 100 task definitions.',
        status: 'done',
        attempts: 1,
        startedAt: at,
        finishedAt: at,
        collection: { requestedRowLimit: 100 },
        evidence: Array.from({ length: 100 }, (_, i) => ({
          Id: first + i,
          Name: 'Task ' + (first + i),
        })),
      },
    ],
  };
}
export function collectionComparisonPair(mode = 'shifted') {
  const before = comparisonCollectionRun('11111111-1111-4111-8111-111111111111', 1);
  const after = comparisonCollectionRun('22222222-2222-4222-8222-222222222222', 2);
  if (mode === 'identical') after.steps[0].evidence = structuredClone(before.steps[0].evidence);
  if (mode === 'different-limits') after.steps[0].collection = { requestedRowLimit: 50 };
  if (mode === 'legacy') delete before.steps[0].collection;
  if (mode === 'failed') {
    after.steps[0].status = 'failed';
    after.steps[0].error = 'Source unavailable';
    delete after.steps[0].evidence;
    delete after.steps[0].collection;
  }
  if (mode === 'missing')
    after.steps[0] = {
      kind: 'health',
      title: 'Health',
      description: '',
      status: 'done',
      attempts: 1,
      evidence: { SystemMonitor: true },
    };
  return { before, after };
}
