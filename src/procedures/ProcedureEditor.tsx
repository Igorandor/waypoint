import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  assertionDefinitions,
  observationSources,
  procedureBodySchema,
  type ProcedureBody,
  type ProcedureStep,
  type ObservationSource,
} from '../../shared/procedure';
import { ErrorBox } from '../components/ui';

const newId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 16);
export function blankProcedure(): ProcedureBody {
  return { title: '', description: '', expectedOutcome: '', tags: [], steps: [] };
}
export function ProcedureEditor({
  initial,
  editing,
  busy,
  remoteError = '',
  onSave,
  onCancel,
}: {
  initial: ProcedureBody;
  editing: boolean;
  busy: boolean;
  remoteError?: string;
  onSave: (body: ProcedureBody, note: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [body, setBody] = useState<ProcedureBody>(() => structuredClone(initial));
  const [changeNote, setChangeNote] = useState('');
  const [error, setError] = useState('');
  const [stepKind, setStepKind] = useState<ProcedureStep['kind']>('observation');
  const remoteErrorElement = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!busy && remoteError) remoteErrorElement.current?.focus();
  }, [busy, remoteError]);
  function update(index: number, step: ProcedureStep) {
    setBody((current) => ({
      ...current,
      steps: current.steps.map((item, offset) => (offset === index ? step : item)),
    }));
  }
  function add() {
    const base = { id: newId(), title: '', instruction: '' };
    const step: ProcedureStep =
      stepKind === 'observation'
        ? {
            ...base,
            kind: 'observation',
            title: 'Instance identity',
            source: 'identity',
            target: '',
          }
        : stepKind === 'checklist'
          ? {
              ...base,
              kind: 'checklist',
              title: 'Review checkpoint',
              items: [{ id: newId(), text: '', required: true }],
              requireNote: true,
              reference: '',
            }
          : {
              ...base,
              kind: 'assertion',
              title: 'Check observation',
              check: 'capture-present',
              sourceStepId: body.steps.find((item) => item.kind === 'observation')?.id ?? '',
              expected: true,
            };
    setBody((current) => ({ ...current, steps: [...current.steps, step] }));
  }
  function move(index: number, direction: -1 | 1) {
    setBody((current) => {
      const steps = [...current.steps];
      [steps[index], steps[index + direction]] = [steps[index + direction], steps[index]];
      return { ...current, steps };
    });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const validated = procedureBodySchema.safeParse(body);
    if (!validated.success) {
      setError(
        validated.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join(' '),
      );
      return;
    }
    if (editing && !changeNote.trim()) {
      setError('Describe why this version is changing.');
      return;
    }
    setError('');
    await onSave(validated.data, changeNote.trim());
  }
  return (
    <form className="procedure-editor" onSubmit={submit}>
      <fieldset disabled={busy}>
        <div className="procedure-form-grid">
          <label className="field">
            Procedure name
            <input
              required
              maxLength={100}
              value={body.title}
              onChange={(event) => setBody({ ...body, title: event.target.value })}
            />
          </label>
          <label className="field">
            Tags, separated by commas
            <input
              maxLength={200}
              value={body.tags.join(', ')}
              onChange={(event) =>
                setBody({
                  ...body,
                  tags: event.target.value
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
              placeholder="release, morning checks"
            />
          </label>
          <label className="field">
            When to use it
            <textarea
              rows={3}
              maxLength={2000}
              value={body.description}
              onChange={(event) => setBody({ ...body, description: event.target.value })}
            />
          </label>
          <label className="field">
            Expected outcome
            <textarea
              rows={3}
              maxLength={2000}
              value={body.expectedOutcome}
              onChange={(event) => setBody({ ...body, expectedOutcome: event.target.value })}
            />
          </label>
        </div>
        <div className="section-heading">
          <h3>Steps</h3>
          <span>{body.steps.length}/30</span>
        </div>
        {body.steps.map((step, index) => (
          <section className="procedure-step-editor" key={step.id}>
            <header>
              <strong>
                {index + 1}.{' '}
                {step.kind === 'observation'
                  ? 'Read from IRIS'
                  : step.kind === 'checklist'
                    ? 'Manual checkpoint'
                    : 'Check recorded result'}
              </strong>
              <div className="inline-actions">
                <button
                  type="button"
                  disabled={index === 0}
                  aria-label={`Move step ${index + 1} up`}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  type="button"
                  disabled={index === body.steps.length - 1}
                  aria-label={`Move step ${index + 1} down`}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={15} />
                </button>
                <button
                  type="button"
                  aria-label={`Remove step ${index + 1}`}
                  onClick={() =>
                    setBody({ ...body, steps: body.steps.filter((_, offset) => offset !== index) })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </header>
            <label className="field">
              Step title
              <input
                required
                maxLength={100}
                value={step.title}
                onChange={(event) => update(index, { ...step, title: event.target.value })}
              />
            </label>
            <label className="field">
              Instructions
              <textarea
                rows={2}
                maxLength={2000}
                value={step.instruction}
                onChange={(event) => update(index, { ...step, instruction: event.target.value })}
              />
            </label>
            {step.kind === 'observation' && (
              <>
                <label className="field">
                  Source
                  <select
                    value={step.source}
                    onChange={(event) =>
                      update(index, {
                        ...step,
                        source: event.target.value as ObservationSource,
                        target: '',
                      })
                    }
                  >
                    {Object.entries(observationSources).map(([id, source]) => (
                      <option key={id} value={id}>
                        {source.title}
                      </option>
                    ))}
                  </select>
                </label>
                {observationSources[step.source].target !== 'none' && (
                  <label className="field">
                    {observationSources[step.source].target === 'task'
                      ? 'Task ID'
                      : 'Application path'}
                    <input
                      required
                      maxLength={256}
                      value={step.target}
                      onChange={(event) => update(index, { ...step, target: event.target.value })}
                      placeholder={
                        observationSources[step.source].target === 'task' ? '7' : '/csp/myapp'
                      }
                    />
                  </label>
                )}
                <small>
                  Each read uses the signed-in account. Inventory and log captures contain at most
                  100 rows; task history contains at most 50.
                </small>
              </>
            )}
            {step.kind === 'checklist' && (
              <>
                <div className="checkpoint-items">
                  {step.items.map((item, itemIndex) => (
                    <div className="checkpoint-item-editor" key={item.id}>
                      <input
                        aria-label={`Checklist item ${itemIndex + 1}`}
                        required
                        maxLength={100}
                        value={item.text}
                        onChange={(event) =>
                          update(index, {
                            ...step,
                            items: step.items.map((entry, offset) =>
                              offset === itemIndex ? { ...entry, text: event.target.value } : entry,
                            ),
                          })
                        }
                      />
                      <label>
                        <input
                          type="checkbox"
                          checked={item.required}
                          onChange={(event) =>
                            update(index, {
                              ...step,
                              items: step.items.map((entry, offset) =>
                                offset === itemIndex
                                  ? { ...entry, required: event.target.checked }
                                  : entry,
                              ),
                            })
                          }
                        />{' '}
                        Required
                      </label>
                      <button
                        type="button"
                        disabled={step.items.length === 1}
                        aria-label={`Remove checklist item ${itemIndex + 1}`}
                        onClick={() =>
                          update(index, {
                            ...step,
                            items: step.items.filter((_, offset) => offset !== itemIndex),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={step.items.length >= 12}
                  onClick={() =>
                    update(index, {
                      ...step,
                      items: [...step.items, { id: newId(), text: '', required: true }],
                    })
                  }
                >
                  <Plus size={14} /> Add checklist item
                </button>
                <label className="check-option">
                  <input
                    type="checkbox"
                    checked={step.requireNote}
                    onChange={(event) =>
                      update(index, { ...step, requireNote: event.target.checked })
                    }
                  />{' '}
                  Require an operator note
                </label>
                <label className="field">
                  Reference link (optional HTTPS)
                  <input
                    type="url"
                    maxLength={1000}
                    value={step.reference}
                    onChange={(event) => update(index, { ...step, reference: event.target.value })}
                  />
                </label>
              </>
            )}
            {step.kind === 'assertion' && (
              <>
                <label className="field">
                  Observation to check
                  <select
                    required
                    value={step.sourceStepId}
                    onChange={(event) =>
                      update(index, { ...step, sourceStepId: event.target.value })
                    }
                  >
                    <option value="">Choose an earlier observation</option>
                    {body.steps
                      .slice(0, index)
                      .filter((item) => item.kind === 'observation')
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  Check
                  <select
                    value={step.check}
                    onChange={(event) => {
                      const check = event.target.value as typeof step.check;
                      update(index, {
                        ...step,
                        check,
                        threshold: assertionDefinitions[check].threshold ? 20 : undefined,
                      });
                    }}
                  >
                    {Object.entries(assertionDefinitions).map(([key, value]) => (
                      <option value={key} key={key}>
                        {value.title}
                      </option>
                    ))}
                  </select>
                </label>
                {assertionDefinitions[step.check].threshold && (
                  <label className="field">
                    Minimum available (%)
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={step.threshold ?? 20}
                      onChange={(event) =>
                        update(index, { ...step, threshold: Number(event.target.value) })
                      }
                    />
                  </label>
                )}
                <label className="field">
                  Expected value
                  <select
                    value={String(step.expected)}
                    onChange={(event) =>
                      update(index, { ...step, expected: event.target.value === 'true' })
                    }
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                </label>
                <small>
                  Missing or incompatible data is unknown, never a pass. This checks the recorded
                  observation; it sends no write.
                </small>
              </>
            )}
          </section>
        ))}
        <div className="procedure-add-row">
          <select
            aria-label="New step type"
            value={stepKind}
            onChange={(event) => setStepKind(event.target.value as ProcedureStep['kind'])}
          >
            <option value="observation">Read from IRIS</option>
            <option value="checklist">Manual checkpoint</option>
            <option value="assertion">Check recorded result</option>
          </select>
          <button type="button" disabled={body.steps.length >= 30} onClick={add}>
            <Plus size={16} /> Add step
          </button>
        </div>
        {editing && (
          <label className="field">
            Version change note
            <textarea
              required
              rows={2}
              maxLength={1000}
              value={changeNote}
              onChange={(event) => setChangeNote(event.target.value)}
            />
          </label>
        )}
        {error && <ErrorBox error={error} />}
        {remoteError && (
          <div
            ref={remoteErrorElement}
            className="error-box"
            role="alert"
            aria-label="Procedure save error"
            tabIndex={-1}
          >
            {remoteError}
          </div>
        )}
        <footer>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary" type="submit">
            {busy ? 'Saving…' : editing ? 'Save new version' : 'Create procedure'}
          </button>
        </footer>
      </fieldset>
    </form>
  );
}
