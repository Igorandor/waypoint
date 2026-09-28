import { z } from 'zod';
import type { Run, RunStep } from './runbook.js';
import { referenceSchema, type AssertionResult } from './procedure.js';
import { collectionLimitNotice } from './collection-limits.js';

export const followUpSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-zA-Z0-9_-]+$/),
    title: z.string().trim().min(1).max(200),
    completed: z.boolean(),
    dueAt: z.union([z.literal(''), z.string().datetime()]),
  })
  .strict();
export const handoverInputSchema = z
  .object({
    recipient: z.string().trim().max(128),
    summary: z.string().trim().min(1).max(2000),
    outstandingRisks: z.string().trim().max(2000),
    nextActions: z.array(followUpSchema).max(20),
    references: z.array(referenceSchema).max(8),
    delivered: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.nextActions.map((item) => item.id)).size !== value.nextActions.length)
      context.addIssue({
        code: 'custom',
        path: ['nextActions'],
        message: 'Follow-up IDs must be distinct.',
      });
  });
export type HandoverInput = z.infer<typeof handoverInputSchema>;
export type Handover = HandoverInput & {
  revision: number;
  updatedAt: string;
  updatedBy: string;
  deliveryRecordedAt?: string;
};
export type RunNote = {
  id: string;
  at: string;
  author: string;
  text: string;
  category: 'observation' | 'decision' | 'follow-up';
};
export function recordedAssertionOutcome(step: RunStep): AssertionResult['outcome'] | undefined {
  if (step.procedureStep?.kind !== 'assertion' || step.status !== 'done') return;
  const outcome = (step.evidence as { outcome?: string } | undefined)?.outcome;
  if (outcome === 'passed' || outcome === 'failed' || outcome === 'unknown') return outcome;
}
export function assertionCounts(run: Pick<Run, 'steps'>) {
  const results = { passed: 0, failed: 0, unknown: 0 };
  for (const step of run.steps) {
    const outcome = recordedAssertionOutcome(step);
    if (outcome) results[outcome]++;
  }
  return results;
}
export function canArchive(run: Run): { allowed: boolean; reason: string } {
  if (run.status === 'active')
    return { allowed: false, reason: 'Close this run before archiving it.' };
  if (run.needsRestore)
    return { allowed: false, reason: 'Restore the original state before archiving.' };
  if (run.steps.some((step) => step.status === 'running' || step.status === 'uncertain'))
    return { allowed: false, reason: 'An unresolved step cannot be archived.' };
  return { allowed: true, reason: '' };
}
export function exportHandover(run: Run) {
  return {
    format: 'waypoint-handover-1',
    exportedAt: new Date().toISOString(),
    authority: 'READ_ONLY_PACKAGE',
    executionOwner: run.owner,
    notice:
      'This package does not transfer run ownership or execution authority. The original account remains responsible for any restoration in Waypoint.',
    run: structuredClone(run),
    readiness: {
      active: run.status === 'active',
      needsRestore: run.needsRestore,
      unresolvedSteps: run.steps
        .filter((step) => ['running', 'uncertain', 'failed'].includes(step.status))
        .map((step) => ({ title: step.title, status: step.status, error: step.error })),
      checks: assertionCounts(run),
      outstandingFollowUps: run.handover?.nextActions.filter((item) => !item.completed) ?? [],
    },
  };
}

