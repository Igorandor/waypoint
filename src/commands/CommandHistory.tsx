import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import {
  outcomeLabels,
  type CommandResult,
  type CommandOutcome,
} from '../../shared/command-result';
import { request, download, RequestError } from '../api';
import { Badge, ErrorBox, Loading, PageHeader } from '../components/ui';
import { Evidence, human } from '../components/DataView';
import './history.css';

type Summary = Pick<
  CommandResult,
  'id' | 'title' | 'target' | 'status' | 'createdAt' | 'updatedAt' | 'message' | 'operation'
>;
const statusTone = (status: CommandOutcome) =>
  status === 'verified'
    ? 'good'
    : ['uncertain', 'rejected', 'conflict', 'dispatching'].includes(status)
      ? 'warning'
      : 'neutral';
export function CommandHistory() {
  const [cachedRecords, setRecords] = useState<Summary[]>([]);
  const [unverified, setUnverified] = useState<string[]>([]);
  const records = useMemo(
    () => cachedRecords.filter((record) => !unverified.includes(record.id)),
    [cachedRecords, unverified],
  );
  const [selected, setSelected] = useState<CommandResult>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const sequence = useRef(0),
    listSequence = useRef(0);
  const selection = useRef<string | undefined>(undefined);
  const notices = useRef(new Map<string, HTMLElement>());
  const detailElement = useRef<HTMLElement>(null);
  const focusAfterRead = useRef<{ ticket: number; id?: string } | undefined>(undefined);
  useEffect(() => {
    const pending = focusAfterRead.current;
    if (!pending || pending.ticket !== sequence.current) return;
    const target = pending.id ? notices.current.get(pending.id) : detailElement.current;
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'nearest' });
    focusAfterRead.current = undefined;
  }, [unverified, selected]);
  function removeRecord(id: string) {
    ++listSequence.current;
    setLoading(false);
    setSelected((current) => (current?.id === id ? undefined : current));
    if (selection.current === id) selection.current = undefined;
    if (focusAfterRead.current?.id === id) focusAfterRead.current = undefined;
    setRecords((current) => current.filter((record) => record.id !== id));
    setUnverified((ids) => ids.filter((value) => value !== id));
  }
  async function readList(ticket: number) {
    try {
      const result = await request<Summary[]>('commands');
      if (ticket === listSequence.current) setRecords(result);
    } catch (cause) {
      if (ticket !== listSequence.current) return;
      if (cause instanceof RequestError && cause.status === 403) {
        setRecords([]);
      }
      throw cause;
    }
  }
  async function readDetail(id: string, ticket: number) {
    try {
      const result = await request<CommandResult>('commands/' + id);
      if (ticket !== sequence.current) return;
      if (result.id !== id) throw new Error('The command read returned a different record.');
      setSelected(result);
      selection.current = id;
      return result;
    } catch (cause) {
      if (ticket !== sequence.current) return;
      setError((cause as Error).message);
      if (cause instanceof RequestError && [403, 404].includes(cause.status)) removeRecord(id);
      throw cause;
    }
  }
  async function refresh() {
    const listTicket = ++listSequence.current,
      selectedTicket = sequence.current,
      selectedId = selection.current;
    setLoading(true);
    setError('');
    const errors: string[] = [];
    try {
      try {
        await readList(listTicket);
      } catch (cause) {
        errors.push((cause as Error).message);
        if (cause instanceof RequestError && cause.status === 401) return;
      }
      if (
        selectedId &&
        selectedTicket === sequence.current &&
        listTicket === listSequence.current
      ) {
        try {
          await readDetail(selectedId, selectedTicket);
        } catch (cause) {
          errors.push((cause as Error).message);
        }
      }
    } finally {
      if (listTicket === listSequence.current) {
        setLoading(false);
        if (selectedTicket === sequence.current) setError([...new Set(errors)].join(' '));
      }
    }
  }
  useEffect(() => {
    void refresh();
    return () => {
      sequence.current++;
      listSequence.current++;
    };
  }, []);
  const visible = useMemo(
    () =>
      records.filter((record) => {
        if (
          status !== 'all' &&
          (status === 'attention'
            ? !['uncertain', 'dispatching', 'conflict', 'rejected'].includes(record.status)
            : record.status !== status)
        )
          return false;
        if (from && record.createdAt.slice(0, 10) < from) return false;
        if (to && record.createdAt.slice(0, 10) > to) return false;
        return `${record.target} ${record.title} ${record.operation.path} ${record.message}`
          .toLowerCase()
          .includes(search.toLowerCase());
      }),
    [records, search, status, from, to],
  );
  async function select(id: string) {
    const ticket = ++sequence.current;
    selection.current = id;
    focusAfterRead.current = undefined;
    setSelected((current) => (current?.id === id ? current : undefined));
    setBusy(true);
    setError('');
    try {
      await readDetail(id, ticket);
    } catch (cause) {
      if (ticket === sequence.current) setError((cause as Error).message);
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }
  async function recheck(id: string, refusal = '') {
    const ticket = ++sequence.current;
    ++listSequence.current;
    selection.current = undefined;
    focusAfterRead.current = { ticket, id };
    setLoading(false);
    setBusy(true);
    setSelected(undefined);
    setError(refusal);
    setUnverified((ids) => [...new Set([...ids, id])]);
    try {
      const result = await readDetail(id, ticket);
      if (!result || ticket !== sequence.current) return;
      const summary: Summary = {
        id: result.id,
        title: result.title,
        target: result.target,
        status: result.status,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        message: result.message,
        operation: result.operation,
      };
      setRecords((current) => [...current.filter((record) => record.id !== id), summary]);
      setUnverified((ids) => ids.filter((value) => value !== id));
      focusAfterRead.current = { ticket };
    } catch (cause) {
      if (ticket === sequence.current)
        setError([refusal, (cause as Error).message].filter(Boolean).join(' '));
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!selected) return;
    const ticket = ++sequence.current,
      id = selected.id;
    let reconciled = false;
    setBusy(true);
    setError('');
    try {
      const result = await request<CommandResult>('commands/' + id + '/reconcile', {});
      if (ticket !== sequence.current) return;
      if (result.id !== id) throw new Error('The reconciliation returned a different command.');
      setSelected(result);
      reconciled = true;
      await readList(++listSequence.current);
    } catch (cause) {
      if (ticket !== sequence.current) return;
      if (!reconciled && cause instanceof RequestError && [403, 404].includes(cause.status))
        await recheck(id, (cause as Error).message);
      else setError((cause as Error).message);
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Command history"
        description="Review submitted changes and check unresolved outcomes."
      >
        <button disabled={loading || busy} onClick={() => void refresh()}>
          <RefreshCw size={16} /> Refresh
        </button>
        <button
          disabled={!visible.length}
          onClick={() =>
            download('waypoint-command-index.json', {
              exportedAt: new Date().toISOString(),
              filters: { status, search, from, to },
              commands: visible,
            })
          }
        >
          <Download size={16} /> Export filtered index
        </button>
      </PageHeader>
      {error && <ErrorBox error={error} />}
      {unverified.map((id) => (
        <aside
          className="notice"
          key={id}
          tabIndex={-1}
          ref={(element) => {
            if (element) notices.current.set(id, element);
            else notices.current.delete(id);
          }}
        >
          <p>
            This command is hidden from the history and its exports until access can be checked.
            Retrying reads the saved record; it does not resend the command.
          </p>
          <p>
            <code style={{ overflowWrap: 'anywhere' }}>{id}</code>
          </p>
          <button
            disabled={busy}
            aria-label={'Retry record access for command ' + id}
            onClick={() => void recheck(id)}
          >
            Retry record access
          </button>
        </aside>
      ))}
      <div className="command-history-stats">
        <span>
          <strong>{records.length}</strong> visible command records
        </span>
        <span>
          <strong>{records.filter((record) => record.status === 'verified').length}</strong>{' '}
          observed matches
        </span>
        <span>
          <strong>
            {
              records.filter((record) => ['uncertain', 'dispatching'].includes(record.status))
                .length
            }
          </strong>{' '}
          unresolved
        </span>
      </div>
      <div className="command-history-layout">
        <section className="panel command-history-index" aria-label="Command history">
          <label className="field">
            <span>
              <Search size={14} /> Find a command
            </span>
            <input
              maxLength={200}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="field">
            Outcome
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All visible commands</option>
              <option value="attention">Needs review</option>
              {Object.entries(outcomeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="history-date-range">
            <label className="field">
              From (UTC)
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label className="field">
              To (UTC)
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
          <span>{visible.length} matching records</span>
          {loading && !records.length ? (
            <Loading />
          ) : (
            visible.map((record) => (
              <button
                key={record.id}
                className="history-item"
                aria-pressed={selected?.id === record.id}
                disabled={busy}
                onClick={() => void select(record.id)}
              >
                <Badge tone={statusTone(record.status)}>{outcomeLabels[record.status]}</Badge>
                <strong>{record.title}</strong>
                <code>{record.target}</code>
                <small>{new Date(record.updatedAt).toLocaleString()}</small>
              </button>
            ))
          )}
          {!loading && !visible.length && <p>No commands match these filters.</p>}
        </section>
        {selected ? (
          <section className="panel command-history-detail" ref={detailElement} tabIndex={-1}>
            <div className="section-heading">
              <div>
                <h2>{selected.title}</h2>
                <code>{selected.target}</code>
              </div>
              <Badge tone={statusTone(selected.status)}>{outcomeLabels[selected.status]}</Badge>
            </div>
            <p className="command-outcome-message">{selected.message}</p>
            <dl className="command-facts">
              <div>
                <dt>Account</dt>
                <dd>{selected.owner}</dd>
              </div>
              <div>
                <dt>Instance</dt>
                <dd>{selected.instance}</dd>
              </div>
              <div>
                <dt>Reviewed</dt>
                <dd>{new Date(selected.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Dispatched</dt>
                <dd>
                  {selected.dispatchAt
                    ? new Date(selected.dispatchAt).toLocaleString()
                    : 'No dispatch recorded'}
                </dd>
              </div>
              <div>
                <dt>Observed</dt>
                <dd>
                  {selected.observedAt
                    ? new Date(selected.observedAt).toLocaleString()
                    : 'No readback recorded'}
                </dd>
              </div>
              <div>
                <dt>Native response</dt>
                <dd>{selected.responseStatus ?? 'Not received'}</dd>
              </div>
            </dl>
            <div className="inline-actions">
              <button
                onClick={() => download('waypoint-command-' + selected.id + '.json', selected)}
              >
                <Download size={15} /> Export result
              </button>
              {['uncertain', 'acknowledged'].includes(selected.status) && (
                <button className="primary" disabled={busy} onClick={() => void reconcile()}>
                  <ShieldCheck size={15} /> Read current state
                </button>
              )}
            </div>
            <h3>Reviewed fields</h3>
            <div
              className="command-field-table"
              role="region"
              aria-label="Reviewed command fields"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Before review</th>
                    <th>Requested</th>
                    <th>Observed later</th>
                  </tr>
                </thead>
                <tbody>
                  {[...new Set([...selected.fields, ...selected.writeOnlyFields])].map((field) => (
                    <tr key={field}>
                      <th>{human(field)}</th>
                      <td>
                        {selected.writeOnlyFields.includes(field) ? (
                          'Write-only'
                        ) : (
                          <Evidence value={selected.before?.[field]} />
                        )}
                      </td>
                      <td>
                        {selected.writeOnlyFields.includes(field) ? (
                          'Value omitted from journal'
                        ) : (
                          <Evidence value={selected.proposed[field]} />
                        )}
                      </td>
                      <td>
                        {selected.writeOnlyFields.includes(field) ? (
                          'Cannot verify value'
                        ) : (
                          <Evidence
                            value={
                              selected.observed && typeof selected.observed === 'object'
                                ? (selected.observed as Record<string, unknown>)[field]
                                : undefined
                            }
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!selected.fields.length && !selected.writeOnlyFields.length && (
              <p>
                This action has no configuration fields to compare. See the native state observation
                below.
              </p>
            )}
            {selected.nativeIdentity && (
              <section>
                <h3>Selected process generation</h3>
                <Evidence value={selected.nativeIdentity} />
                <p>
                  PID, start time and job number were checked before dispatch. Native tools can
                  still act between that check and the operation.
                </p>
              </section>
            )}
            <details open={['uncertain', 'acknowledged'].includes(selected.status)}>
              <summary>Native response and current observation</summary>
              <Evidence
                value={{
                  response: selected.response,
                  observed: selected.observed,
                  asyncId: selected.asyncId,
                }}
              />
            </details>
            <details>
              <summary>Operation and journal</summary>
              <Evidence value={selected.operation} />
              <ol className="command-event-list">
                {selected.events.map((event, index) => (
                  <li key={index}>
                    <time>{new Date(event.at).toLocaleString()}</time>
                    <strong>{outcomeLabels[event.status]}</strong>
                    <p>{event.message}</p>
                  </li>
                ))}
              </ol>
            </details>
            <p className="muted">
              Readback establishes current state, not exclusive causation. Another administration
              tool can change the same object. This journal never contains login credentials or
              submitted secret values.
            </p>
          </section>
        ) : (
          <section className="panel command-history-empty">
            <h2>Select a command</h2>
            <p>
              Commands are scoped to your account and this instance. Results whose source privileges
              have been revoked are not listed.
            </p>
            <a href="#apps">Prepare an application change</a>
          </section>
        )}
      </div>
    </>
  );
}
