import { z } from 'zod';
import type { Run } from '../shared/runbook.js';
import { procedureBodySchema, procedureStepSchema } from '../shared/procedure.js';
import { handoverInputSchema } from '../shared/run-records.js';

const timestamp = z.string().datetime();
const counter = z.number().int().nonnegative();

// Input defaults are useful when authoring a procedure, but a saved snapshot must
// contain the fields its consumers use. Validation never supplies missing data.
const storedProcedureStep = procedureStepSchema.and(
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('observation'), target: z.string() }),
    z.object({ kind: z.literal('assertion'), expected: z.boolean() }),
    z.object({ kind: z.literal('checklist'), reference: z.string() }),
  ]),
);
const storedProcedureBody = procedureBodySchema.and(
  z.object({ steps: z.array(storedProcedureStep) }),
);
const step = z.object({
  kind: z.enum([
    'info',
    'health',
    'host',
    'logs',
    'inspect-app',
    'disable-app',
    'restore-app',
    'inspect-task',
    'suspend-task',
    'restore-task',
    'task-history',
    'checkpoint',
    'processes',
    'task-inventory',
    'application-inventory',
    'journal-inventory',
  ]),
  title: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'running', 'done', 'failed', 'uncertain', 'skipped']),
  attempts: counter,
  startedAt: timestamp.optional(),
  finishedAt: timestamp.optional(),
  evidence: z.unknown().optional(),
  collection: z
    .object({ requestedRowLimit: z.number().int().positive().max(1000) })
    .strict()
    .optional(),
  error: z.string().optional(),
  note: z.string().optional(),
  procedureStep: storedProcedureStep.optional(),
  checklist: z
    .object({
      completed: z.array(z.string()),
      note: z.string(),
      actor: z.string(),
      at: timestamp,
    })
    .optional(),
});
const storedRun = z.object({
  version: z.literal(1),
  id: z.string(),
  owner: z.string(),
  instance: z.string(),
  template: z.enum(['observe', 'application-window', 'task-window']),
  title: z.string(),
  target: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
  status: z.enum(['active', 'completed', 'stopped']),
  needsRestore: z.boolean(),
  original: z.boolean().optional(),
  steps: z.array(step).min(1),
  events: z.array(z.object({ at: timestamp, action: z.string(), message: z.string() })),
  procedure: z
    .object({
      id: z.string(),
      version: z.object({
        number: z.number().int().positive(),
        createdAt: timestamp,
        createdBy: z.string(),
        changeNote: z.string(),
        body: storedProcedureBody,
      }),
    })
    .optional(),
  archivedAt: timestamp.optional(),
  closureNote: z.string().optional(),
  revision: counter.optional(),
  handover: handoverInputSchema
    .safeExtend({
      revision: counter,
      updatedAt: timestamp,
      updatedBy: z.string(),
      deliveryRecordedAt: timestamp.optional(),
    })
    .optional(),
  notes: z
    .array(
      z.object({
        id: z.string(),
        at: timestamp,
        author: z.string(),
        text: z.string(),
        category: z.enum(['observation', 'decision', 'follow-up']),
      }),
    )
    .optional(),
});

/** Check without replacing the original record or changing evidence and legacy extensions. */
export function validateStoredRun(value: unknown): asserts value is Run {
  storedRun.parse(value);
}
