import { DataView } from '../../components/DataView';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, Clock3, Download, RotateCcw, Square } from 'lucide-react';
import { nextStep, writeStep, type Run } from '../../../shared/runbook';
import { download } from '../../api';
import { Badge, ErrorBox, Modal } from '../../components/ui';
import { RunRecordTools } from './RunRecordTools';
import type { RunAction } from '../../pages/Runbooks';
import './records.css';

export function RunDetail({
  run,
  busy,
  outcomeUnknown = false,
  accessPending = false,
  onAction,
}: {
  run: Run;
  busy: boolean;
  outcomeUnknown?: boolean;
  accessPending?: boolean;
  onAction: RunAction;
}) {
  const [note, setNote] = useState(''),
    [restore, setRestore] = useState(false),
    [confirmation, setConfirmation] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const blocked = busy || outcomeUnknown || accessPending;
  const [completedItems, setCompletedItems] = useState<string[]>([]);
  const index = nextStep(run),
    current = run.steps[index];
  const [selectedStep, setSelectedStep] = useState(Math.max(index, 0));
  useEffect(() => {
    if (index >= 0) setSelectedStep(index);
    setCompletedItems([]);
  }, [index]);
  const inspected = run.steps[selectedStep];
  const label =
    current?.kind === 'checkpoint'
      ? 'Record note and continue'
      : current && writeStep(current.kind)
        ? current.title
        : 'Run next step';
  return (
    <section
      className="run-detail panel"
      hidden={accessPending}
      style={accessPending ? { display: 'none' } : undefined}
    >
      <div className="run-heading">
        <div>
          <span className="eyebrow">
            {run.instance} · {run.id.slice(0, 8)}
          </span>
          <h2>{run.title}</h2>
          <code>{run.target}</code>
        </div>
        <button
          disabled={outcomeUnknown || accessPending}
          onClick={() => download('waypoint-run-' + run.id + '.json', run)}
        >
          <Download size={15} /> Export report
        </button>
      </div>
      {outcomeUnknown && (
        <p role="alert">
          The action result has not been retrieved. This is the last known report, from{' '}
          {new Date(run.updatedAt).toLocaleString()}. Actions and exports are paused until Refresh
          runs retrieves the current record.
        </p>
      )}
      <div className="run-meta">
        <Badge tone={run.status === 'completed' ? 'good' : 'neutral'}>
          {run.status === 'completed'
            ? 'Completed'
            : run.status === 'stopped'
              ? 'Stopped'
              : 'In progress'}
        </Badge>
        <span>Started {new Date(run.createdAt).toLocaleString()}</span>
        <span>Operator {run.owner}</span>
      </div>
      {run.needsRestore && (
        <div className="restoration-banner">
          <RotateCcw size={19} />
          <div>
            <strong>Original state still needs restoration</strong>
            <p>
              You can finish the checkpoint or restore now. Closing the browser does not restore
              IRIS automatically.
            </p>
          </div>
          <button
            disabled={blocked}
            onClick={() => {
              setRestore(true);
              setConfirmation('');
              setRestoreError('');
            }}
          >
            Restore now
          </button>
        </div>
      )}
      <div className="step-workbench">
        <nav className="step-index" aria-label="Run steps">
          {run.steps.map((step, i) => (
            <button
              key={step.procedureStep?.id ?? step.kind}
              aria-pressed={selectedStep === i}
              onClick={() => setSelectedStep(i)}
              className={'step-' + step.status}
            >
              <span className="step-index-number">
                {step.status === 'done' ? <Check size={15} /> : i + 1}
              </span>
              <span>
                <strong>{step.title}</strong>
                <small>{step.status === 'done' ? 'Recorded' : step.status}</small>
              </span>
            </button>
          ))}
        </nav>
        <section className="step-inspector" aria-label="Selected step result" aria-live="polite">
          <div className="step-inspector-heading">
            <span>
              Step {selectedStep + 1} / {run.steps.length}
            </span>
            <Badge
              tone={
                inspected.status === 'done'
                  ? 'good'
                  : inspected.status === 'failed' || inspected.status === 'uncertain'
                    ? 'warning'
                    : 'neutral'
              }
            >
              {inspected.status}
            </Badge>
          </div>
          <h3>{inspected.title}</h3>
          <p>{inspected.description}</p>
          {inspected.finishedAt && <time>{new Date(inspected.finishedAt).toLocaleString()}</time>}
          {inspected.error && <ErrorBox error={inspected.error} />}
          {inspected.note && <blockquote>{inspected.note}</blockquote>}
          {inspected.evidence !== undefined ? (
            <DataView key={inspected.kind} data={inspected.evidence} kind={inspected.kind} />
          ) : (
            <div className="step-no-result">
              {inspected.status === 'skipped'
                ? 'This step was skipped.'
                : 'No result recorded for this step.'}
            </div>
          )}
          {inspected.attempts > 0 && (
            <small>
              {inspected.attempts} attempt{inspected.attempts === 1 ? '' : 's'} recorded
            </small>
          )}
        </section>
      </div>
      {run.status === 'active' && current && (
        <div className="run-control">
          {current.procedureStep?.kind === 'checklist' && (
            <div className="run-checklist">
              {current.procedureStep.items.map((item) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={completedItems.includes(item.id)}
                    disabled={blocked}
                    onChange={(event) =>
                      setCompletedItems(
                        event.target.checked
                          ? [...completedItems, item.id]
                          : completedItems.filter((id) => id !== item.id),
                      )
                    }
                  />
                  <span>
                    {item.text}
                    {item.required ? ' (required)' : ''}
                  </span>
                </label>
              ))}
              {current.procedureStep.reference && (
                <a
                  className="procedure-reference"
                  href={current.procedureStep.reference}
                  title={current.procedureStep.reference}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open checkpoint reference · {new URL(current.procedureStep.reference).host}
                </a>
              )}
            </div>
          )}
          {current.kind === 'checkpoint' && (
            <label className="field">
              Operator note
              <textarea
                rows={3}
                maxLength={2000}
                value={note}
                disabled={blocked}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What was done, what was checked, and whether the target is ready to restore."
              />
            </label>
          )}
          {current.status === 'uncertain' ? (
            <div className="uncertain-control">
              <div>
                <strong>Result uncertain</strong>
                <p>
                  Read the target state before deciding what to do. Reconciliation sends no write.
                </p>
              </div>
              <button
                className="primary"
                disabled={blocked}
                onClick={() => void onAction('reconcile')}
              >
                <RotateCcw size={16} /> Check current state
              </button>
            </div>
          ) : (
            <div className="next-control">
              <div>
                <span className="eyebrow">
                  Next · step {index + 1} of {run.steps.length}
                </span>
                <strong>{current.title}</strong>
              </div>
              <button
                className="primary"
                disabled={
                  blocked ||
                  current.status === 'running' ||
                  (current.kind === 'checkpoint' &&
                    (current.procedureStep?.kind !== 'checklist' ||
                      current.procedureStep.requireNote) &&
                    !note.trim()) ||
                  (current.procedureStep?.kind === 'checklist' &&
                    current.procedureStep.items.some(
                      (item) => item.required && !completedItems.includes(item.id),
                    ))
                }
                onClick={async () => {
                  if ((await onAction('next', { note, completedItems })).ok) {
                    setNote('');
                    setCompletedItems([]);
                  }
                }}
              >
                {outcomeUnknown
                  ? 'Refresh run before continuing'
                  : busy
                    ? 'Working…'
                    : current.status === 'running'
                      ? 'Operation in progress'
                      : current.status === 'failed'
                        ? 'Retry this step'
                        : label}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {!run.needsRestore && (
            <button
              className="text-link stop-run"
              disabled={blocked || current.status === 'running'}
              onClick={() => void onAction('stop')}
            >
              <Square size={12} /> Close this run without continuing
            </button>
          )}
        </div>
      )}
      {run.status !== 'active' && (
        <div className="run-closed">
          <Check size={20} />
          <div>
            <strong>{run.status === 'completed' ? 'Run complete' : 'Run closed'}</strong>
            <p>
              {run.status === 'completed'
                ? 'Select a step to inspect its result. Skipped steps remain marked in this report.'
                : 'The recorded steps remain available. No remaining step will run.'}
            </p>
          </div>
        </div>
      )}
      <details className="run-events">
        <summary>
          <Clock3 size={15} /> Run journal · {run.events.length} events
        </summary>
        {run.events.map((event, i) => (
          <div key={i}>
            <time>{new Date(event.at).toLocaleTimeString()}</time>
            <span>{event.message}</span>
          </div>
        ))}
      </details>
      <RunRecordTools
        run={run}
        busy={busy}
        exportBlocked={outcomeUnknown || accessPending}
        accessPending={accessPending}
        onAction={onAction}
      />
      {restore && !accessPending && (
        <Modal
          title="Restore the original state"
          subtitle={run.target}
          onClose={() => {
            if (!busy) setRestore(false);
          }}
        >
          <div className="modal-body">
            <p>
              This skips the remaining maintenance checkpoint and restores the boolean state
              recorded at the start. Other changes made outside Waypoint are not undone.
            </p>
            <p>
              Original {run.template === 'application-window' ? 'enabled' : 'suspended'} state:{' '}
              <strong>{String(run.original)}</strong>
            </p>
            <label className="field">
              Type <strong>{run.target}</strong> to confirm
              <input
                aria-label="Confirm restoration target"
                value={confirmation}
                disabled={blocked}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            {restoreError && <ErrorBox error={restoreError} />}
          </div>
          <footer>
            <button disabled={busy} onClick={() => setRestore(false)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={blocked || confirmation !== run.target}
              onClick={async () => {
                setRestoreError('');
                const result = await onAction('restore', { confirmation });
                if (result.ok) setRestore(false);
                else setRestoreError(result.error);
              }}
            >
              Restore and verify
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
