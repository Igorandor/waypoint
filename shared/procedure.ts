import { z } from 'zod';
import { taskExecutionState } from './task-insights.js';
export const assertionDefinitions = {
  'capture-present': { title: 'Observation was captured', source: null, threshold: false },
  'monitor-running': { title: 'System monitor is running', source: 'health', threshold: false },
  'application-enabled': {
    title: 'Application is enabled',
    source: 'application',
    threshold: false,
  },
  'task-suspended': {
    title: 'Task scheduling is suspended',
    source: 'task-state',
    threshold: false,
  },
  'task-not-running': {
    title: 'Task is not currently running',
    source: 'task-state',
    threshold: false,
  },
  'task-last-success': {
    title: 'Last reported task execution succeeded',
    source: 'task-state',
    threshold: false,
  },
  'memory-headroom': {
    title: 'Available memory meets minimum percentage',
    source: 'capacity',
    threshold: true,
  },
  'disk-headroom': {
    title: 'Free disk meets minimum percentage',
    source: 'capacity',
    threshold: true,
  },
} as const;

export const observationSources = {
  identity: { title: 'Instance identity', target: 'none' },
  health: { title: 'System monitor', target: 'none' },
  capacity: { title: 'Host capacity', target: 'none' },
  messages: { title: 'Recent system messages', target: 'none' },
  alerts: { title: 'Recent alert messages', target: 'none' },
  applications: { title: 'Application inventory', target: 'none' },
  tasks: { title: 'Scheduled task inventory', target: 'none' },
  processes: { title: 'Process inventory', target: 'none' },
  journals: { title: 'Journal inventory', target: 'none' },
  application: { title: 'Application configuration', target: 'application' },
  task: { title: 'Task configuration', target: 'task' },
  'task-state': { title: 'Task scheduling state', target: 'task' },
  'task-history': { title: 'Task execution history', target: 'task' },
} as const;

export type ObservationSource = keyof typeof observationSources;
export const sourceNames = Object.keys(observationSources) as [
  ObservationSource,
  ...ObservationSource[],
];
const identifier = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-zA-Z0-9_-]+$/);
const title = z.string().trim().min(1).max(100);
const paragraph = z.string().trim().max(2000);
export const referenceSchema = z
  .string()
  .max(1000)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'References must be HTTPS links without embedded credentials.');

const observationSchema = z
  .object({
    id: identifier,
    kind: z.literal('observation'),
    title,
    instruction: paragraph,
    source: z.enum(sourceNames),
    target: z.string().trim().max(256).default(''),
  })
  .strict();

const checklistSchema = z
  .object({
    id: identifier,
    kind: z.literal('checklist'),
    title,
    instruction: paragraph,
    items: z
      .array(z.object({ id: identifier, text: title, required: z.boolean() }).strict())
      .min(1)
      .max(12),
    requireNote: z.boolean(),
    reference: referenceSchema.default(''),
  })
  .strict();

const assertionSchema = z
  .object({
    id: identifier,
    kind: z.literal('assertion'),
    title,
    instruction: paragraph,
    check: z.enum(
      Object.keys(assertionDefinitions) as [
        keyof typeof assertionDefinitions,
        ...Array<keyof typeof assertionDefinitions>,
      ],
    ),
    sourceStepId: identifier,
    expected: z.boolean().default(true),
    threshold: z.number().finite().min(0).max(100).optional(),
  })
  .strict();

export const procedureStepSchema = z.discriminatedUnion('kind', [
  observationSchema,
  checklistSchema,
  assertionSchema,
]);

