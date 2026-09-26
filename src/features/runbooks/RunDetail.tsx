import { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  RotateCcw,
  Square,
} from 'lucide-react';
import { nextStep, writeStep, type Run } from '../../../shared/runbook';
import { download } from '../../api';
import { Badge, ErrorBox, Modal } from '../../components/ui';

export function RunDetail({
  run,
  busy,
  onAction,
}: {
  run: Run;
  busy: boolean;
  onAction: (action: string, body?: Record<string, string>) => Promise<boolean>;
}) {
  const [note, setNote] = useState(''),
    [restore, setRestore] = useState(false),
    [confirmation, setConfirmation] = useState('');
  const index = nextStep(run),
    current = run.steps[index];
  const label =
    current?.kind === 'checkpoint'
      ? 'Record note and continue'
      : current && writeStep(current.kind)
        ? current.title
        : 'Run next step';
  return (
    <section className="run-detail panel">
      <div className="run-heading">
        <div>
          <span className="eyebrow">
            {run.instance} · {run.id.slice(0, 8)}
          </span>
          <h2>{run.title}</h2>
          <code>{run.target}</code>
        </div>
        <button onClick={() => download('relay-run-' + run.id + '.json', run)}>
          <Download size={15} /> Export report
        </button>
      </div>
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
            disabled={busy}
            onClick={() => {
              setRestore(true);
              setConfirmation('');
            }}
          >
            Restore now
          </button>
        </div>
      )}
      <ol className="run-timeline">
        {run.steps.map((step, i) => (
          <li className={'step-' + step.status} key={step.kind}>
            <div className="step-line">
              <span className="step-number">
                {step.status === 'done' ? (
                  <Check size={16} />
                ) : step.status === 'uncertain' || step.status === 'failed' ? (
                  <CircleAlert size={16} />
                ) : (
                  i + 1
                )}
              </span>
            </div>
            <details open={i === index || step.status === 'uncertain' || step.status === 'failed'}>
              <summary>
                <div>
                  <strong>{step.title}</strong>
                  <small>
                    {step.finishedAt
                      ? new Date(step.finishedAt).toLocaleTimeString()
                      : step.status === 'pending'
                        ? 'Not started'
                        : step.status === 'running'
                          ? 'Waiting for IRIS'
                          : step.status === 'skipped'
                            ? 'Bypassed'
                            : 'Review needed'}
                  </small>
                </div>
                <Badge
                  tone={
                    step.status === 'done'
                      ? 'good'
                      : step.status === 'failed' || step.status === 'uncertain'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {step.status === 'done' ? 'Recorded' : step.status}
                </Badge>
                <ChevronRight size={15} />
              </summary>
              <div className="step-body">
                <p>{step.description}</p>
                {step.error && <ErrorBox error={step.error} />}{' '}
                {step.note && <blockquote>{step.note}</blockquote>}
                {step.evidence !== undefined && (
                  <>
                    <span className="evidence-label">Recorded evidence</span>
                    <pre className="run-evidence">{JSON.stringify(step.evidence, null, 2)}</pre>
                  </>
                )}
                {step.attempts > 0 && (
                  <small className="muted">
                    {step.attempts} attempt{step.attempts === 1 ? '' : 's'} recorded. Writes are
                    never automatically replayed.
                  </small>
                )}
              </div>
            </details>
          </li>
        ))}
      </ol>
      {run.status === 'active' && current && (
        <div className="run-control">
          {current.kind === 'checkpoint' && (
            <label className="field">
              Maintenance note
              <textarea
                rows={3}
                maxLength={2000}
                value={note}
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
                disabled={busy}
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
                  busy ||
                  current.status === 'running' ||
                  (current.kind === 'checkpoint' && !note.trim())
                }
                onClick={async () => {
                  if (await onAction('next', { note })) setNote('');
                }}
              >
                {busy
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
              disabled={busy || current.status === 'running'}
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
                ? 'Review the recorded and bypassed steps, including source evidence, for the actual operational outcome.'
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
      {restore && (
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
              recorded at the start. Other changes made outside Relay are not undone.
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
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
          </div>
          <footer>
            <button disabled={busy} onClick={() => setRestore(false)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy || confirmation !== run.target}
              onClick={async () => {
                if (await onAction('restore', { confirmation })) setRestore(false);
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
