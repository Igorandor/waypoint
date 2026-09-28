import type { ProcedureStep, ProcedureVersion } from './procedure.js';
export type ProcedureFieldChange = { field: string; before: unknown; after: unknown };
export type ProcedureStepChange = {
  id: string;
  title: string;
  kind: 'added' | 'removed' | 'changed' | 'moved' | 'unchanged';
  beforePosition?: number;
  afterPosition?: number;
  fields: ProcedureFieldChange[];
  dependencyChanged: boolean;
};
export type ProcedureVersionComparison = {
  before: number;
  after: number;
  metadata: ProcedureFieldChange[];
  steps: ProcedureStepChange[];
  changedSteps: number;
  movedSteps: number;
  addedSteps: number;
  removedSteps: number;
};
function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, normalized(child)]),
    );
  return value;
}
function different(before: unknown, after: unknown) {
  return JSON.stringify(normalized(before)) !== JSON.stringify(normalized(after));
}
function stepFields(before?: ProcedureStep, after?: ProcedureStep): ProcedureFieldChange[] {
  const a = (before ?? {}) as Record<string, unknown>,
    b = (after ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((field) => field !== 'id' && different(a[field], b[field]))
    .map((field) => ({ field, before: a[field], after: b[field] }));
}
export function compareProcedureVersions(
  before: ProcedureVersion,
  after: ProcedureVersion,
): ProcedureVersionComparison {
  const metadata: ProcedureFieldChange[] = [];
  for (const field of ['title', 'description', 'expectedOutcome', 'tags'] as const)
    if (different(before.body[field], after.body[field]))
      metadata.push({ field, before: before.body[field], after: after.body[field] });
  const previous = new Map(before.body.steps.map((step, index) => [step.id, { step, index }]));
  const current = new Map(after.body.steps.map((step, index) => [step.id, { step, index }]));
  const changes: ProcedureStepChange[] = [];
  for (const [id, right] of current) {
    const left = previous.get(id);
    if (!left) {
      changes.push({
        id,
        title: right.step.title,
        kind: 'added',
        afterPosition: right.index + 1,
        fields: stepFields(undefined, right.step),
        dependencyChanged: right.step.kind === 'assertion',
      });
      continue;
    }
    const fields = stepFields(left.step, right.step);
    const moved = left.index !== right.index;
    changes.push({
      id,
      title: right.step.title,
      kind: fields.length ? 'changed' : moved ? 'moved' : 'unchanged',
      beforePosition: left.index + 1,
      afterPosition: right.index + 1,
      fields,
      dependencyChanged: fields.some(
        (field) =>
          field.field === 'sourceStepId' ||
          field.field === 'source' ||
          field.field === 'target' ||
          field.field === 'check',
      ),
    });
  }
  for (const [id, left] of previous)
    if (!current.has(id))
      changes.push({
        id,
        title: left.step.title,
        kind: 'removed',
        beforePosition: left.index + 1,
        fields: stepFields(left.step, undefined),
        dependencyChanged: left.step.kind === 'observation' || left.step.kind === 'assertion',
      });
  return {
    before: before.number,
    after: after.number,
    metadata,
    steps: changes,
    changedSteps: changes.filter((step) => step.kind === 'changed').length,
    movedSteps: changes.filter(
      (step) =>
        step.beforePosition !== undefined &&
        step.afterPosition !== undefined &&
        step.beforePosition !== step.afterPosition,
    ).length,
    addedSteps: changes.filter((step) => step.kind === 'added').length,
    removedSteps: changes.filter((step) => step.kind === 'removed').length,
  };
}
export function displayProcedureValue(value: unknown) {
  if (value === undefined) return '(not present)';
  if (value === '') return '(empty)';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}