export const procedureBodySchema = z
  .object({
    title,
    description: paragraph,
    expectedOutcome: paragraph,
    tags: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(24)
          .regex(/^[a-zA-Z0-9 _-]+$/),
      )
      .max(8),
    steps: z.array(procedureStepSchema).min(1).max(30),
  })
  .strict()
  .superRefine((body, context) => {
    const previous = new Map<string, z.infer<typeof procedureStepSchema>>();
    body.steps.forEach((step, index) => {
      const issue = (message: string) =>
        context.addIssue({ code: 'custom', path: ['steps', index], message });
      if (previous.has(step.id)) issue('Step identifiers must be unique.');
      if (step.kind === 'observation') {
        const target = observationSources[step.source].target;
        if (target === 'task' && !/^[1-9]\d{0,14}$/.test(step.target))
          issue('A positive task identifier is required.');
        if (
          target === 'application' &&
          (!step.target.startsWith('/') || /[\x00-\x1f?#\\]/.test(step.target))
        )
          issue('Use the exact application path, without a query or fragment.');
        if (target === 'none' && step.target) issue('This source has no target.');
      }
      if (
        step.kind === 'checklist' &&
        new Set(step.items.map((item) => item.id)).size !== step.items.length
      )
        issue('Checklist item identifiers must be unique.');
      if (step.kind === 'assertion') {
        if (assertionDefinitions[step.check].threshold && step.threshold === undefined)
          issue('This capacity check requires a minimum percentage.');
        if (!assertionDefinitions[step.check].threshold && step.threshold !== undefined)
          issue('This boolean check does not accept a capacity threshold.');
        const source = previous.get(step.sourceStepId);
        if (!source || source.kind !== 'observation')
          issue('An assertion must refer to an earlier observation.');
        else {
          const expectedSource = assertionDefinitions[step.check].source;
          if (expectedSource && source.source !== expectedSource)
            issue('The observation source does not support this assertion.');
        }
      }
      previous.set(step.id, step);
    });
    if (new Set(body.tags.map((tag) => tag.toLowerCase())).size !== body.tags.length)
      context.addIssue({ code: 'custom', path: ['tags'], message: 'Tags must be distinct.' });
  });

export type ProcedureBody = z.infer<typeof procedureBodySchema>;
export type ProcedureStep = z.infer<typeof procedureStepSchema>;
export type ProcedureVersion = {
  number: number;
  createdAt: string;
  createdBy: string;
  changeNote: string;
  body: ProcedureBody;
};
export type Procedure = {
  format: 1;
  id: string;
  owner: string;
  instance: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  versions: ProcedureVersion[];
};
export type ProcedureSummary = Pick<
  Procedure,
  'id' | 'revision' | 'createdAt' | 'updatedAt' | 'archived'
> & {
  title: string;
  description: string;
  tags: string[];
  stepCount: number;
  versionCount: number;
};
export function procedureSummary(procedure: Procedure): ProcedureSummary {
  const latest = procedure.versions.at(-1)!;
  return {
    id: procedure.id,
    revision: procedure.revision,
    createdAt: procedure.createdAt,
    updatedAt: procedure.updatedAt,
    archived: procedure.archived,
    title: latest.body.title,
    description: latest.body.description,
    tags: latest.body.tags,
    stepCount: latest.body.steps.length,
    versionCount: procedure.versions.length,
  };
}
export const procedureImportSchema = z
  .object({
    format: z.literal('waypoint-procedure-1'),
    body: procedureBodySchema,
  })
  .strict();

export type AssertionResult = {
  outcome: 'passed' | 'failed' | 'unknown';
  check: string;
  expected: boolean;
  observed?: boolean;
  message: string;
  sourceStepId: string;
  measurement?: { value: number; unit: string; threshold: number };
};
export function evaluateAssertion(
  assertion: Extract<ProcedureStep, { kind: 'assertion' }>,
  source: { status: string; evidence?: unknown } | undefined,
): AssertionResult {
  const result: AssertionResult = {
    outcome: 'unknown',
    check: assertion.check,
    expected: assertion.expected,
    sourceStepId: assertion.sourceStepId,
    message: 'The referenced observation is missing or unsuccessful.',
  };
  if (!source || source.status !== 'done' || source.evidence === undefined) return result;
  const data = source.evidence;
  let observed: boolean | undefined;
  if (assertion.check === 'capture-present') observed = true;
  else if (data && typeof data === 'object' && !Array.isArray(data)) {
    const object = data as Record<string, unknown>;
    if (assertion.check === 'monitor-running') {
      const status = object.Status;
      if (
        status &&
        typeof status === 'object' &&
        typeof (status as Record<string, unknown>).SystemMonitor === 'boolean'
      )
        observed = (status as Record<string, unknown>).SystemMonitor as boolean;
    } else if (assertion.check === 'memory-headroom' || assertion.check === 'disk-headroom') {
      const section = object[assertion.check === 'memory-headroom' ? 'memory' : 'disk'] as
        Record<string, unknown> | undefined;
      const total = section?.total,
        free = section?.[assertion.check === 'memory-headroom' ? 'available' : 'free'];
      if (
        typeof total === 'number' &&
        Number.isFinite(total) &&
        total > 0 &&
        typeof free === 'number' &&
        Number.isFinite(free) &&
        free >= 0 &&
        free <= total &&
        assertion.threshold !== undefined
      ) {
        const percentage = (100 * free) / total;
        observed = percentage >= assertion.threshold;
        result.measurement = {
          value: percentage,
          unit: 'percent available',
          threshold: assertion.threshold,
        };
      }
    } else if (assertion.check === 'task-not-running' || assertion.check === 'task-last-success') {
      const state = taskExecutionState(object);
      if (state !== 'unknown')
        observed =
          assertion.check === 'task-not-running' ? state !== 'running' : state === 'success';
    } else {
      const field = assertion.check === 'application-enabled' ? 'Enabled' : 'Suspended';
      if (typeof object[field] === 'boolean') observed = object[field] as boolean;
    }
  }
  if (observed === undefined)
    return {
      ...result,
      message:
        'The source did not provide the required typed state or capacity fields. No pass is inferred.',
    };
  return {
    ...result,
    observed,
    outcome: observed === assertion.expected ? 'passed' : 'failed',
    message:
      observed === assertion.expected
        ? 'The recorded observation matches the expected state.'
        : 'The recorded observation differs from the expected state.',
  };
}
