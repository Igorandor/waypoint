import { randomUUID } from 'node:crypto';
import {
  templates,
  nextStep,
  writeStep,
  type Run,
  type RunStep,
  type TemplateId,
} from '../shared/runbook.js';
import { RunStore } from './run-store.js';
import { IrisClient, ApiError, type Operation } from './upstream.js';
import { redact } from '../shared/redaction.js';
import { buildObservationPlan, defaultObservation } from '../shared/observation-plan.js';
import {
  evaluateAssertion,
  procedureBodySchema,
  type ProcedureVersion,
} from '../shared/procedure.js';
import { runTarget, TargetReservations } from './target-reservations.js';
import { canArchive, handoverInputSchema, type HandoverInput } from '../shared/run-records.js';
import { journalDiagnostic } from './journal-diagnostic.js';

type Actor = { owner: string; auth: string };
export class RunEngine {
  private busy = new Set<string>();
  readonly reservations: TargetReservations;
  constructor(
    readonly store: RunStore,
    private client: IrisClient,
    readonly instance: string,
  ) {
    this.reservations = new TargetReservations(store.root, instance);
  }
  private key(actor: Actor, id: string) {
    return actor.owner + ':' + id;
  }
  private event(run: Run, action: string, message: string) {
    run.revision = (run.revision ?? 0) + 1;
    run.updatedAt = new Date().toISOString();
    run.events.push({ at: run.updatedAt, action, message: journalDiagnostic(message) });
    run.events = run.events.slice(-200);
  }
  private async locked<T>(actor: Actor, id: string, action: () => Promise<T>): Promise<T> {
    const key = this.key(actor, id);
    if (this.busy.has(key))
      throw new ApiError(409, 'This run already has an operation in progress.');
    this.busy.add(key);
    try {
      return await action();
    } finally {
      this.busy.delete(key);
    }
  }
  private async read(actor: Actor, id: string) {
    return this.store.read(actor.owner, this.instance, id);
  }
  private applicationKey(target: string) {
    return target.toLowerCase().replace(/\/+$/, '') || '/';
  }
  private requireNonManagementApplication(target: string) {
    const canonical = this.applicationKey(target);
    if (
      !canonical.startsWith('/') ||
      canonical === '/' ||
      canonical === '/api' ||
      /^\/(api\/(admin|waypoint|relay)|csp\/sys)(\/|$)/.test(canonical)
    )
      throw new ApiError(
        400,
        'Choose a non-management application. Waypoint protects its own API and the native administration routes.',
      );
  }
  private async targetLocked<T>(run: Run, action: () => Promise<T>): Promise<T> {
    return this.reservations.withTarget(runTarget(run), run.id, action);
  }
  async get(actor: Actor, id: string) {
    if (this.busy.has(this.key(actor, id))) return this.read(actor, id);
    return this.locked(actor, id, async () => {
      const run = await this.read(actor, id);
      if (run.steps.some((s) => s.status === 'running')) {
        for (const step of run.steps)
          if (step.status === 'running') {
            step.status = writeStep(step.kind) ? 'uncertain' : 'failed';
            step.error =
              'The gateway stopped before recording a result. Reconcile a write before continuing.';
          }
        this.event(run, 'recovered', 'Recovered an interrupted run. No operation was replayed.');
        await this.store.save(run);
      }
      return run;
    });
  }
  async create(
    actor: Actor,
    template: TemplateId,
    target: string,
    confirmation: string,
    observation?: { sources?: unknown; title?: string },
  ) {
    const definition = templates[template];
    if (!definition) throw new ApiError(400, 'Unknown runbook template.');
    if (observation && template !== 'observe')
      throw new ApiError(400, 'Custom sources are only available for observation plans.');
    let plan = definition.steps;
    if (template === 'observe') {
      try {
        plan = buildObservationPlan(observation?.sources ?? defaultObservation);
      } catch {
        throw new ApiError(400, 'Select one to eight different observation sources.');
      }
    }
    const customTitle = observation?.title?.trim();
    if (customTitle && customTitle.length > 80)
      throw new ApiError(400, 'Observation titles are limited to 80 characters.');
    if (definition.target !== 'none' && confirmation !== target)
      throw new ApiError(400, 'Type the exact target to confirm this plan.');
    if (definition.target === 'app') this.requireNonManagementApplication(target);
    if (definition.target === 'task' && !/^[1-9]\d*$/.test(target))
      throw new ApiError(400, 'Choose a valid task identifier.');
    return this.locked(actor, 'create', async () => {
      const stored = await this.store.list(actor.owner, this.instance);
      if (stored.filter((run) => !run.archivedAt).length >= 100 || stored.length >= 1000)
        throw new ApiError(
          409,
          'This account has reached 100 unarchived runs or 1000 total records. Archive closed runs before creating more.',
        );
      const time = new Date().toISOString();
      const run: Run = {
        version: 1,
        id: randomUUID(),
        owner: actor.owner,
        instance: this.instance,
        template,
        target: definition.target === 'none' ? 'Instance' : target,
        title: customTitle || definition.title,
        createdAt: time,
        updatedAt: time,
        status: 'active',
        needsRestore: false,
        steps: plan.map((s) => ({ ...s, status: 'pending', attempts: 0 })),
        events: [],
      };
      this.event(run, 'created', 'Plan confirmed. No IRIS configuration has been changed.');
      await this.reservations.withTarget(runTarget(run), undefined, () => this.store.save(run));
      return run;
    });
  }
  async fromProcedure(actor: Actor, procedureId: string, version: ProcedureVersion) {
    const body = procedureBodySchema.parse(version.body);
    return this.locked(actor, 'create', async () => {
      const stored = await this.store.list(actor.owner, this.instance);
      if (stored.length >= 1000 || stored.filter((run) => !run.archivedAt).length >= 100)
        throw new ApiError(409, 'This account has reached 1000 stored runs.');
      const now = new Date().toISOString();
      const run: Run = {
        version: 1,
        id: randomUUID(),
        owner: actor.owner,
        instance: this.instance,
        template: 'observe',
        title: body.title,
        target: 'Instance',
        createdAt: now,
        updatedAt: now,
        status: 'active',
        needsRestore: false,
        procedure: { id: procedureId, version: structuredClone(version) },
        steps: body.steps.map((step) => ({
          kind: step.kind === 'checklist' ? 'checkpoint' : 'info',
          title: step.title,
          description: step.instruction,
          status: 'pending',
          attempts: 0,
          procedureStep: structuredClone(step),
        })),
        events: [],
      };
      this.event(
        run,
        'created',
        'Created from procedure version ' +
          version.number +
          '. The saved definition will not change this run.',
      );
      await this.store.save(run);
      return run;
    });
  }
  private async procedureObservation(actor: Actor, source: string, target: string) {
    switch (source) {
      case 'identity': {
        const info = await this.call(actor, '/info');
        return {
          apiVersion: info.apiVersion,
          serverVersion: info.serverVersion,
          product: info.product,
        };
      }
      case 'health':
        return this.call(actor, '/v2/monitor/dashboard/main');
      case 'capacity':
        return this.call(actor, '/extension/telemetry');
      case 'messages':
      case 'alerts':
        return this.call(actor, '/extension/logs', { source, limit: '100' });
      case 'applications':
        return this.call(actor, '/v2/web-apps', { maxRows: '100' });
      case 'tasks':
        return this.call(actor, '/v2/tasks', { maxRows: '100' });
      case 'processes':
        return this.call(actor, '/v2/processes', { maxRows: '100' });
      case 'journals':
        return this.call(actor, '/v2/journal/files', { maxRows: '100' });
      case 'application':
        return this.call(actor, '/v2/web-app', { name: target });
      case 'task':
        return this.call(actor, '/v2/task', { id: target });
      case 'task-state':
        return this.call(actor, '/v2/task/info', { id: target });
      case 'task-history':
        return this.call(actor, '/v2/task/history', { taskId: target, maxRows: '50' });
      default:
        throw new ApiError(400, 'Unknown procedure observation source.');
    }
  }
  private async call(
    actor: Actor,
    path: string,
    query: Record<string, string> = {},
    method: Operation['method'] = 'GET',
    body?: Record<string, unknown>,
  ) {
    return (await this.client.request(actor.auth, { path, method, query, body })).data;
  }
  private async state(actor: Actor, run: Run): Promise<boolean> {
    const data =
      run.template === 'application-window'
        ? await this.call(actor, '/v2/web-app', { name: run.target })
        : await this.call(actor, '/v2/task/info', { id: run.target });
    const value = run.template === 'application-window' ? data.Enabled : data.Suspended;
    if (typeof value !== 'boolean')
      throw new ApiError(502, 'IRIS did not return an authoritative boolean state.');
    return value;
  }
  private desired(run: Run, step: RunStep) {
    if (step.kind === 'disable-app') return false;
    if (step.kind === 'suspend-task') return true;
    if (typeof run.original !== 'boolean')
      throw new ApiError(409, 'The original state has not been captured.');
    return run.original;
  }
  private evidence(data: unknown) {
    const safe = redact(data),
      json = JSON.stringify(safe);
    return json.length <= 100000
      ? safe
      : {
          notice: 'Evidence exceeded 100 KB; inspect the source in the administration tools.',
          bytes: json.length,
        };
  }
  private async perform(actor: Actor, run: Run, note: string, completedItems: string[] = []) {
    if (run.status !== 'active') throw new ApiError(409, 'This run is closed. Create a new run.');
    const index = nextStep(run),
      step = run.steps[index];
    if (!step) throw new ApiError(409, 'No step remains.');
    if (step.status === 'uncertain' || step.status === 'running')
      throw new ApiError(409, 'Reconcile this step before continuing.');
    // Recheck stored plans created by an earlier version before disabling a route.
    if (step.kind === 'disable-app') this.requireNonManagementApplication(run.target);
    if (step.kind === 'checkpoint' && !step.procedureStep && !note.trim())
      throw new ApiError(400, 'Record a maintenance note before continuing.');
    const definition = step.procedureStep;
    if (definition?.kind === 'checklist') {
      if (definition.requireNote && !note.trim())
        throw new ApiError(400, 'Record the required checkpoint note.');
      if (
        new Set(completedItems).size !== completedItems.length ||
        completedItems.some((id) => !definition.items.some((item) => item.id === id))
      )
        throw new ApiError(400, 'Invalid checklist completion.');
      if (definition.items.some((item) => item.required && !completedItems.includes(item.id)))
        throw new ApiError(400, 'Complete every required checklist item before continuing.');
    }
    step.status = 'running';
    step.startedAt = new Date().toISOString();
    step.attempts++;
    delete step.error;
    this.event(run, 'started', step.title);
    await this.store.save(run);
    let writeAttempted = false;
    try {
      let evidence: unknown;
      if (definition) {
        if (definition.kind === 'observation')
          evidence = await this.procedureObservation(actor, definition.source, definition.target);
        else if (definition.kind === 'assertion') {
          evidence = evaluateAssertion(
            definition,
            run.steps.find((source) => source.procedureStep?.id === definition.sourceStepId),
          );
        } else {
          step.checklist = {
            completed: completedItems,
            note: note.trim(),
            actor: actor.owner,
            at: new Date().toISOString(),
          };
          step.note = note.trim();
          evidence = step.checklist;
        }
      } else if (writeStep(step.kind)) {
        const current = await this.state(actor, run),
          desired = this.desired(run, step);
        const restoring = step.kind.startsWith('restore');
        if (typeof run.original !== 'boolean')
          throw new ApiError(409, 'Original state is missing.');
        if (!restoring && current !== run.original)
          throw new ApiError(
            409,
            'The state changed after it was captured. Stop and review this run before changing IRIS.',
          );
        if (restoring && !run.needsRestore) {
          evidence = {
            before: current,
            requested: desired,
            observed: current,
            notice: 'This run made no change to restore. The current state was preserved.',
          };
        } else if (current !== desired) {
          if (!restoring) run.needsRestore = true;
          // Persist the obligation to restore before sending a potentially ambiguous write.
          await this.store.save(run);
          writeAttempted = true;
          if (run.template === 'application-window')
            await this.call(actor, '/v2/web-app', { name: run.target }, 'PUT', {
              Enabled: desired,
            });
          else
            await this.call(
              actor,
              desired ? '/v2/task/suspend' : '/v2/task/resume',
              { id: run.target },
              'POST',
              desired ? { LeaveInQueue: true } : undefined,
            );
          const observed = await this.state(actor, run);
          if (observed !== desired)
            throw new ApiError(
              502,
              'The write returned but read-back did not match the intended state.',
            );
          evidence = {
            before: current,
            requested: desired,
            observed,
            verifiedAt: new Date().toISOString(),
          };
        } else
          evidence = {
            before: current,
            requested: desired,
            observed: current,
            notice: 'The target was already in the intended state; no write was sent.',
          };
        if (restoring) run.needsRestore = false;
      } else
        switch (step.kind) {
          case 'info': {
            const info = await this.call(actor, '/info');
            evidence = {
              apiVersion: info.apiVersion,
              serverVersion: info.serverVersion,
              product: info.product,
            };
            break;
          }
          case 'health':
            evidence = await this.call(actor, '/v2/monitor/dashboard/main');
            break;
          case 'processes':
            evidence = await this.call(actor, '/v2/processes', { maxRows: '100' });
            break;
          case 'task-inventory':
            evidence = await this.call(actor, '/v2/tasks', { maxRows: '100' });
            break;
          case 'application-inventory':
            evidence = await this.call(actor, '/v2/web-apps', { maxRows: '100' });
            break;
          case 'journal-inventory':
            evidence = await this.call(actor, '/v2/journal/files', { maxRows: '100' });
            break;
          case 'host':
            evidence = await this.call(actor, '/extension/telemetry');
            break;
          case 'logs':
            evidence = await this.call(actor, '/extension/logs', {
              source: 'messages',
              limit: '100',
            });
            break;
          case 'task-history':
            evidence = await this.call(actor, '/v2/task/history', {
              taskId: run.target,
              maxRows: '50',
            });
            break;
          case 'inspect-app': {
            const app = await this.call(actor, '/v2/web-app', { name: run.target });
            if (typeof app.Enabled !== 'boolean')
              throw new ApiError(502, 'Application state is missing.');
            run.original = app.Enabled;
            evidence = {
              Name: run.target,
              Enabled: app.Enabled,
              NameSpace: app.NameSpace,
              DispatchClass: app.DispatchClass,
            };
            break;
          }
          case 'inspect-task': {
            const task = await this.call(actor, '/v2/task', { id: run.target });
            run.original = await this.state(actor, run);
            evidence = {
              Id: run.target,
              Name: task.Name,
              NameSpace: task.NameSpace,
              TaskClass: task.TaskClass,
              Suspended: run.original,
            };
            break;
          }
          case 'checkpoint':
            step.note = note.trim();
            evidence = { operator: actor.owner, note: step.note };
            break;
          default:
            throw new ApiError(400, 'Unsupported runbook step.');
        }
      step.evidence = this.evidence(evidence);
      step.status = 'done';
      step.finishedAt = new Date().toISOString();
      this.event(run, 'completed-step', step.title);
      if (nextStep(run) === -1) {
        run.status = 'completed';
        this.event(
          run,
          'completed-run',
          'All steps closed. Review recorded and bypassed steps for operational outcomes.',
        );
      }
    } catch (error) {
      step.status = writeAttempted ? 'uncertain' : 'failed';
      step.error = journalDiagnostic((error as Error).message);
      this.event(run, step.status, step.title + ': ' + step.error);
    }
    await this.store.save(run);
    return run;
  }
  async next(actor: Actor, id: string, note = '', completedItems: string[] = []) {
    await this.get(actor, id);
    return this.locked(actor, id, async () => {
      const run = await this.read(actor, id);
      return this.targetLocked(run, () => this.perform(actor, run, note, completedItems));
    });
  }
  async reconcile(actor: Actor, id: string) {
    await this.get(actor, id);
    return this.locked(actor, id, async () => {
      const run = await this.read(actor, id),
        step = run.steps[nextStep(run)];
      if (!step || step.status !== 'uncertain' || !writeStep(step.kind))
        throw new ApiError(409, 'No uncertain write is awaiting reconciliation.');
      return this.targetLocked(run, async () => {
        const observed = await this.state(actor, run),
          desired = this.desired(run, step);
        step.evidence = {
          observed,
          requested: desired,
          reconciledAt: new Date().toISOString(),
          notice: 'Observed current state; this does not prove which actor changed it.',
        };
        if (observed === desired) {
          step.status = 'done';
          step.finishedAt = new Date().toISOString();
          delete step.error;
          if (step.kind.startsWith('restore')) run.needsRestore = false;
        } else {
          step.status = 'failed';
          step.error =
            'Current state differs from the requested state. No write was retried; review before retrying or restoring.';
        }
        this.event(run, 'reconciled', step.title + ': observed ' + observed);
        await this.store.save(run);
        return run;
      });
    });
  }
  async restore(actor: Actor, id: string, confirmation: string) {
    await this.get(actor, id);
    return this.locked(actor, id, async () => {
      const run = await this.read(actor, id);
      if (run.status !== 'active' || !run.needsRestore)
        throw new ApiError(409, 'This run has no pending restoration.');
      if (confirmation !== run.target)
        throw new ApiError(400, 'Type the exact target to request restoration.');
      const index = run.steps.findIndex((s) => s.kind.startsWith('restore'));
      for (let i = 0; i < index; i++)
        if (!['done', 'skipped'].includes(run.steps[i].status)) {
          run.steps[i].status = 'skipped';
          run.steps[i].note = 'Bypassed at the operator’s request to restore the original state.';
        }
      run.steps[index].status = 'pending';
      this.event(run, 'restore-requested', 'Operator requested an early restoration.');
      return this.targetLocked(run, async () => {
        await this.store.save(run);
        return this.perform(actor, run, '');
      });
    });
  }
  async stop(actor: Actor, id: string) {
    await this.get(actor, id);
    return this.locked(actor, id, async () => {
      const run = await this.read(actor, id);
      if (run.needsRestore)
        throw new ApiError(409, 'Restore the original state before closing this run.');
      if (run.status !== 'active') throw new ApiError(409, 'This run is already closed.');
      run.status = 'stopped';
      for (const step of run.steps) if (step.status !== 'done') step.status = 'skipped';
      this.event(
        run,
        'stopped',
        'Operator closed the run. No pending state restoration was recorded.',
      );
      await this.store.save(run);
      return run;
    });
  }
  async archive(actor: Actor, id: string, revision: number, archived: boolean) {
    return this.locked(actor, id, async () => {
      const run = await this.read(actor, id);
      if ((run.revision ?? 0) !== revision)
        throw new ApiError(409, 'This run changed. Reload before changing its archive state.');
      const check = canArchive(run);
      if (archived && !check.allowed) throw new ApiError(409, check.reason);
      if (archived) run.archivedAt = new Date().toISOString();
      else delete run.archivedAt;
      this.event(
        run,
        archived ? 'archived' : 'unarchived',
        archived
          ? 'Archived the closed run. Its evidence is retained.'
          : 'Restored this closed run to the history view.',
      );
      await this.store.save(run);
      return run;
    });
  }
  async handover(actor: Actor, id: string, revision: number, input: HandoverInput) {
    const validated = handoverInputSchema.parse(input);
    return this.locked(actor, id, async () => {
      const run = await this.read(actor, id);
      if ((run.revision ?? 0) !== revision)
        throw new ApiError(409, 'This run changed. Reload before saving handover details.');
      const time = new Date().toISOString();
      run.handover = {
        ...validated,
        revision: (run.handover?.revision ?? 0) + 1,
        updatedAt: time,
        updatedBy: actor.owner,
        ...(validated.delivered
          ? { deliveryRecordedAt: run.handover?.deliveryRecordedAt ?? time }
          : {}),
      };
      this.event(
        run,
        'handover-updated',
        validated.delivered
          ? 'Operator recorded package delivery. Execution ownership was not transferred.'
          : 'Updated read-only handover details. Execution ownership was not transferred.',
      );
      await this.store.save(run);
      return run;
    });
  }
  async addNote(
    actor: Actor,
    id: string,
    revision: number,
    text: string,
    category: 'observation' | 'decision' | 'follow-up',
  ) {
    return this.locked(actor, id, async () => {
      const run = await this.read(actor, id);
      if ((run.revision ?? 0) !== revision)
        throw new ApiError(409, 'This run changed. Reload before adding a note.');
      if ((run.notes?.length ?? 0) >= 100)
        throw new ApiError(
          409,
          'This run has reached 100 notes. Export its record before adding further follow-up elsewhere.',
        );
      run.notes = [
        ...(run.notes ?? []),
        {
          id: randomUUID(),
          at: new Date().toISOString(),
          author: actor.owner,
          text: text.trim(),
          category,
        },
      ];
      this.event(run, 'note-added', 'Added an operator ' + category + ' note.');
      await this.store.save(run);
      return run;
    });
  }
}
