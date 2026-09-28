import { useRef, useState } from 'react';
import { Archive, Download, MessageSquare, Plus, Send, Trash2 } from 'lucide-react';
import type { Run } from '../../../shared/runbook';
import {
  assertionCounts,
  canArchive,
  exportHandover,
  handoverInputSchema,
  type HandoverInput,
} from '../../../shared/run-records';
import { handoverHtml } from '../../../shared/handover-report';
import { download } from '../../api';
import { Badge, ErrorBox, Modal } from '../../components/ui';
import type { RunAction } from '../../pages/Runbooks';

const emptyHandover = (): HandoverInput => ({
  recipient: '',
  summary: '',
  outstandingRisks: '',
  nextActions: [],
  references: [],
  delivered: false,
});
function downloadableHtml(run: Run) {
  const url = URL.createObjectURL(
    new Blob([handoverHtml(run)], { type: 'text/html;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'waypoint-handover-' + run.id + '.html';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function RunRecordTools({
  run,
  busy,
  exportBlocked = false,
  accessPending = false,
  onAction,
}: {
  run: Run;
  busy: boolean;
  exportBlocked?: boolean;
  accessPending?: boolean;
  onAction: RunAction;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<HandoverInput>(emptyHandover);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const initialDraft = useRef('');
  const blocked = busy || exportBlocked || saving;
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<'observation' | 'decision' | 'follow-up'>('observation');
  const checks = assertionCounts(run);
  const archive = canArchive(run);
  function edit() {
    const value = run.handover
      ? {
          recipient: run.handover.recipient,
          summary: run.handover.summary,
          outstandingRisks: run.handover.outstandingRisks,
          nextActions: structuredClone(run.handover.nextActions),
          references: [...run.handover.references],
          delivered: run.handover.delivered,
        }
      : emptyHandover();
    setDraft(value);
    initialDraft.current = JSON.stringify(value);
    setConfirmDiscard(false);
    setRevision(run.revision ?? 0);
    setError('');
    setEditing(true);
  }
  function closeEditor() {
    if (busy || savingRef.current) return;
    if (confirmDiscard) setConfirmDiscard(false);
    else if (JSON.stringify(draft) !== initialDraft.current) setConfirmDiscard(true);
    else setEditing(false);
  }
  async function save() {
    if (blocked || savingRef.current) return;
    const result = handoverInputSchema.safeParse(draft);
    if (!result.success) {
      setError(result.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setError('');
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await onAction('handover', { revision, handover: result.data });
      if (saved.ok) setEditing(false);
      else setError(saved.error);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save handover details.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return (
    <section className="run-record-tools">
      {checks.failed + checks.unknown + checks.passed > 0 && (
        <div className="run-check-results">
          <strong>Recorded checks</strong>
          <Badge tone="good">{checks.passed} passed</Badge>
          <Badge tone={checks.failed ? 'warning' : 'neutral'}>{checks.failed} failed</Badge>
          <Badge tone={checks.unknown ? 'warning' : 'neutral'}>{checks.unknown} unknown</Badge>
        </div>
      )}
      <div className="record-tool-actions">
        <button disabled={blocked} onClick={edit}>
          <Send size={15} /> Prepare handover
        </button>
        <button
          disabled={exportBlocked}
          onClick={() => download('waypoint-handover-' + run.id + '.json', exportHandover(run))}
        >
          <Download size={15} /> JSON package
        </button>
        <button disabled={exportBlocked} onClick={() => downloadableHtml(run)}>
          <Download size={15} /> Printable report
        </button>
        <button
          disabled={blocked || (!run.archivedAt && !archive.allowed)}
          title={run.archivedAt ? 'Return this closed run to history' : archive.reason}
          onClick={() =>
            void onAction('archive', { revision: run.revision ?? 0, archived: !run.archivedAt })
          }
        >
          <Archive size={15} /> {run.archivedAt ? 'Unarchive' : 'Archive closed run'}
        </button>
      </div>
      {run.archivedAt && (
        <p>
          Archived {new Date(run.archivedAt).toLocaleString()}. Recorded observations remain
          available.
        </p>
      )}
      {run.handover && (
        <div className="run-handover-summary">
          <h3>Handover for {run.handover.recipient || 'an unspecified recipient'}</h3>
          <p>{run.handover.summary}</p>
          {run.handover.outstandingRisks && (
            <p>
              <strong>Outstanding risks: </strong>
              {run.handover.outstandingRisks}
            </p>
          )}
          <span>
            {run.handover.nextActions.filter((action) => !action.completed).length} open follow-up
            actions
          </span>
          <small>
            {run.handover.delivered
              ? 'Delivery recorded by ' + run.handover.updatedBy
              : 'Delivery not recorded'}
            . Execution remains with {run.owner}.
          </small>
        </div>
      )}
      <details className="run-notes" open={(run.notes?.length ?? 0) > 0}>
        <summary>
          <MessageSquare size={15} /> Operator notes · {run.notes?.length ?? 0}
        </summary>
        {run.notes?.map((item) => (
          <article key={item.id}>
            <span>
              {item.category} · {item.author}
            </span>
            <time>{new Date(item.at).toLocaleString()}</time>
            <p>{item.text}</p>
          </article>
        ))}
        <label className="field">
          Note type
          <select
            value={category}
            disabled={blocked}
            onChange={(event) => setCategory(event.target.value as typeof category)}
          >
            <option value="observation">Observation</option>
            <option value="decision">Decision</option>
            <option value="follow-up">Follow-up</option>
          </select>
        </label>
        <label className="field">
          Add a note
          <textarea
            rows={3}
            maxLength={2000}
            value={note}
            disabled={blocked}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <button
          disabled={blocked || !note.trim()}
          onClick={async () => {
            if (
              (
                await onAction('notes', {
                  revision: run.revision ?? 0,
                  text: note.trim(),
                  category,
                })
              ).ok
            )
              setNote('');
          }}
        >
          Append note
        </button>
      </details>
      {editing && !accessPending && (
        <Modal
          key={confirmDiscard ? 'discard-handover' : 'edit-handover'}
          title={confirmDiscard ? 'Discard handover draft?' : 'Read-only handover package'}
          onClose={closeEditor}
        >
          {confirmDiscard ? (
            <>
              <div className="modal-body">
                <p>
                  Your handover changes have not been saved. Keep editing or discard this draft.
                </p>
              </div>
              <footer>
                <button
                  autoFocus
                  disabled={busy || saving}
                  onClick={() => setConfirmDiscard(false)}
                >
                  Keep editing
                </button>
                <button
                  disabled={busy || saving}
                  onClick={() => {
                    if (busy || savingRef.current) return;
                    setConfirmDiscard(false);
                    setEditing(false);
                  }}
                >
                  Discard draft
                </button>
              </footer>
            </>
          ) : (
            <>
              <div className="modal-body handover-editor">
                <p>
                  The package shares the recorded results. It does not grant another account
                  permission to execute or restore this run.
                </p>
                {run.needsRestore && (
                  <div className="restoration-banner">
                    Restoration is still pending. {run.owner} must restore and verify the target in
                    Waypoint.
                  </div>
                )}
                <label className="field">
                  Intended recipient
                  <input
                    maxLength={128}
                    disabled={blocked}
                    value={draft.recipient}
                    onChange={(event) => setDraft({ ...draft, recipient: event.target.value })}
                  />
                </label>
                <label className="field">
                  Summary
                  <textarea
                    rows={4}
                    maxLength={2000}
                    disabled={blocked}
                    value={draft.summary}
                    onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
                  />
                </label>
                <label className="field">
                  Outstanding risks
                  <textarea
                    rows={3}
                    maxLength={2000}
                    disabled={blocked}
                    value={draft.outstandingRisks}
                    onChange={(event) =>
                      setDraft({ ...draft, outstandingRisks: event.target.value })
                    }
                  />
                </label>
                <h3>Follow-up actions</h3>
                {draft.nextActions.map((item, index) => (
                  <div className="handover-action" key={item.id}>
                    <label className="field">
                      Action
                      <input
                        required
                        maxLength={200}
                        disabled={blocked}
                        value={item.title}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            nextActions: draft.nextActions.map((action, offset) =>
                              offset === index ? { ...action, title: event.target.value } : action,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      Due (UTC)
                      <input
                        type="datetime-local"
                        disabled={blocked}
                        value={item.dueAt.slice(0, 16)}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            nextActions: draft.nextActions.map((action, offset) =>
                              offset === index
                                ? {
                                    ...action,
                                    dueAt: event.target.value
                                      ? new Date(event.target.value + 'Z').toISOString()
                                      : '',
                                  }
                                : action,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="check-option">
                      <input
                        type="checkbox"
                        disabled={blocked}
                        checked={item.completed}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            nextActions: draft.nextActions.map((action, offset) =>
                              offset === index
                                ? { ...action, completed: event.target.checked }
                                : action,
                            ),
                          })
                        }
                      />{' '}
                      Completed
                    </label>
                    <button
                      disabled={blocked}
                      aria-label={`Remove follow-up ${index + 1}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          nextActions: draft.nextActions.filter((_, offset) => offset !== index),
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button
                  disabled={blocked || draft.nextActions.length >= 20}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      nextActions: [
                        ...draft.nextActions,
                        { id: crypto.randomUUID(), title: '', completed: false, dueAt: '' },
                      ],
                    })
                  }
                >
                  <Plus size={15} /> Add follow-up
                </button>
                <label className="field">
                  HTTPS references, one per line
                  <textarea
                    rows={3}
                    value={draft.references.join('\n')}
                    disabled={blocked}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        references: event.target.value.split('\n').filter(Boolean),
                      })
                    }
                  />
                </label>
                <label className="check-option">
                  <input
                    type="checkbox"
                    disabled={blocked}
                    checked={draft.delivered}
                    onChange={(event) => setDraft({ ...draft, delivered: event.target.checked })}
                  />{' '}
                  I have delivered this package to the intended recipient
                </label>
                <small>
                  Waypoint records your statement; it does not send a message or confirm receipt.
                </small>
                {error && <ErrorBox error={error} />}
              </div>
              <footer>
                <button disabled={busy || saving} onClick={closeEditor}>
                  Cancel
                </button>
                <button
                  className="primary"
                  disabled={blocked || !draft.summary.trim()}
                  onClick={() => void save()}
                >
                  Save handover details
                </button>
              </footer>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
