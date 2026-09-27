import { z } from 'zod';
import type { CommandResult } from '../shared/command-result.js';

const outcome = z.enum([
  'reviewed',
  'dispatching',
  'verified',
  'acknowledged',
  'uncertain',
  'rejected',
  'conflict',
  'expired',
]);
const timestamp = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const query = z.record(z.string(), z.string());
const object = z.record(z.string(), z.unknown());
const storedCommand = z.object({
  format: z.literal(1),
  id: z.string().uuid(),
  owner: z.string(),
  instance: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
  expiresAt: timestamp,
  status: outcome,
  operation: z.object({
    path: z.string(),
    method: z.enum(['POST', 'PUT', 'DELETE']),
    query,
  }),
  title: z.string(),
  target: z.string(),
  confirmation: z.string(),
  before: object.nullable(),
  proposed: object,
  fields: z.array(z.string()),
  writeOnlyFields: z.array(z.string()),
  nativeIdentity: z
    .object({
      pid: z.string(),
      started: z.string(),
      job: z.string(),
      user: z.string(),
    })
    .optional(),
  read: z.object({
    path: z.string(),
    query,
    mode: z.enum([
      'fields',
      'absence',
      'task-state',
      'process-state',
      'process-absence',
      'acknowledgement',
    ]),
  }),
  requestedState: z.boolean().optional(),
  dispatchAt: timestamp.optional(),
  responseStatus: z.number().int().optional(),
  response: z.unknown().optional(),
  asyncId: z.string().optional(),
  observed: z.unknown().optional(),
  observedAt: timestamp.optional(),
  message: z.string(),
  events: z.array(z.object({ at: timestamp, status: outcome, message: z.string() })),
});

/** Validate consumers' fields without normalizing evidence or removing legacy extensions. */
export function validateStoredCommand(value: unknown): asserts value is CommandResult {
  storedCommand.parse(value);
}