type FieldChange = {
  path: string;
  before?: unknown;
  after?: unknown;
  change: 'added' | 'removed' | 'changed';
};
export type SourceComparison = {
  key: string;
  title: string;
  state: 'compared' | 'missing-before' | 'missing-after' | 'unavailable';
  beforeAt?: string;
  afterAt?: string;
  beforeCollection?: RunStep['collection'];
  afterCollection?: RunStep['collection'];
  beforeCollectionNotice?: string;
  afterCollectionNotice?: string;
  changes: FieldChange[];
  unchanged: number;
  truncated: boolean;
  note: string;
};
export type RunComparison = {
  before: { id: string; title: string; createdAt: string };
  after: { id: string; title: string; createdAt: string };
  instance: string;
  sources: SourceComparison[];
  totals: { changed: number; unchanged: number; unavailable: number; missing: number };
};
function observations(run: Run) {
  const result = new Map<string, RunStep>();
  const count = new Map<string, number>();
  const traditional: Record<string, string> = {
    info: 'identity',
    health: 'health',
    host: 'capacity',
    logs: 'messages',
    processes: 'processes',
    'task-inventory': 'tasks',
    'application-inventory': 'applications',
    'journal-inventory': 'journals',
    'inspect-app': 'application',
    'inspect-task': 'task',
    'task-history': 'task-history',
  };
  for (const step of run.steps) {
    if (step.procedureStep && step.procedureStep.kind !== 'observation') continue;
    const source =
      step.procedureStep?.kind === 'observation'
        ? step.procedureStep.source
        : traditional[step.kind];
    if (!source) continue;
    const target =
      step.procedureStep?.kind === 'observation'
        ? step.procedureStep.target
        : ['application', 'task', 'task-history'].includes(source)
          ? run.target
          : '';
    const stem = source + '\0' + target;
    const occurrence = count.get(stem) ?? 0;
    count.set(stem, occurrence + 1);
    result.set(stem + '\0' + occurrence, step);
  }
  return result;
}
function fields(value: unknown, source: string, maximum = 1500) {
  const result = new Map<string, unknown>();
  let truncated = false;
  const segment = (value: string) => value.replace(/~/g, '~0').replace(/\//g, '~1');
  const visit = (item: unknown, path: string, depth: number) => {
    if (result.size >= maximum) {
      truncated = true;
      return;
    }
    if (depth >= 8) {
      result.set(path, '[nested data omitted]');
      truncated = true;
      return;
    }
    if (Array.isArray(item)) {
      if (!item.length) result.set(path, []);
      const identity =
        path === '' && ['applications', 'tasks', 'journals'].includes(source)
          ? (source === 'tasks' ? ['Id'] : ['Name']).find(
              (key) =>
                item.length > 0 &&
                item.every(
                  (row) =>
                    row &&
                    typeof row === 'object' &&
                    (typeof row[key] === 'string' || typeof row[key] === 'number'),
                ) &&
                new Set(item.map((row) => String(row[key]))).size === item.length,
            )
          : undefined;
      const generation =
        path === '' &&
        source === 'processes' &&
        item.length > 0 &&
        item.every(
          (row) =>
            row &&
            typeof row === 'object' &&
            ['Pid', 'JobNumber', 'StartTimeUTC'].every(
              (key) =>
                (typeof row[key] === 'string' && row[key] !== '') || typeof row[key] === 'number',
            ),
        );
      const identityOf = (row: Record<string, unknown>, index: number) =>
        generation
          ? 'process=' + JSON.stringify([row.Pid, row.JobNumber, row.StartTimeUTC])
          : identity
            ? identity + '=' + String(row[identity])
            : String(index);
      const uniqueGeneration =
        generation &&
        new Set(item.map((row, index) => identityOf(row, index))).size === item.length;
      item
        .slice(0, 250)
        .forEach((row, index) =>
          visit(
            row,
            path +
              '/' +
              segment(generation && !uniqueGeneration ? String(index) : identityOf(row, index)),
            depth + 1,
          ),
        );
      if (item.length > 250) truncated = true;
    } else if (item && typeof item === 'object') {
      const entries = Object.entries(item);
      if (!entries.length) result.set(path, {});
      for (const [name, child] of entries) visit(child, path + '/' + segment(name), depth + 1);
    } else result.set(path || '(value)', item);
  };
  visit(value, '', 0);
  return { values: result, truncated };
}
export function compareRuns(before: Run, after: Run): RunComparison {
  if (before.instance !== after.instance)
    throw new Error('Compare runs from the same configured instance.');
  const left = observations(before),
    right = observations(after);
  const sources: SourceComparison[] = [];
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const previous = left.get(key),
      current = right.get(key);
    const beforeCollectionNotice = collectionLimitNotice(previous),
      afterCollectionNotice = collectionLimitNotice(current);
    const comparison: SourceComparison = {
      key,
      title: current?.title ?? previous!.title,
      state: 'compared',
      beforeAt: previous?.finishedAt,
      afterAt: current?.finishedAt,
      ...(beforeCollectionNotice && previous?.collection
        ? { beforeCollection: { ...previous.collection } }
        : {}),
      ...(afterCollectionNotice && current?.collection
        ? { afterCollection: { ...current.collection } }
        : {}),
      beforeCollectionNotice,
      afterCollectionNotice,
      changes: [],
      unchanged: 0,
      truncated: false,
      note: '',
    };
    if (!previous || !current) {
      comparison.state = previous ? 'missing-after' : 'missing-before';
      comparison.note =
        'This source was not included in both runs. Its absence is not evidence that a native object was deleted.';
    } else if (
      previous.status !== 'done' ||
      current.status !== 'done' ||
      previous.evidence === undefined ||
      current.evidence === undefined
    ) {
      comparison.state = 'unavailable';
      comparison.note =
        'At least one observation did not complete. Its missing result is not compared as an empty value.';
    } else {
      const source = key.split('\0')[0];
      const a = fields(previous.evidence, source),
        b = fields(current.evidence, source);
      comparison.truncated = a.truncated || b.truncated;
      for (const path of new Set([...a.values.keys(), ...b.values.keys()])) {
        const av = a.values.get(path),
          bv = b.values.get(path);
        if ((a.truncated || b.truncated) && (!a.values.has(path) || !b.values.has(path))) continue;
        if (JSON.stringify(av) === JSON.stringify(bv) && a.values.has(path) === b.values.has(path))
          comparison.unchanged++;
        else if (comparison.changes.length < 300)
          comparison.changes.push({
            path,
            before: av,
            after: bv,
            change: !a.values.has(path) ? 'added' : !b.values.has(path) ? 'removed' : 'changed',
          });
        else comparison.truncated = true;
      }
      comparison.note =
        (comparison.truncated
          ? 'Partial comparison: omitted fields are not treated as additions or removals. '
          : '') +
        'Recorded values only. A value present only in one response does not establish native object creation or deletion. Ordered configuration arrays are compared by position; known root inventories use stable native identities. ' +
        (source === 'processes'
          ? 'Process rows without job number and start time cannot establish process continuity and are compared by position. '
          : '') +
        'Time-dependent counters and timestamps normally change; differences do not by themselves identify an incident.';
    }
    sources.push(comparison);
  }
  return {
    before: { id: before.id, title: before.title, createdAt: before.createdAt },
    after: { id: after.id, title: after.title, createdAt: after.createdAt },
    instance: before.instance,
    sources,
    totals: {
      changed: sources.reduce((total, item) => total + item.changes.length, 0),
      unchanged: sources.reduce((total, item) => total + item.unchanged, 0),
      unavailable: sources.filter((item) => item.state === 'unavailable').length,
      missing: sources.filter((item) => item.state.startsWith('missing')).length,
    },
  };
}
