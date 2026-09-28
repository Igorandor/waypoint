import { useEffect, useRef, useState } from 'react';
import type { CommandResult } from '../../shared/command-result';
import { outcomeLabels } from '../../shared/command-result';
import { request, RequestError } from '../api';
import { ErrorBox } from '../components/ui';
import { Evidence } from '../components/DataView';

export type ActionCandidate = {
  path: string;
  method: 'POST' | 'PUT' | 'DELETE';
  query: Record<string, string>;
  body?: Record<string, unknown>;
};
export function ReviewedAction({
  candidate,
  title,
  onClose,
  onSettled,
}: {
  candidate: ActionCandidate;
  title: string;
  onClose: () => void;
  onSettled?: () => void;
}) {
  const [record, setRecord] = useState<CommandResult>();
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dispatched, setDispatched] = useState(false);
  const [recoveryId, setRecoveryId] = useState<string>();
  const sequence = useRef(0),
    pending = useRef(false);
  const recoveryElement = useRef<HTMLElement>(null),
    resultElement = useRef<HTMLDivElement>(null);
  const focusAfterRead = useRef<'recovery' | 'result' | undefined>(undefined);
  useEffect(
    () => () => {
      sequence.current++;
      pending.current = false;
    },
    [],
  );
  useEffect(() => {
    const target =
      focusAfterRead.current === 'recovery'
        ? recoveryElement.current
        : focusAfterRead.current === 'result'
          ? resultElement.current
          : undefined;
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'nearest' });
      focusAfterRead.current = undefined;
    }
  }, [recoveryId, record]);
  function begin() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    return ++sequence.current;
  }
  function finish(ticket: number) {
    if (ticket === sequence.current) {
      pending.current = false;
      setBusy(false);
    }
  }
  async function readReceipt(id: string, ticket: number, originalError = '') {
    setRecord(undefined);
    setRecoveryId(id);
    focusAfterRead.current = 'recovery';
    try {
      const result = await request<CommandResult>('commands/' + id);
      if (ticket !== sequence.current) return;
      if (result.id !== id) throw new Error('The receipt read returned a different command.');
      setRecord(result);
      setRecoveryId(undefined);
      focusAfterRead.current = 'result';
    } catch (cause) {
      if (ticket === sequence.current)
        setError([originalError, (cause as Error).message].filter(Boolean).join(' '));
    }
  }
  async function retryReceipt() {
    if (!recoveryId) return;
    const ticket = begin();
    if (ticket === undefined) return;
    try {
      await readReceipt(recoveryId, ticket);
    } finally {
      finish(ticket);
    }
  }
  async function review() {
    const ticket = begin();
    if (ticket === undefined) return;
    try {
      const result = await request<CommandResult>('commands/review', { command: candidate });
      if (ticket === sequence.current) setRecord(result);
    } catch (cause) {
      if (ticket === sequence.current) setError((cause as Error).message);
    } finally {
      finish(ticket);
    }
  }
  async function execute() {
    if (!record || dispatched) return;
    const ticket = begin();
    if (ticket === undefined) return;
    const id = record.id;
    setDispatched(true);
    try {
      const result = await request<CommandResult>('commands/' + id + '/execute', { confirmation });
      if (ticket !== sequence.current) return;
      if (result.id !== id) throw new Error('The execution returned a different command.');
      setRecord(result);
      onSettled?.();
    } catch (cause) {
      if (ticket !== sequence.current) return;
      setError((cause as Error).message);
      if (!(cause instanceof RequestError && cause.status === 401))
        await readReceipt(id, ticket, (cause as Error).message);
    } finally {
      finish(ticket);
    }
  }
  async function reconcile() {
    if (!record) return;
    const ticket = begin();
    if (ticket === undefined) return;
    const id = record.id;
    try {
      const result = await request<CommandResult>('commands/' + id + '/reconcile', {});
      if (ticket !== sequence.current) return;
      if (result.id !== id) throw new Error('The reconciliation returned a different command.');
      setRecord(result);
      onSettled?.();
    } catch (cause) {
      if (ticket !== sequence.current) return;
      setError((cause as Error).message);
      if (cause instanceof RequestError && [403, 404].includes(cause.status))
        await readReceipt(id, ticket, (cause as Error).message);
    } finally {
      finish(ticket);
    }
  }
  return (
    <section className="panel reviewed-action" aria-label={title}>
      <div className="section-heading">
        <h3>{title}</h3>
        <button onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
      {error && <ErrorBox error={error} />}
      {recoveryId ? (
        <aside className="notice" ref={recoveryElement} tabIndex={-1}>
          <p>
            The command receipt is unavailable. Its saved ID remains below. Retrying reads that
            receipt; it does not resend the command.
          </p>
          <p>
            <code style={{ overflowWrap: 'anywhere' }}>{recoveryId}</code>
          </p>
          <button disabled={busy} onClick={() => void retryReceipt()}>
            Retry receipt access
          </button>
          <p>
            <a href="#command-history">Open command history</a>
          </p>
        </aside>
      ) : !record ? (
        <>
          <p>
            Prepare a server review using the current target state. This step sends no native
            change.
          </p>
          <Evidence value={candidate} />
          <button className="primary" disabled={busy} onClick={() => void review()}>
            {busy ? 'Reading target…' : 'Prepare review'}
          </button>
        </>
      ) : (
        <div className="reviewed-action-result" ref={resultElement} tabIndex={-1}>
          <h4>
            {dispatched && record.status === 'reviewed'
              ? 'Execution outcome unconfirmed'
              : outcomeLabels[record.status]}
          </h4>
          <p>{record.message}</p>
          <dl className="dossier-facts">
            <div>
              <dt>Target</dt>
              <dd>{record.target}</dd>
            </div>
            <div>
              <dt>Command ID</dt>
              <dd>{record.id}</dd>
            </div>
            <div>
              <dt>Review expires</dt>
              <dd>{new Date(record.expiresAt).toLocaleString()}</dd>
            </div>
          </dl>
          <details>
            <summary>Recorded before state</summary>
            <Evidence value={record.before} />
          </details>
          <details>
            <summary>Proposed fields</summary>
            <Evidence value={record.proposed} />
          </details>
          {record.observed !== undefined && (
            <details open>
              <summary>Observed result</summary>
              <Evidence value={record.observed} />
            </details>
          )}
          {record.status === 'reviewed' && !dispatched && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void execute();
              }}
            >
              <label className="field">
                Type {record.confirmation} to confirm
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  maxLength={256}
                />
              </label>
              <button className="primary" disabled={busy || confirmation !== record.confirmation}>
                Execute once
              </button>
            </form>
          )}
          {['uncertain', 'acknowledged'].includes(record.status) && (
            <button disabled={busy} onClick={() => void reconcile()}>
              Read current result
            </button>
          )}
          {dispatched && record.status === 'reviewed' && (
            <p>
              The dispatch response was not obtained. Open command history to inspect this ID before
              preparing another command.
            </p>
          )}
          <a href="#command-history">Open command history</a>
        </div>
      )}
    </section>
  );
}
