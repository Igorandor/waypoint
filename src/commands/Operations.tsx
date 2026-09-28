import { useEffect, useRef, useState } from 'react';
import { targets, type Target } from '../../shared/commands';
import { parameters, bodySchema, spec } from '../../shared/schema';
import { newCommandBody, changedKeys } from '../../shared/command-draft';
import { redact } from '../../shared/redaction';
import { iris, request, RequestError } from '../api';
import { outcomeLabels, type CommandResult } from '../../shared/command-result';
import { useData } from '../hooks';
import { Badge, ErrorBox, Loading, PageHeader } from '../components/ui';
import { Evidence, human } from '../components/DataView';
import { CommandFields } from './CommandFields';
export type Candidate = {
  title: string;
  path: string;
  method: 'PUT' | 'POST' | 'DELETE';
  query: Record<string, string>;
  body: Record<string, any>;
  base?: Record<string, any>;
  stage: 'prepare' | 'review';
  confirm: string;
  identity: string;
  destructive: boolean;
  review?: CommandResult;
};

export function acceptCommandReview(candidate: Candidate, review: CommandResult): Candidate {
  return {
    ...candidate,
    stage: 'review',
    confirm: '',
    review,
    // The operator confirms the fresh server review, not the earlier inspection.
    base: candidate.base ? (review.before ?? undefined) : undefined,
  };
}

type CommandAttempt =
  | { sent: false; draft: Candidate; error: string }
  | {
      sent: true;
      receipt: CommandResult | Pick<CommandResult, 'id' | 'status' | 'message'>;
      error: string;
      receiptAccessUnverified?: true;
    };

