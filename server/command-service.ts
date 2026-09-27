import { randomUUID } from 'node:crypto';
import { parameters } from '../shared/schema.js';
import { credentialField, credentialValues, redact } from '../shared/redaction.js';
import type { CommandResult, CommandOutcome, ProcessIdentity } from '../shared/command-result.js';
import { CommandJournal } from './command-journal.js';
import {
  assertProcessSame,
  compareReadback,
  processIdentity,
  protectCommand,
  protectedField,
  readbackContract,
  readableFields,
  sameField,
  selectedProcessCapability,
} from './command-readback.js';
import {
  canonicalCommandIdentity,
  commandTarget,
  type TargetReservations,
} from './target-reservations.js';
import { ApiError, validateOperation, type IrisClient, type Operation } from './upstream.js';
import { journalDiagnostic } from './journal-diagnostic.js';

type CommandActor = { owner: string; auth: string };
type Prepared = { owner: string; expires: number; command: Operation };
export class CommandService {
  private prepared = new Map<string, Prepared>();
  private busy = new Set<string>();
  private nativeTargets = new Set<string>();
  constructor(
    readonly journal: CommandJournal,
    private client: IrisClient,
    private reservations: TargetReservations,
    private clock = Date.now,
  ) {}
  private event(record: CommandResult, status: CommandOutcome, message: string) {
    message = journalDiagnostic(message);
    record.status = status;
    record.message = message;
    record.updatedAt = new Date(this.clock()).toISOString();
    record.events.push({ at: record.updatedAt, status, message });
    record.events = record.events.slice(-50);
  }
  private expireMemory() {
    for (const [id, record] of this.prepared)
      if (record.expires <= this.clock()) this.prepared.delete(id);
  }
  private async locked<T>(id: string, action: () => Promise<T>): Promise<T> {
    if (this.busy.has(id)) throw new ApiError(409, 'This command is already being processed.');
    this.busy.add(id);
    try {
      return await action();
    } finally {
      this.busy.delete(id);
    }
  }
  private async targetExclusive<T>(record: CommandResult, action: () => Promise<T>) {
    const key =
      record.instance + '\0' + canonicalCommandIdentity(record.read.path, record.read.query);
    if (this.nativeTargets.has(key))
      throw new ApiError(
        409,
        'Another reviewed command is operating on this target. Read its result before continuing.',
      );
    this.nativeTargets.add(key);
    try {
      return await action();
    } finally {
      this.nativeTargets.delete(key);
    }
  }
  private safe(value: unknown, secrets: string[] = []) {
    const result = redact(value, secrets);
    // Match the journal's two-space encoding, including the enclosing field indentation.
    return Buffer.byteLength(JSON.stringify({ evidence: result }, null, 2)) < 150000
      ? result
      : {
          notice:
            'Evidence omitted: the result exceeds this journal’s 150 KB stored evidence limit. Inspect the native target.',
        };
  }
  private async readNative(actor: CommandActor, record: CommandResult) {
    return (
      await this.client.request(actor.auth, {
        path: record.read.path,
        method: 'GET',
        query: record.read.query,
      })
    ).data;
  }
  async review(actor: CommandActor, command: Operation, selection?: ProcessIdentity) {
    validateOperation(command);
    if (command.method === 'GET' || command.path === '/v2/security/audit/records')
      throw new ApiError(400, 'Read operations do not need a command review.');
    protectCommand(command, actor.owner);
    this.expireMemory();
    if (this.prepared.size >= 200)
      throw new ApiError(
        429,
        'Too many pending command reviews. Wait for earlier reviews to expire.',
      );
    return this.locked('review:' + actor.owner, () =>
      this.reservations.withTarget(commandTarget(command), undefined, async () => {
        if ((await this.journal.count(actor.owner)) >= 1000)
          throw new ApiError(
            409,
            'This account has reached 1000 command records. Export and manage retention before continuing.',
          );
        const contract = readbackContract(command);
        const submitted =
          command.path === '/v2/security/user' &&
          command.body?.User &&
          typeof command.body.User === 'object'
            ? {
                ...command.body.User,
                ...(command.body.Password === undefined ? {} : { Password: command.body.Password }),
              }
            : (command.body ?? {});
        const now = this.clock();
        const record: CommandResult = {
          format: 1,
          id: randomUUID(),
          owner: actor.owner,
          instance: this.journal.instance,
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 10 * 60_000).toISOString(),
          status: 'reviewed',
          operation: {
            path: command.path,
            method: command.method as 'POST' | 'PUT' | 'DELETE',
            query: command.query ?? {},
          },
          title: contract.title,
          target: contract.target,
          confirmation: contract.target,
          before: null,
          proposed: this.safe(submitted),
          fields: readableFields(submitted),
          writeOnlyFields: Object.keys(submitted).filter((key) =>
            protectedField(key, submitted[key]),
          ),
          read: contract.read,
          message: 'Review the proposed change before confirming.',
          events: [],
        };
        const canRead =
          record.read.mode !== 'acknowledgement' &&
          parameters(record.read.path, 'GET').every(
            (field) => !field.required || record.read.query[field.name],
          );
        if (canRead) {
          try {
            const before = await this.readNative(actor, record);
            if (!before || typeof before !== 'object' || Array.isArray(before))
              throw new ApiError(502, 'The native detail response is not an object.');
            record.before = this.safe(before);
          } catch (error) {
            if (!(
              error instanceof ApiError &&
              error.status === 404 &&
              ['PUT', 'POST'].includes(command.method)
            ))
              throw error;
          }
        }
        if (record.read.mode.startsWith('process-')) {
          record.nativeIdentity = processIdentity(record.before);
          if (selection) assertProcessSame(selection, record.before);
          if (record.nativeIdentity.pid !== record.read.query.id)
            throw new ApiError(409, 'The process detail does not match the selected PID.');
          selectedProcessCapability(command.path, record.before!);
        }
        if (record.read.mode === 'task-state')
          record.requestedState = command.path.endsWith('/suspend');
        this.event(
          record,
          'reviewed',
          'Review created. No native change was sent. It expires in ten minutes.',
        );
        await this.journal.save(record);
        this.prepared.set(record.id, {
          owner: actor.owner,
          expires: now + 10 * 60_000,
          command: structuredClone(command),
        });
        return record;
      }),
    );
  }
  async get(actor: CommandActor, id: string) {
    this.expireMemory();
    if (this.busy.has(id)) return this.journal.read(actor.owner, id);
    return this.locked(id, async () => {
      const record = await this.journal.read(actor.owner, id);
      if (record.status === 'dispatching') {
        this.event(
          record,
          'uncertain',
          'The gateway stopped before recording the outcome. Read the target state; the command will not be replayed.',
        );
        await this.journal.save(record);
      }
      if (record.status === 'reviewed' && !this.prepared.has(id)) {
        this.event(
          record,
          'expired',
          'This review expired or the gateway restarted. Prepare a new review.',
        );
        await this.journal.save(record);
      }
      return record;
    });
  }
  private async revalidate(actor: CommandActor, record: CommandResult) {
    if (record.read.mode === 'acknowledgement') return;
    const completeIdentity = parameters(record.read.path, 'GET').every(
      (field) => !field.required || record.read.query[field.name],
    );
    if (!completeIdentity) return;
    let current: Record<string, unknown> | null;
    try {
      current = await this.readNative(actor, record);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) current = null;
      else throw error;
    }
    if (record.nativeIdentity) {
      assertProcessSame(record.nativeIdentity, current);
      selectedProcessCapability(record.operation.path, current!);
      return;
    }
    if ((record.before === null) !== (current === null))
      throw new ApiError(
        409,
        'The target appeared or disappeared after review. Prepare a new command.',
      );
    if (record.read.mode === 'task-state') {
      if (!sameField(record.before?.Suspended, current?.Suspended))
        throw new ApiError(409, 'Task scheduling changed after review.');
      return;
    }
    const fields =
      record.operation.method === 'DELETE' ? Object.keys(record.before ?? {}) : record.fields;
    const changed = fields.filter((key) => !sameField(record.before?.[key], current?.[key], key));
    if (changed.length)
      throw new ApiError(409, 'Selected fields changed after review: ' + changed.join(', '));
  }
  private async observe(actor: CommandActor, record: CommandResult) {
    if (record.read.mode === 'acknowledgement') {
      if (
        record.responseStatus === undefined ||
        record.responseStatus < 200 ||
        record.responseStatus >= 300
      ) {
        this.event(
          record,
          'uncertain',
          'The response to this write-only operation was not confirmed. A read cannot establish its secret value or execution outcome. Inspect native audit and target metadata before deciding on a new command.',
        );
        return;
      }
      this.event(
        record,
        'acknowledged',
        record.operation.path.endsWith('/run')
          ? 'IRIS accepted the run request. This does not prove task execution or success; inspect its history.'
          : 'IRIS accepted this write-only operation. The secret value cannot be read back.',
      );
      return;
    }
    const missingId = parameters(record.read.path, 'GET').some(
      (field) => field.required && !record.read.query[field.name],
    );
    if (missingId) {
      this.event(
        record,
        'acknowledged',
        'IRIS accepted the creation without returning a usable target identifier. Inspect the created object; no object was guessed from a list.',
      );
      return;
    }
    try {
      const current = await this.readNative(actor, record);
      record.observed = this.safe(current);
      record.observedAt = new Date(this.clock()).toISOString();
      if (record.read.mode === 'absence')
        this.event(
          record,
          'uncertain',
          'The target still exists after the deletion request. No delete was retried.',
        );
      else if (record.read.mode === 'process-absence') {
        const identity = processIdentity(current);
        this.event(
          record,
          sameField(record.nativeIdentity, identity) ? 'uncertain' : 'verified',
          sameField(record.nativeIdentity, identity)
            ? 'The selected process generation still exists.'
            : 'The selected process generation is absent. This PID belongs to a different generation.',
        );
      } else {
        const comparison = compareReadback(record, current);
        this.event(
          record,
          comparison.matches ? 'verified' : 'uncertain',
          comparison.message +
            (record.writeOnlyFields.length
              ? ' Write-only fields were acknowledged but cannot be compared.'
              : ''),
        );
      }
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 404 &&
        ['absence', 'process-absence'].includes(record.read.mode)
      ) {
        record.observedAt = new Date(this.clock()).toISOString();
        record.observed = { absent: true };
        this.event(
          record,
          'verified',
          'The native detail endpoint confirms that the selected target is absent.',
        );
      } else
        this.event(
          record,
          'uncertain',
          'The current target could not be verified. ' + (error as Error).message,
        );
    }
  }
  async execute(actor: CommandActor, id: string, confirmation: string) {
    this.expireMemory();
    return this.locked(id, async () => {
      const record = await this.journal.read(actor.owner, id);
      const prepared = this.prepared.get(id);
      if (record.status !== 'reviewed')
        throw new ApiError(
          409,
          'This command has already been consumed. Inspect or reconcile its recorded outcome.',
        );
      if (!prepared || prepared.owner !== actor.owner) {
        this.event(
          record,
          'expired',
          'The review expired or the gateway restarted. Prepare a new review.',
        );
        await this.journal.save(record);
        throw new ApiError(409, record.message);
      }
      if (confirmation !== record.confirmation)
        throw new ApiError(400, 'Type the exact reviewed target to confirm.');
      return this.targetExclusive(record, () =>
        this.reservations.withTarget(commandTarget(prepared.command), undefined, async () => {
          try {
            protectCommand(prepared.command, actor.owner);
            await this.revalidate(actor, record);
          } catch (error) {
            this.prepared.delete(id);
            this.event(
              record,
              error instanceof ApiError && error.status === 409 ? 'conflict' : 'rejected',
              (error as Error).message,
            );
            await this.journal.save(record);
            return record;
          }
          this.event(
            record,
            'dispatching',
            'Command dispatch recorded. This command ID cannot send another write.',
          );
          record.dispatchAt = new Date(this.clock()).toISOString();
          await this.journal.save(record);
          this.prepared.delete(id);
          const secrets = credentialValues(prepared.command.body);
          try {
            const response = await this.client.request(actor.auth, prepared.command);
            record.responseStatus = response.status;
            record.response = this.safe(response.data, secrets);
            record.asyncId = response.asyncId;
            // Generated native identifiers may be a scalar or a named property. Never select an arbitrary list row.
            if (
              prepared.command.method === 'POST' &&
              !record.read.query.id &&
              record.read.path === '/v2/task'
            ) {
              const id =
                typeof response.data === 'number' || typeof response.data === 'string'
                  ? response.data
                  : (response.data?.Id ?? response.data?.ID);
              if (/^[1-9]\d*$/.test(String(id))) record.read.query.id = String(id);
            }
            if (
              prepared.command.method === 'POST' &&
              !record.read.query.serverId &&
              record.read.path.endsWith('/server-definition')
            ) {
              const id =
                typeof response.data === 'number' || typeof response.data === 'string'
                  ? response.data
                  : response.data?.ID;
              if (id !== undefined && String(id).length <= 256)
                record.read.query.serverId = String(id);
            }
            if (response.asyncId)
              this.event(
                record,
                'uncertain',
                'IRIS accepted background job ' +
                  response.asyncId +
                  '. Check the job and target before closing this command.',
              );
            else await this.observe(actor, record);
          } catch (error) {
            const status = error instanceof ApiError ? error.status : 502;
            record.responseStatus = status;
            const definitelyRejected = [400, 401, 403, 404, 405, 409, 422, 429].includes(status);
            this.event(
              record,
              definitelyRejected ? 'rejected' : 'uncertain',
              String(redact((error as Error).message, secrets)),
            );
          }
          await this.journal.save(record);
          return record;
        }),
      );
    });
  }
  async reconcile(actor: CommandActor, id: string) {
    await this.get(actor, id);
    return this.locked(id, async () => {
      const record = await this.journal.read(actor.owner, id);
      if (!['uncertain', 'acknowledged'].includes(record.status))
        throw new ApiError(409, 'This command has no unresolved result to check.');
      if (record.asyncId) {
        try {
          const job = (
            await this.client.request(actor.auth, {
              path: '/v2/async-result',
              method: 'GET',
              query: { id: record.asyncId },
            })
          ).data;
          if (job.State !== 'Finished') {
            this.event(
              record,
              'uncertain',
              'Native background job state: ' +
                String(job.State ?? 'unknown') +
                '. No command was resent.',
            );
            await this.journal.save(record);
            return record;
          }
        } catch (error) {
          this.event(
            record,
            'uncertain',
            'The background job cannot be read: ' + (error as Error).message,
          );
          await this.journal.save(record);
          return record;
        }
      }
      await this.observe(actor, record);
      record.message = journalDiagnostic(
        record.message +
          ' This is a current observation; it does not establish which actor caused the state.',
      );
      await this.journal.save(record);
      return record;
    });
  }
}
