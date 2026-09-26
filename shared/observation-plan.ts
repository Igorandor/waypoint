import type { RunStep } from './runbook.js';
export const observationSteps = {
  info: { title: 'Identify the instance', description: 'Capture product and API version.' },
  health: {
    title: 'Check system health',
    description: 'Capture the native monitor; inspect its freshness before drawing conclusions.',
  },
  host: {
    title: 'Inspect host capacity',
    description:
      'Capture memory, disk and cumulative CPU counters; these are host values, not container quotas.',
  },
  logs: {
    title: 'Read recent system messages',
    description: 'Record up to 100 lines from the bounded system log tail.',
  },
  processes: {
    title: 'Inventory running processes',
    description: 'Read up to 100 processes without suspending or terminating them.',
  },
  'task-inventory': {
    title: 'Inventory scheduled tasks',
    description:
      'Read up to 100 task definitions. List suspension flags may lag; this is not an authoritative scheduling-state check.',
  },
  'application-inventory': {
    title: 'Inventory application routes',
    description: 'Read up to 100 web applications without changing availability.',
  },
  'journal-inventory': {
    title: 'Inspect journal files',
    description: 'Read journal-file metadata; no log switch or purge is performed.',
  },
} as const;
export type ObservationKind = keyof typeof observationSteps;
export const defaultObservation: ObservationKind[] = ['info', 'health', 'host', 'logs'];
export function buildObservationPlan(
  value: unknown,
): Array<Pick<RunStep, 'kind' | 'title' | 'description'>> {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 8 ||
    new Set(value).size !== value.length ||
    value.some((key) => typeof key !== 'string' || !Object.hasOwn(observationSteps, key))
  )
    throw new Error('Select one to eight different observation sources.');
  return value.map((key) => ({
    kind: key as ObservationKind,
    ...observationSteps[key as ObservationKind],
  }));
}