/** Preserve preparation failures separately from an execution whose result may be unknown. */
export async function submitCommandCandidate(
  command: Candidate,
  transport: {
    readCurrent: () => Promise<Record<string, unknown>>;
    execute: (id: string, confirmation: string) => Promise<CommandResult>;
    readReceipt: (id: string) => Promise<CommandResult>;
  },
): Promise<CommandAttempt> {
  if (!command.review) throw new Error('Review this command before executing it.');
  try {
    if (command.base) {
      const current = await transport.readCurrent();
      const affected =
        command.method === 'DELETE' ? Object.keys(command.base) : Object.keys(command.body);
      const conflicts = changedKeys(
        command.base,
        Object.fromEntries(affected.map((key) => [key, true])),
        current,
      );
      if (conflicts.length) throw new Error('Native state changed: ' + conflicts.join(', ') + '.');
    }
  } catch (cause) {
    return {
      sent: false,
      draft: { ...command, stage: 'prepare', confirm: '', review: undefined },
      error:
        'No command was sent. ' +
        (cause as Error).message +
        ' Your draft is preserved. Review it again against the current target.',
    };
  }
  try {
    const receipt = await transport.execute(
      command.review.id,
      command.destructive ? command.confirm : command.review.confirmation,
    );
    if (receipt.id !== command.review.id)
      throw new Error('The execution returned a different command.');
    return { sent: true, receipt, error: '' };
  } catch (cause) {
    let receipt: CommandAttempt & { sent: true };
    try {
      if (cause instanceof RequestError && cause.status === 401) throw cause;
      const current = await transport.readReceipt(command.review.id);
      if (current.id !== command.review.id)
        throw new Error('The receipt read returned a different command.');
      receipt = {
        sent: true,
        receipt: current,
        error: (cause as Error).message,
      };
    } catch (readError) {
      receipt = {
        sent: true,
        receipt: {
          id: command.review.id,
          status: 'uncertain',
          message:
            'The outcome could not be retrieved. Open command history before sending another write.',
        },
        error: [(cause as Error).message, (readError as Error).message].join(' '),
        receiptAccessUnverified: true,
      };
    }
    return receipt;
  }
}
export function Operations({ area, operator }: { area: string; operator: string }) {
  const options = targets.filter((target) => target.area === area);
  const [chosen, setChosen] = useState(options[0].id);
  return (
    <>
      <PageHeader
        title="Command station"
        description="Choose a target, prepare one command, then review and execute it."
      />
      <nav className="command-targets" aria-label="Target type">
        {options.map((option) => (
          <button
            key={option.id}
            aria-pressed={chosen === option.id}
            onClick={() => setChosen(option.id)}
          >
            {option.title}
          </button>
        ))}
      </nav>
      <TargetStation
        key={chosen}
        target={options.find((option) => option.id === chosen)!}
        operator={operator}
      />
    </>
  );
}
function TargetStation({ target, operator }: { target: Target; operator: string }) {
  const [scope, setScope] = useState(''),
    [search, setSearch] = useState(''),
    [identity, setIdentity] = useState(''),
    [detail, setDetail] = useState<any>(),
    [pending, setPending] = useState<Candidate>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [receipt, setReceipt] = useState<any>(),
    [receiptAccessUnverified, setReceiptAccessUnverified] = useState(false);
  const sequence = useRef(0),
    inFlight = useRef(false);
  const recoveryElement = useRef<HTMLElement>(null),
    resultElement = useRef<HTMLDivElement>(null);
  const focusAfterRead = useRef<'recovery' | 'result' | undefined>(undefined);
  useEffect(
    () => () => {
      sequence.current++;
      inFlight.current = false;
    },
    [],
  );
  useEffect(() => {
    const element =
      focusAfterRead.current === 'recovery'
        ? recoveryElement.current
        : focusAfterRead.current === 'result'
          ? resultElement.current
          : undefined;
    if (element) {
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: 'nearest' });
      focusAfterRead.current = undefined;
    }
  }, [receiptAccessUnverified, receipt]);
  function begin() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    return ++sequence.current;
  }
  function finish(ticket: number) {
    if (ticket === sequence.current) {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const scopeData = useData<any[]>(
    target.scope === 'collection'
      ? '/v2/wallet/collections'
      : target.scope === 'serverId'
        ? '/v2/security/oauth2/client/server-definitions'
        : '',
  );
  const listQuery = target.scope ? { [target.scope]: scope } : ({} as Record<string, string>);
  const records = useData<any[]>(target.scope && !scope ? '' : target.list, listQuery);
  const [execution, setExecution] = useState<any>();
  const select = async (row: any) => {
    const ticket = begin();
    if (ticket === undefined) return;
    focusAfterRead.current = undefined;
    setIdentity(String(row[target.identity]));
    setPending(undefined);
    setReceipt(undefined);
    setReceiptAccessUnverified(false);
    setError('');
    setDetail(undefined);
    setExecution(undefined);
    setBusy(true);
    try {
      const current = target.opaque
        ? row
        : (await iris(target.record, queryFor('GET', String(row[target.identity])))).data;
      if (ticket !== sequence.current) return;
      if (target.id === 'tasks') {
        const result = await iris('/v2/task/info', { id: String(row[target.identity]) });
        if (ticket !== sequence.current) return;
        setExecution(result.data);
      }
      setDetail(target.id === 'processes' ? { ...row, ...current } : current);
    } catch (e) {
      if (ticket === sequence.current) setError((e as Error).message);
    } finally {
      finish(ticket);
    }
  };
  function queryFor(method: string, id: string, path = target.record) {
    const available = { ...listQuery, [target.parameter]: id };
    return Object.fromEntries(
      parameters(path, method)
        .map((param) => [param.name, available[param.name] ?? ''])
        .filter(([, value]) => value),
    );
  }
  function prepare(kind: string) {
    setError('');
    setReceipt(undefined);
    setReceiptAccessUnverified(false);
    focusAfterRead.current = undefined;
    const creating = kind === 'create',
      deleting = kind === 'delete',
      action = !['create', 'edit', 'delete'].includes(kind);
    const path =
      kind === 'password'
        ? target.record + '/password'
        : kind === 'secrets'
          ? target.record + '/secrets'
          : action
            ? target.record + '/' + kind
            : target.record;
    const method = deleting
      ? 'DELETE'
      : action
        ? 'POST'
        : creating && spec.paths[path]?.post
          ? 'POST'
          : 'PUT';
    const query = creating ? queryFor(method, '', path) : queryFor(method, identity, path);
    const body = creating
      ? newCommandBody(target.id, operator)
      : kind === 'password'
        ? { Password: '' }
        : kind === 'secrets'
          ? { ClientSecret: '' }
          : target.opaque && !deleting
            ? newCommandBody(target.id, operator)
            : {};
    if (creating && target.id === 'oauthClients') body.OAuth2ServerDefinition = scope;
    if (target.id === 'tasks' && kind === 'run') body.RunNow = true;
    if (target.id === 'tasks' && kind === 'suspend') body.LeaveInQueue = true;
    setPending({
      title: creating
        ? 'Create ' + target.title
        : kind === 'edit'
          ? 'Update selected fields'
          : human(kind),
      path,
      method,
      query,
      body,
      base: !creating && !action && !target.opaque ? detail : undefined,
      stage: 'prepare',
      confirm: '',
      identity: creating ? '' : identity,
      destructive: deleting || action,
    });
  }
  async function execute() {
    if (!pending?.review) return;
    const ticket = begin();
    if (ticket === undefined) return;
    const command = pending;
    let receiptReadStarted = false;
    setBusy(true);
    setError('');
    try {
      const result = await submitCommandCandidate(command, {
        readCurrent: async () =>
          (await iris(target.record, queryFor('GET', command.identity))).data,
        execute: (id, confirmation) => {
          if (ticket !== sequence.current) throw new Error('This command workspace is closed.');
          return request('commands/' + id + '/execute', { confirmation });
        },
        readReceipt: (id) => {
          if (ticket !== sequence.current) throw new Error('This command workspace is closed.');
          receiptReadStarted = true;
          setReceipt({ id });
          setReceiptAccessUnverified(true);
          setPending(undefined);
          setDetail(undefined);
          setIdentity('');
          focusAfterRead.current = 'recovery';
          return request('commands/' + id);
        },
      });
      if (ticket !== sequence.current) return;
      setError(result.error);
      if (!result.sent) {
        setPending(result.draft);
        setReceipt(undefined);
        setReceiptAccessUnverified(false);
        return;
      }
      setReceipt(result.receipt);
      setReceiptAccessUnverified(!!result.receiptAccessUnverified);
      if (result.receiptAccessUnverified) focusAfterRead.current = 'recovery';
      else if (receiptReadStarted) focusAfterRead.current = 'result';
      setPending(undefined);
      setDetail(undefined);
      setIdentity('');
      records.refresh();
    } finally {
      finish(ticket);
    }
  }
  async function reviewCommand() {
    if (!pending) return;
    const ticket = begin();
    if (ticket === undefined) return;
    setBusy(true);
    setError('');
    try {
      const selection =
        target.id === 'processes'
          ? {
              pid: String(detail?.Pid ?? ''),
              started: String(detail?.StartTimeUTC ?? ''),
              job: String(detail?.JobNumber ?? ''),
              user: String(detail?.UserName ?? ''),
            }
          : undefined;
      const review = await request<CommandResult>('commands/review', {
        command: {
          path: pending.path,
          method: pending.method,
          query: pending.query,
          body: pending.method === 'DELETE' ? undefined : pending.body,
        },
        selection,
      });
      if (ticket !== sequence.current) return;
      setPending(acceptCommandReview(pending, review));
    } catch (cause) {
      if (ticket === sequence.current) setError((cause as Error).message);
    } finally {
      finish(ticket);
    }
  }
  async function readReceiptAccess(id: string, ticket: number, originalError = '') {
    setReceipt({ id });
    setReceiptAccessUnverified(true);
    focusAfterRead.current = 'recovery';
    try {
      const current = await request<CommandResult>('commands/' + id);
      if (ticket !== sequence.current) return;
      if (current.id !== id) throw new Error('The receipt read returned a different command.');
      setReceipt(current);
      setReceiptAccessUnverified(false);
      focusAfterRead.current = 'result';
    } catch (cause) {
      if (ticket === sequence.current)
        setError([originalError, (cause as Error).message].filter(Boolean).join(' '));
    }
  }
  async function retryReceipt() {
    if (!receipt?.id) return;
    const ticket = begin();
    if (ticket === undefined) return;
    try {
      await readReceiptAccess(receipt.id, ticket);
    } finally {
      finish(ticket);
    }
  }
  async function reconcileReceipt() {
    if (!receipt?.id || receiptAccessUnverified) return;
    const ticket = begin();
    if (ticket === undefined) return;
    const id = receipt.id;
    try {
      const result = await request<CommandResult>('commands/' + id + '/reconcile', {});
      if (ticket !== sequence.current) return;
      if (result.id !== id) throw new Error('The reconciliation returned a different command.');
      setReceipt(result);
    } catch (cause) {
      if (ticket !== sequence.current) return;
      setError((cause as Error).message);
      if (cause instanceof RequestError && [403, 404].includes(cause.status))
        await readReceiptAccess(id, ticket, (cause as Error).message);
    } finally {
      finish(ticket);
    }
  }
  const rows = Array.isArray(records.data) ? records.data : [];
  const filtered = rows.filter((row) =>
    JSON.stringify(row).toLowerCase().includes(search.toLowerCase()),
  );
  const valid =
    pending &&
    parameters(pending.path, pending.method).every(
      (param) => !param.required || !!pending.query[param.name],
    ) &&
    (pending.method === 'DELETE' ||
      !bodySchema(pending.path, pending.method).properties ||
      Object.keys(pending.body).length > 0);
  return (
    <div className="command-workflow">
      <section className="command-source panel">
        <h2>
          <span className="step-dot">1</span> Select target
        </h2>
        {target.scope && (
          <label className="field">
            {target.scope === 'collection' ? 'Wallet collection' : 'Authorization server'}
            <select
              value={scope}
              disabled={busy || !!pending}
              onChange={(event) => {
                setScope(event.target.value);
                setIdentity('');
                setDetail(undefined);
                setReceipt(undefined);
                setReceiptAccessUnverified(false);
              }}
            >
              <option value="">Choose…</option>
              {(scopeData.data ?? []).map((row) => (
                <option key={row.ID ?? row.Name} value={row.ID ?? row.Name}>
                  {row.IssuerEndpoint ?? row.Name}
                </option>
              ))}
            </select>
          </label>
        )}
        {scopeData.error && <ErrorBox error={scopeData.error} />}
        <input
          aria-label="Find target"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a loaded target…"
        />
        <div className="inline-actions">
          <button
            disabled={busy || records.loading || !!pending || (!!target.scope && !scope)}
            onClick={() => records.refresh()}
          >
            Reload targets
          </button>
          {!target.readOnly && (
            <button
              disabled={busy || !!pending || (!!target.scope && !scope)}
              onClick={() => prepare('create')}
            >
              Create new
            </button>
          )}
        </div>
        {records.error && <ErrorBox error={records.error} />}
        {records.loading ? (
          <Loading />
        ) : (
          <>
            <p className="muted">
              {filtered.length} matching / {rows.length} loaded
            </p>
            <div className="target-options">
              {filtered.slice(0, 250).map((row) => (
                <button
                  key={String(row[target.identity])}
                  disabled={busy || !!pending}
                  aria-pressed={identity === String(row[target.identity])}
                  onClick={() => void select(row)}
                >
                  <strong>{String(row[target.identity])}</strong>
                  <small>
                    {row.Description ??
                      row.FullName ??
                      (target.identity !== 'Name' ? row.Name : undefined) ??
                      row.NameSpace ??
                      row.State}
                  </small>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
      <section className="command-detail panel">
        {error && <ErrorBox error={error} />}
        {busy && <Loading />}
        {pending ? (
          <>
            <div className="command-stage">
              <Badge>Step {pending.stage === 'prepare' ? '2 · Prepare' : '3 · Review'}</Badge>
              <h2>{pending.title}</h2>
              <p>
                {target.title}
                {pending.identity ? ' / ' + pending.identity : ''}
              </p>
            </div>
            {pending.stage === 'prepare' ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void reviewCommand();
                }}
              >
                <fieldset disabled={busy} className="command-inputs">
                  {parameters(pending.path, pending.method).map((param) => (
                    <label className="field" key={param.name}>
                      {human(param.name)}
                      {param.required ? ' *' : ''}
                      <input
                        required={!!param.required}
                        readOnly={
                          !!pending.identity &&
                          (param.name === target.parameter || param.name === target.scope)
                        }
                        value={pending.query[param.name] ?? ''}
                        onChange={(event) =>
                          setPending({
                            ...pending,
                            query: { ...pending.query, [param.name]: event.target.value },
                          })
                        }
                      />
                    </label>
                  ))}
                  {pending.method !== 'DELETE' && (
                    <CommandFields
                      schema={bodySchema(pending.path, pending.method)}
                      value={pending.body}
                      previous={pending.base}
                      onChange={(body) => setPending({ ...pending, body })}
                    />
                  )}
                  <p className="muted">
                    Only included fields are sent. Omitted fields retain their native values.
                  </p>
                  <div className="inline-actions">
                    <button type="button" onClick={() => setPending(undefined)}>
                      Discard command
                    </button>
                    <button className="primary" disabled={!valid}>
                      Review command
                    </button>
                  </div>
                </fieldset>
              </form>
            ) : (
              <>
                <p>Review the selected target and values before this command changes IRIS.</p>
                <Evidence
                  value={redact({
                    target: pending.query,
                    before: pending.review?.before
                      ? pending.method === 'DELETE'
                        ? pending.review.before
                        : Object.fromEntries(
                            Object.keys(pending.review.proposed).map((key) => [
                              key,
                              pending.review?.before?.[key],
                            ]),
                          )
                      : undefined,
                    proposed:
                      pending.method === 'DELETE'
                        ? 'Delete the selected record'
                        : pending.review?.proposed,
                    processGeneration: pending.review?.nativeIdentity,
                  })}
                />
                {pending.destructive && (
                  <label className="field">
                    Type {pending.review?.confirmation} to confirm
                    <input
                      aria-label="Confirm command target"
                      disabled={busy}
                      value={pending.confirm}
                      onChange={(event) => setPending({ ...pending, confirm: event.target.value })}
                    />
                  </label>
                )}
                <div className="inline-actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      setPending({ ...pending, stage: 'prepare', confirm: '', review: undefined })
                    }
                  >
                    Back to preparation
                  </button>
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !pending.review ||
                      (pending.destructive && pending.confirm !== pending.review.confirmation)
                    }
                    onClick={() => void execute()}
                  >
                    Execute once
                  </button>
                </div>
              </>
            )}
          </>
        ) : detail ? (
          <>
            <h2>{identity}</h2>
            <div className="inline-actions">
              {!target.readOnly && (
                <>
                  <button disabled={busy} onClick={() => prepare('edit')}>
                    {target.opaque ? 'Rotate entry' : 'Prepare update'}
                  </button>
                  <button disabled={busy} onClick={() => prepare('delete')}>
                    Prepare deletion
                  </button>
                </>
              )}
              {target.id === 'users' && (
                <button disabled={busy} onClick={() => prepare('password')}>
                  Reset password
                </button>
              )}
              {target.id === 'oauthClients' && (
                <button disabled={busy} onClick={() => prepare('secrets')}>
                  Rotate client credentials
                </button>
              )}
              {(target.id === 'tasks'
                ? ['run', 'suspend', 'resume']
                : target.id === 'processes'
                  ? ['suspend', 'resume', 'terminate']
                  : []
              ).map((action) => (
                <button
                  key={action}
                  disabled={
                    busy ||
                    (target.id === 'processes' &&
                      action !== 'resume' &&
                      detail[action === 'terminate' ? 'CanBeTerminated' : 'CanBeSuspended'] !==
                        true)
                  }
                  onClick={() => prepare(action)}
                >
                  {human(action)}
                </button>
              ))}
            </div>
            <Evidence value={detail} />
            {execution && (
              <section>
                <h3>Native task execution state</h3>
                <Evidence value={execution} />
              </section>
            )}
          </>
        ) : receiptAccessUnverified && receipt ? (
          <aside className="notice" ref={recoveryElement} tabIndex={-1}>
            <p>
              The command receipt is unavailable. Its saved ID remains below. Retrying reads that
              receipt; it does not resend the command.
            </p>
            <p>
              <code style={{ overflowWrap: 'anywhere' }}>{receipt.id}</code>
            </p>
            <button disabled={busy} onClick={() => void retryReceipt()}>
              Retry receipt access
            </button>
            <p>
              <a href="#command-history">Open command history</a>
            </p>
          </aside>
        ) : receipt ? (
          <div ref={resultElement} tabIndex={-1}>
            <h2>Command result</h2>
            <Badge tone={receipt.status === 'verified' ? 'good' : 'warning'}>
              {receipt.status === 'reviewed'
                ? 'Execution outcome unconfirmed'
                : (outcomeLabels[receipt.status as keyof typeof outcomeLabels] ?? receipt.status)}
            </Badge>
            <p>{receipt.message}</p>
            <Evidence value={receipt} />
            {['uncertain', 'acknowledged'].includes(receipt.status) && (
              <button disabled={busy} onClick={() => void reconcileReceipt()}>
                Read current result
              </button>
            )}
            <a href="#command-history">Open command history</a>
          </div>
        ) : (
          <div className="command-empty">
            <span className="step-dot">2</span>
            <h2>Prepare a command</h2>
            <p>
              Select an existing target or create a new one. Every write has a separate review step.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
