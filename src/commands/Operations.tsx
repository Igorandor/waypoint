import { useState } from 'react';
import { targets, type Target } from '../../shared/commands';
import { parameters, bodySchema, spec } from '../../shared/schema';
import { newCommandBody, changedKeys } from '../../shared/command-draft';
import { redact } from '../../shared/redaction';
import { iris, request } from '../api';
import { outcomeLabels, type CommandResult } from '../../shared/command-result';
import { useData } from '../hooks';
import { Badge, ErrorBox, Loading, PageHeader } from '../components/ui';
import { Evidence, human } from '../components/DataView';
import { CommandFields } from './CommandFields';
type Candidate = {
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
    [receipt, setReceipt] = useState<any>();
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
    setIdentity(String(row[target.identity]));
    setPending(undefined);
    setReceipt(undefined);
    setError('');
    setDetail(undefined);
    setExecution(undefined);
    setBusy(true);
    try {
      const current = target.opaque
        ? row
        : (await iris(target.record, queryFor('GET', String(row[target.identity])))).data;
      if (target.id === 'tasks')
        setExecution((await iris('/v2/task/info', { id: String(row[target.identity]) })).data);
      setDetail(target.id === 'processes' ? { ...row, ...current } : current);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
    const command = pending;
    setBusy(true);
    setError('');
    try {
      if (command.base) {
        const current = (await iris(target.record, queryFor('GET', command.identity))).data;
        const affected =
          command.method === 'DELETE' ? Object.keys(command.base) : Object.keys(command.body);
        const conflicts = changedKeys(
          command.base,
          Object.fromEntries(affected.map((key) => [key, true])),
          current,
        );
        if (conflicts.length)
          throw new Error(
            'Native state changed: ' +
              conflicts.join(', ') +
              '. Reload the target and prepare a new command.',
          );
      }
      const result = await request('commands/' + command.review!.id + '/execute', {
        confirmation: command.destructive ? command.confirm : command.review!.confirmation,
      });
      setReceipt(result);
      setPending(undefined);
      setDetail(undefined);
      setIdentity('');
      records.refresh();
    } catch (e) {
      setError((e as Error).message);
      try {
        setReceipt(await request('commands/' + command.review!.id));
      } catch {
        setReceipt({
          id: command.review!.id,
          status: 'uncertain',
          message:
            'The outcome could not be retrieved. Open command history before sending another write.',
        });
      }
      setPending(undefined);
      setDetail(undefined);
    } finally {
      setBusy(false);
    }
  }
  async function reviewCommand() {
    if (!pending) return;
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
      setPending({ ...pending, stage: 'review', review });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
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
                      ? Object.fromEntries(
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
        ) : receipt ? (
          <>
            <h2>Command result</h2>
            <Badge tone={receipt.status === 'verified' ? 'good' : 'warning'}>
              {outcomeLabels[receipt.status as keyof typeof outcomeLabels] ?? receipt.status}
            </Badge>
            <p>{receipt.message}</p>
            <Evidence value={receipt} />
            {['uncertain', 'acknowledged'].includes(receipt.status) && (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setReceipt(await request('commands/' + receipt.id + '/reconcile', {}));
                  } catch (cause) {
                    setError((cause as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Read current result
              </button>
            )}
            <a href="#command-history">Open command history</a>
          </>
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
