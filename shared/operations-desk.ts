import type { RunSummary } from './runbook.js';
import type { ProcedureSummary } from './procedure.js';
import type { CommandResult } from './command-result.js';
export type DeskCommand = Pick<
  CommandResult,
  'id' | 'title' | 'target' | 'status' | 'createdAt' | 'updatedAt' | 'message' | 'operation'
>;
export type DeskSource<T> = { data?: T; error?: string; readAt: string };
export type DeskSnapshot = {
  runs: DeskSource<RunSummary[]>;
  commands: DeskSource<DeskCommand[]>;
  procedures: DeskSource<ProcedureSummary[]>;
};
export type DeskIssue = {
  id: string;
  recordId: string;
  kind:
    | 'restore'
    | 'uncertain-run'
    | 'run-review'
    | 'follow-up'
    | 'command-uncertain'
    | 'command-review';
  urgency: 'restore' | 'verify' | 'review';
  title: string;
  target: string;
  detail: string;
  at: string;
  dueAt?: string;
  link: 'run' | 'command';
};
export type DeskTimelineEvent = {
  id: string;
  recordId: string;
  source: 'run' | 'command' | 'procedure';
  title: string;
  target: string;
  at: string;
  state: string;
};
export function deskIssues(snapshot: DeskSnapshot, now = Date.now()): DeskIssue[] {
  const issues: DeskIssue[] = [];
  for (const run of snapshot.runs.data ?? []) {
    if (run.needsRestore)
      issues.push({
        id: 'restore:' + run.id,
        recordId: run.id,
        kind: 'restore',
        urgency: 'restore',
        title: run.title,
        target: run.target,
        detail:
          'This run still owns a restoration obligation. Inspect its recorded original state and current native state before closing it.',
        at: run.updatedAt,
        link: 'run',
      });
    if ((run.unresolvedSteps ?? 0) > 0)
      issues.push({
        id: 'uncertain:' + run.id,
        recordId: run.id,
        kind: 'uncertain-run',
        urgency: 'verify',
        title: run.title,
        target: run.target,
        detail: `${run.unresolvedSteps} step(s) may have an unresolved native outcome. Read the current state; do not assume the command failed.`,
        at: run.updatedAt,
        link: 'run',
      });
    else if (run.attention)
      issues.push({
        id: 'review:' + run.id,
        recordId: run.id,
        kind: 'run-review',
        urgency: 'review',
        title: run.title,
        target: run.target,
        detail: 'A failed step or failed/unknown recorded-result check needs an operator decision.',
        at: run.updatedAt,
        link: 'run',
      });
    if ((run.openFollowUps ?? 0) > 0) {
      const due = run.nextFollowUpAt ? Date.parse(run.nextFollowUpAt) : undefined;
      const overdue = due !== undefined && Number.isFinite(due) && due < now;
      issues.push({
        id: 'follow-up:' + run.id,
        recordId: run.id,
        kind: 'follow-up',
        urgency: overdue ? 'verify' : 'review',
        title: run.title,
        target: run.target,
        detail: `${run.openFollowUps} open handover action(s). ${overdue ? 'The earliest recorded deadline has passed.' : 'Review ownership and any recorded deadlines.'}`,
        at: run.updatedAt,
        dueAt: run.nextFollowUpAt,
        link: 'run',
      });
    }
  }
  for (const command of snapshot.commands.data ?? []) {
    if (['dispatching', 'uncertain'].includes(command.status))
      issues.push({
        id: 'command:' + command.id,
        recordId: command.id,
        kind: 'command-uncertain',
        urgency: 'verify',
        title: command.title,
        target: command.target,
        detail: command.message,
        at: command.updatedAt,
        link: 'command',
      });
    else if (['rejected', 'conflict'].includes(command.status))
      issues.push({
        id: 'command:' + command.id,
        recordId: command.id,
        kind: 'command-review',
        urgency: 'review',
        title: command.title,
        target: command.target,
        detail: command.message,
        at: command.updatedAt,
        link: 'command',
      });
  }
  const rank = { restore: 0, verify: 1, review: 2 };
  return issues.sort(
    (a, b) =>
      rank[a.urgency] - rank[b.urgency] ||
      (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') ||
      b.at.localeCompare(a.at),
  );
}
export function deskTimeline(snapshot: DeskSnapshot): DeskTimelineEvent[] {
  return [
    ...(snapshot.runs.data ?? []).map((run) => ({
      id: 'run:' + run.id,
      recordId: run.id,
      source: 'run' as const,
      title: run.title,
      target: run.target,
      at: run.updatedAt,
      state: run.archivedAt ? 'archived' : run.status,
    })),
    ...(snapshot.commands.data ?? []).map((command) => ({
      id: 'command:' + command.id,
      recordId: command.id,
      source: 'command' as const,
      title: command.title,
      target: command.target,
      at: command.updatedAt,
      state: command.status,
    })),
    ...(snapshot.procedures.data ?? []).map((procedure) => ({
      id: 'procedure:' + procedure.id,
      recordId: procedure.id,
      source: 'procedure' as const,
      title: procedure.title,
      target: '',
      at: procedure.updatedAt,
      state: procedure.archived ? 'archived' : 'version ' + procedure.versionCount,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}
export function deskCounts(snapshot: DeskSnapshot, now = Date.now()) {
  const runs = snapshot.runs.data ?? [],
    commands = snapshot.commands.data ?? [],
    procedures = snapshot.procedures.data ?? [];
  return {
    incompleteSources: Object.values(snapshot).filter(
      (source) => source.error || source.data === undefined,
    ).length,
    activeRuns: runs.filter((run) => run.status === 'active').length,
    restorationObligations: runs.filter((run) => run.needsRestore).length,
    unresolvedCommands: commands.filter((command) =>
      ['uncertain', 'dispatching'].includes(command.status),
    ).length,
    followUps: runs.reduce((sum, run) => sum + (run.openFollowUps ?? 0), 0),
    overdueRuns: runs.filter((run) => run.nextFollowUpAt && Date.parse(run.nextFollowUpAt) < now)
      .length,
    availableProcedures: procedures.filter((procedure) => !procedure.archived).length,
    archivedRuns: runs.filter((run) => !!run.archivedAt).length,
  };
}
export function nextDeskAction(issue: DeskIssue) {
  switch (issue.kind) {
    case 'restore':
      return 'Inspect original state, read current target, and use the run’s restore action when appropriate.';
    case 'uncertain-run':
      return 'Open the run and reconcile its unresolved step before deciding on another native change.';
    case 'command-uncertain':
      return 'Open the durable command record and use read-only reconciliation. Do not resend the old command.';
    case 'follow-up':
      return 'Open the owner-recorded handover and update completion or the agreed deadline.';
    case 'command-review':
      return 'Review the native error or changed precondition. Prepare a fresh review only after resolving it.';
    case 'run-review':
      return 'Inspect the failed/unknown evidence, document the decision and continue only if justified.';
  }
}
export function groupIssuesByTarget(issues: DeskIssue[]) {
  const groups = new Map<string, { target: string; issues: DeskIssue[] }>();
  for (const issue of issues) {
    const target = issue.target || 'Instance-wide';
    const key = target.toLowerCase().replace(/\/+$/, '');
    const existing = groups.get(key);
    if (existing) existing.issues.push(issue);
    else groups.set(key, { target, issues: [issue] });
  }
  return [...groups.values()].sort(
    (a, b) => b.issues.length - a.issues.length || a.target.localeCompare(b.target),
  );
}
export function exportDesk(snapshot: DeskSnapshot, now = Date.now()) {
  return {
    format: 'waypoint-operations-desk-1',
    exportedAt: new Date(now).toISOString(),
    scope:
      'Current account and configured instance only. Source errors mean incomplete visibility, not an empty workload.',
    counts: deskCounts(snapshot, now),
    issues: deskIssues(snapshot, now),
    timeline: deskTimeline(snapshot),
    sources: Object.fromEntries(
      Object.entries(snapshot).map(([name, source]) => [
        name,
        { readAt: source.readAt, error: source.error, loaded: source.data?.length ?? 0 },
      ]),
    ),
  };
}
