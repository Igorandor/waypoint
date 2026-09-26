import { useState } from 'react';
import { ArrowRight, Eye, Wrench } from 'lucide-react';
import { templates, type TemplateId, type Run } from '../../../shared/runbook';
import { useData } from '../../hooks';
import { request } from '../../api';
import { Badge, ErrorBox, Modal } from '../../components/ui';
import {
  observationSteps,
  defaultObservation,
  type ObservationKind,
} from '../../../shared/observation-plan';

export function CreateRun({
  template,
  onClose,
  onCreated,
}: {
  template: TemplateId;
  onClose: () => void;
  onCreated: (run: Run) => void;
}) {
  const definition = templates[template];
  const [sources, setSources] = useState<ObservationKind[]>([...defaultObservation]);
  const [planTitle, setPlanTitle] = useState('');
  const plan =
    template === 'observe'
      ? sources.map((kind) => ({ kind, ...observationSteps[kind] }))
      : definition.steps;
  const data = useData<any[]>(
    definition.target === 'app' ? '/v2/web-apps' : definition.target === 'task' ? '/v2/tasks' : '',
  );
  const [target, setTarget] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const options = (data.data ?? []).filter(
    (row) =>
      definition.target !== 'app' ||
      (row.Name !== '/' &&
        row.Name !== '/api' &&
        !/^\/(api\/(admin|waypoint|relay)|csp\/sys)(\/|$)/i.test(row.Name)),
  );
  async function create() {
    setBusy(true);
    setError('');
    try {
      onCreated(
        await request('runs', {
          template,
          target,
          confirmation,
          ...(template === 'observe' ? { observation: { sources, title: planTitle } } : {}),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={definition.title}
      subtitle="Review the plan before creating a run"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-body">
        <Badge tone={definition.target === 'none' ? 'good' : 'warning'}>
          {definition.target === 'none' ? (
            <>
              <Eye size={13} /> Reads only
            </>
          ) : (
            <>
              <Wrench size={13} /> Changes configuration
            </>
          )}
        </Badge>
        <p>{definition.description}</p>
        {template === 'observe' && (
          <fieldset>
            <legend>Build your observation plan</legend>
            <label className="field">
              Plan title (optional)
              <input
                maxLength={80}
                value={planTitle}
                onChange={(e) => setPlanTitle(e.target.value)}
                placeholder="Before the weekend deployment"
              />
            </label>
            <p>
              Choose up to eight fixed read sources. They run one at a time in the order selected,
              only when you continue.
            </p>
            {(Object.keys(observationSteps) as ObservationKind[]).map((kind) => (
              <label className="observation-choice" key={kind}>
                <input
                  type="checkbox"
                  checked={sources.includes(kind)}
                  onChange={(e) =>
                    setSources(
                      e.target.checked
                        ? [...sources, kind]
                        : sources.filter((source) => source !== kind),
                    )
                  }
                />
                {observationSteps[kind].title}
              </label>
            ))}
          </fieldset>
        )}
        {definition.target !== 'none' && (
          <>
            <label className="field">
              {definition.target === 'app' ? 'Application route' : 'Scheduled task'}
              <select
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setConfirmation('');
                }}
                disabled={data.loading}
              >
                <option value="">{data.loading ? 'Reading IRIS…' : 'Choose a target…'}</option>
                {options.map((row) => (
                  <option
                    key={String(definition.target === 'app' ? row.Name : row.Id)}
                    value={String(definition.target === 'app' ? row.Name : row.Id)}
                  >
                    {definition.target === 'app' ? row.Name : `${row.Name} · #${row.Id}`}
                  </option>
                ))}
              </select>
            </label>
            {data.error && <ErrorBox error={data.error} retry={data.refresh} />}
            <p className="scope-note">
              Up to 250 native records are loaded. Management routes are excluded from application
              windows.
            </p>
          </>
        )}
        <ol className="plan-preview">
          {plan.map((s, i) => (
            <li key={s.kind}>
              <span>{i + 1}</span>
              <div>
                <strong>{s.title}</strong>
                <p>{s.description}</p>
              </div>
            </li>
          ))}
        </ol>
        {definition.target !== 'none' && target && (
          <label className="field">
            Type <strong>{target}</strong> to confirm the target
            <input
              aria-label="Confirm run target"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}
        <div className="notice">
          Creating a run only saves this plan. Each step is executed separately after you choose to
          continue.{' '}
          {definition.target !== 'none' && 'The original state is captured by the first step.'}
        </div>
        {error && <ErrorBox error={error} />}
      </div>
      <footer>
        <button disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={
            busy ||
            !plan.length ||
            (definition.target !== 'none' && (!target || confirmation !== target))
          }
          onClick={() => void create()}
        >
          {busy ? 'Saving plan…' : 'Create run'}
          <ArrowRight size={16} />
        </button>
      </footer>
    </Modal>
  );
}
