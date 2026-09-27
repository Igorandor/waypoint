import { useState } from 'react';
import type { CommandResult } from '../../shared/command-result';
import { outcomeLabels } from '../../shared/command-result';
import { request } from '../api';
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
  async function review() {
    setBusy(true);
    setError('');
    try {
      setRecord(await request('commands/review', { command: candidate }));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function execute() {
    if (!record || dispatched) return;
    setBusy(true);
    setError('');
    setDispatched(true);
    try {
      setRecord(await request('commands/' + record.id + '/execute', { confirmation }));
      onSettled?.();
    } catch (cause) {
      setError((cause as Error).message);
      try {
        setRecord(await request('commands/' + record.id));
      } catch {
        /* Keep the consumed ID visible for recovery. */
      }
    } finally {
      setBusy(false);
    }
  }
  async function reconcile() {
    if (!record) return;
    setBusy(true);
    setError('');
    try {
      setRecord(await request('commands/' + record.id + '/reconcile', {}));
      onSettled?.();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
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
      {!record ? (
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
        <>
          <h4>{outcomeLabels[record.status]}</h4>
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
        </>
      )}
    </section>
  );
}
