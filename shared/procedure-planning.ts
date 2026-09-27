import {
  procedureBodySchema,
  assertionDefinitions,
  observationSources,
  type ProcedureBody,
  type ProcedureStep,
} from './procedure.js';
export type ProcedurePurpose = 'capacity' | 'application' | 'task' | 'shift';
export type ProcedureSetup = {
  purpose: ProcedurePurpose;
  target: string;
  title: string;
  minimumMemory: number;
  minimumDisk: number;
  expectedEnabled: boolean;
  includeLogs: boolean;
  reference: string;
};
function observation(
  id: string,
  title: string,
  source: Extract<ProcedureStep, { kind: 'observation' }>['source'],
  target = '',
  instruction = '',
): ProcedureStep {
  return { id, kind: 'observation', title, instruction, source, target };
}
function assertion(
  id: string,
  title: string,
  sourceStepId: string,
  check: Extract<ProcedureStep, { kind: 'assertion' }>['check'],
  expected = true,
  threshold?: number,
): ProcedureStep {
  return {
    id,
    kind: 'assertion',
    title,
    instruction: 'Review failed or unknown results before making an operational decision.',
    sourceStepId,
    check,
    expected,
    ...(threshold === undefined ? {} : { threshold }),
  };
}
function checkpoint(id: string, title: string, items: string[], reference: string): ProcedureStep {
  return {
    id,
    kind: 'checklist',
    title,
    instruction: 'Record the decision, any unresolved findings and the responsible operator.',
    items: items.map((text, index) => ({ id: 'item-' + index, text, required: true })),
    requireNote: true,
    reference,
  };
}
export function buildSpecializedProcedure(setup: ProcedureSetup): ProcedureBody {
  const steps: ProcedureStep[] = [];
  const target = setup.target.trim();
  if (setup.purpose === 'application') {
    steps.push(
      observation(
        'app-before',
        'Read application configuration',
        'application',
        target,
        'Inspect authentication, namespace and application resource. This procedure does not probe or change the route.',
      ),
    );
    steps.push(
      assertion(
        'app-state',
        'Check expected application state',
        'app-before',
        'application-enabled',
        setup.expectedEnabled,
      ),
    );
    steps.push(
      checkpoint(
        'application-review',
        'Review application dependencies',
        [
          'Confirm the namespace, dispatch class and native application resource',
          'Review authentication and unauthenticated role assignments',
          'Identify the rollback owner and any maintenance window',
        ],
        setup.reference,
      ),
    );
  } else if (setup.purpose === 'task') {
    steps.push(
      observation(
        'task-definition',
        'Read task definition',
        'task',
        target,
        'Inspect execution identity, class, namespace and schedule.',
      ),
    );
    steps.push(
      observation(
        'task-state',
        'Read current task state',
        'task-state',
        target,
        'A suspended scheduler can still have running work.',
      ),
    );
    steps.push(assertion('task-idle', 'Check for running work', 'task-state', 'task-not-running'));
    steps.push(
      observation(
        'task-history',
        'Read recent task executions',
        'task-history',
        target,
        'Check the bounded loaded history for errors and overlapping work.',
      ),
    );
    steps.push(
      checkpoint(
        'task-review',
        'Review task readiness',
        [
          'Confirm run-as identity and task class',
          'Review running work, recent errors and recovery ownership',
          'Confirm scheduling boundaries and notification routing',
        ],
        setup.reference,
      ),
    );
  } else if (setup.purpose === 'shift') {
    steps.push(observation('identity', 'Identify the instance', 'identity'));
    steps.push(observation('monitor', 'Read the system monitor', 'health'));
    steps.push(
      assertion('monitor-check', 'Check the system monitor', 'monitor', 'monitor-running'),
    );
    steps.push(observation('tasks', 'Read the scheduled task inventory', 'tasks'));
    steps.push(observation('journals', 'Read the journal inventory', 'journals'));
  }
  steps.push(
    observation(
      'capacity',
      'Read host-visible capacity',
      'capacity',
      '',
      'Confirm the reported scope and manager-directory filesystem before interpreting these values.',
    ),
  );
  steps.push(
    assertion(
      'memory-check',
      'Check available memory',
      'capacity',
      'memory-headroom',
      true,
      setup.minimumMemory,
    ),
  );
  steps.push(
    assertion(
      'disk-check',
      'Check free disk space',
      'capacity',
      'disk-headroom',
      true,
      setup.minimumDisk,
    ),
  );
  if (setup.includeLogs) {
    steps.push(
      observation(
        'messages',
        'Read recent system messages',
        'messages',
        '',
        'This is a bounded tail, not a full log search.',
      ),
    );
    steps.push(
      observation(
        'alerts',
        'Read recent alerts',
        'alerts',
        '',
        'Review the timestamp range and omitted history before drawing conclusions.',
      ),
    );
  }
  steps.push(
    checkpoint(
      'decision',
      'Record the operational decision',
      [
        'Review every failed or unknown check',
        'Confirm that the loaded evidence is recent enough for this decision',
        'Record readiness, follow-up work and the responsible operator',
      ],
      setup.reference,
    ),
  );
  return procedureBodySchema.parse({
    title: setup.title,
    description: {
      capacity: 'Review host-visible headroom before work begins.',
      application: 'Review a web application and its host capacity before a controlled change.',
      task: 'Review task execution and scheduling evidence before requesting or changing work.',
      shift:
        'Record instance, scheduling, journal and capacity observations for an operational handover.',
    }[setup.purpose],
    expectedOutcome:
      'Recorded observations, explicit check outcomes and an operator decision. Native changes use a separate reviewed command or maintenance window.',
    tags: [setup.purpose, 'readiness'],
    steps,
  });
}
export type PlanFinding = {
  kind: 'review' | 'information';
  title: string;
  detail: string;
  stepIds: string[];
};
export type ProcedureAnalysis = {
  observations: number;
  assertions: number;
  checklists: number;
  requiredItems: number;
  nativeSources: string[];
  targets: string[];
  privileges: string[];
  dependencies: Array<{ source: string; check: string; sourceTitle: string; checkTitle: string }>;
  findings: PlanFinding[];
};
export function analyzeProcedure(body: ProcedureBody): ProcedureAnalysis {
  const observations = body.steps.filter(
    (step): step is Extract<ProcedureStep, { kind: 'observation' }> => step.kind === 'observation',
  );
  const assertions = body.steps.filter(
    (step): step is Extract<ProcedureStep, { kind: 'assertion' }> => step.kind === 'assertion',
  );
  const checklists = body.steps.filter(
    (step): step is Extract<ProcedureStep, { kind: 'checklist' }> => step.kind === 'checklist',
  );
  const findings: PlanFinding[] = [];
  const sources = [...new Set(observations.map((step) => step.source))];
  if (!observations.length)
    findings.push({
      kind: 'review',
      title: 'No native evidence steps',
      detail:
        'This procedure records manual work only. Check whether an observation should support the decision.',
      stepIds: [],
    });
  if (!checklists.some((step) => step.requireNote))
    findings.push({
      kind: 'review',
      title: 'No required operator decision',
      detail:
        'Consider a checkpoint with a required note when the result needs an explicit operational conclusion.',
      stepIds: [],
    });
  const checked = new Set(assertions.map((step) => step.sourceStepId));
  const notChecked = observations.filter((step) => !checked.has(step.id));
  if (notChecked.length)
    findings.push({
      kind: 'information',
      title: 'Some observations require human interpretation',
      detail:
        'These steps are captured without automated checks. This can be appropriate for logs, history and complex configuration.',
      stepIds: notChecked.map((step) => step.id),
    });
  const final = body.steps.at(-1);
  if (final?.kind !== 'checklist')
    findings.push({
      kind: 'information',
      title: 'The last step is not a decision checkpoint',
      detail:
        'Completing the final read or check completes the run. A failed assertion remains recorded and does not automatically roll back other operations.',
      stepIds: final ? [final.id] : [],
    });
  const repeated = new Map<string, string[]>();
  for (const step of observations) {
    const key = step.source + '\0' + step.target;
    repeated.set(key, [...(repeated.get(key) ?? []), step.id]);
  }
  for (const [key, ids] of repeated)
    if (ids.length > 1)
      findings.push({
        kind: 'information',
        title: 'Repeated source observation',
        detail:
          observationSources[key.split('\0')[0] as keyof typeof observationSources].title +
          ' is read more than once. Each step records a separate point in time.',
        stepIds: ids,
      });
  for (const step of assertions) {
    if (assertionDefinitions[step.check].threshold && step.threshold === 0)
      findings.push({
        kind: 'review',
        title: 'A zero headroom threshold cannot detect full capacity',
        detail: 'Choose a minimum that matches the planned workload and native scope.',
        stepIds: [step.id],
      });
    if (step.check === 'capture-present')
      findings.push({
        kind: 'information',
        title: 'Capture presence is not a health check',
        detail:
          'A successful native response can still contain an unhealthy state. This check verifies that evidence was collected.',
        stepIds: [step.id],
      });
  }
  return {
    observations: observations.length,
    assertions: assertions.length,
    checklists: checklists.length,
    requiredItems: checklists.reduce(
      (total, step) => total + step.items.filter((item) => item.required).length,
      0,
    ),
    nativeSources: sources.map((source) => observationSources[source].title),
    targets: [...new Set(observations.map((step) => step.target).filter(Boolean))],
    privileges: sources.some((source) => source === 'application' || source === 'applications')
      ? ['Operate', 'Secure']
      : ['Operate'],
    dependencies: assertions.map((step) => ({
      source: step.sourceStepId,
      check: step.id,
      sourceTitle:
        body.steps.find((source) => source.id === step.sourceStepId)?.title ?? 'Missing source',
      checkTitle: step.title,
    })),
    findings,
  };
}
