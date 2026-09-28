import type { RunStep } from './runbook.js';

/** Describe retained collection context without inferring a historical request or completeness. */
export function collectionLimitNotice(step: RunStep | undefined): string | undefined {
  if (!step || step.status !== 'done' || step.evidence === undefined) return;
  if (step.collection)
    return `Requested row limit: ${step.collection.requestedRowLimit}. This bounded response does not establish that all source records were returned.`;
  const definition = step.procedureStep;
  const bounded = definition
    ? definition.kind === 'observation' &&
      ['applications', 'tasks', 'processes', 'journals', 'task-history'].includes(definition.source)
    : [
        'application-inventory',
        'task-inventory',
        'processes',
        'journal-inventory',
        'task-history',
      ].includes(step.kind);
  if (bounded)
    return 'Collection limit was not recorded for this observation. Do not treat it as a complete inventory or history.';
}
