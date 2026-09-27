import type { ProcedureStep, ProcedureVersion } from './procedure.js';
import type { Handover, RunNote } from './run-records.js';
export type TemplateId = 'observe' | 'application-window' | 'task-window';
export type StepKind =
  | 'info'
  | 'health'
  | 'host'
  | 'logs'
  | 'inspect-app'
  | 'disable-app'
  | 'restore-app'
  | 'inspect-task'
  | 'suspend-task'
  | 'restore-task'
  | 'task-history'
  | 'checkpoint'
  | 'processes'
  | 'task-inventory'
  | 'application-inventory'
  | 'journal-inventory';
export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'uncertain' | 'skipped';
export type RunStep = {
  kind: StepKind;
  title: string;
  description: string;
  status: StepStatus;
  attempts: number;
  startedAt?: string;
  finishedAt?: string;
  evidence?: unknown;
  error?: string;
  note?: string;
  procedureStep?: ProcedureStep;
  checklist?: { completed: string[]; note: string; actor: string; at: string };
};
export type RunEvent = { at: string; action: string; message: string };
export type Run = {
  version: 1;
  id: string;
  owner: string;
  instance: string;
  template: TemplateId;
  title: string;
  target: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'completed' | 'stopped';
  needsRestore: boolean;
  original?: boolean;
  steps: RunStep[];
  events: RunEvent[];
  procedure?: { id: string; version: ProcedureVersion };
  archivedAt?: string;
  closureNote?: string;
  revision?: number;
  handover?: Handover;
  notes?: RunNote[];
};
export type RunSummary = Pick<
  Run,
  | 'id'
  | 'title'
  | 'target'
  | 'template'
  | 'createdAt'
  | 'updatedAt'
  | 'status'
  | 'needsRestore'
  | 'archivedAt'
> & {
  completed: number;
  total: number;
  attention: boolean;
  openFollowUps?: number;
  nextFollowUpAt?: string;
  unresolvedSteps?: number;
  pendingStep?: string;
};
export const templates: Record<
  TemplateId,
  {
    title: string;
    description: string;
    target: 'none' | 'app' | 'task';
    steps: Array<Pick<RunStep, 'kind' | 'title' | 'description'>>;
  }
> = {
  observe: {
    title: 'Observe an instance',
    description:
      'Capture identity, health, host capacity and recent system messages in one report.',
    target: 'none',
    steps: [
      {
        kind: 'info',
        title: 'Identify the instance',
        description: 'Record the API version and product information.',
      },
      {
        kind: 'health',
        title: 'Capture system health',
        description: 'Read the native IRIS monitor, including its freshness indicator.',
      },
      {
        kind: 'host',
        title: 'Capture host capacity',
        description: 'Read CPU counters, memory and disk capacity from the protected extension.',
      },
      {
        kind: 'logs',
        title: 'Collect recent messages',
        description: 'Attach a bounded excerpt from the original system log.',
      },
    ],
  },
  'application-window': {
    title: 'Application maintenance window',
    description:
      'Record the current state, disable a route, pause for your work, then restore its original state.',
    target: 'app',
    steps: [
      {
        kind: 'inspect-app',
        title: 'Record the original state',
        description: 'Read the selected application and remember whether it was enabled.',
      },
      {
        kind: 'disable-app',
        title: 'Disable the application',
        description:
          'Check for a changed state, disable the route and verify the result. Existing sessions may remain active.',
      },
      {
        kind: 'checkpoint',
        title: 'Perform and review the maintenance',
        description:
          'Complete your external work and record a note before restoring access. Waypoint does not run arbitrary shell commands.',
      },
      {
        kind: 'restore-app',
        title: 'Restore the original state',
        description:
          'Restore a change made by this run and read it back. If this run made no change, preserve the current state.',
      },
      {
        kind: 'logs',
        title: 'Collect closing evidence',
        description: 'Attach recent system messages for follow-up review.',
      },
    ],
  },
  'task-window': {
    title: 'Task scheduling window',
    description:
      'Pause future scheduling while work is carried out, then restore the task’s previous suspension state.',
    target: 'task',
    steps: [
      {
        kind: 'inspect-task',
        title: 'Record task scheduling state',
        description: 'Read the authoritative task information, not the cached list flag.',
      },
      {
        kind: 'suspend-task',
        title: 'Suspend future scheduling',
        description:
          'Suspend the task and verify its state. A task already running is not terminated.',
      },
      {
        kind: 'checkpoint',
        title: 'Review the work and readiness',
        description: 'Record what was done and whether it is safe to restore scheduling.',
      },
      {
        kind: 'restore-task',
        title: 'Restore original scheduling',
        description:
          'Restore scheduling changed by this run. If the task was already suspended, preserve its current state.',
      },
      {
        kind: 'task-history',
        title: 'Collect execution history',
        description:
          'Read recent task history as evidence, without assuming a successful task execution.',
      },
    ],
  },
};
export const writeStep = (kind: StepKind) =>
  ['disable-app', 'restore-app', 'suspend-task', 'restore-task'].includes(kind);
export function nextStep(run: Run): number {
  return run.steps.findIndex((s) => !['done', 'skipped'].includes(s.status));
}
export function summarize(run: Run): RunSummary {
  return {
    id: run.id,
    title: run.title,
    target: run.target,
    template: run.template,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    status: run.status,
    needsRestore: run.needsRestore,
    archivedAt: run.archivedAt,
    completed: run.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length,
    total: run.steps.length,
    openFollowUps: run.handover?.nextActions.filter((action) => !action.completed).length ?? 0,
    nextFollowUpAt: run.handover?.nextActions
      .filter((action) => !action.completed && action.dueAt)
      .map((action) => action.dueAt)
      .sort((left, right) => Date.parse(left) - Date.parse(right))[0],
    unresolvedSteps: run.steps.filter(
      (step) => step.status === 'uncertain' || step.status === 'running',
    ).length,
    pendingStep: run.steps.find((step) => !['done', 'skipped'].includes(step.status))?.title,
    attention: run.steps.some(
      (s) =>
        s.status === 'failed' ||
        s.status === 'uncertain' ||
        (s.procedureStep?.kind === 'assertion' &&
          ['failed', 'unknown'].includes(
            (s.evidence as { outcome?: string } | undefined)?.outcome ?? '',
          )),
    ),
  };
}
