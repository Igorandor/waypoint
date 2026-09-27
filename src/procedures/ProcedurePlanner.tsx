import { useEffect, useState } from 'react';
import {
  analyzeProcedure,
  buildSpecializedProcedure,
  type ProcedurePurpose,
  type ProcedureSetup,
} from '../../shared/procedure-planning';
import type { ProcedureBody } from '../../shared/procedure';
import { iris } from '../api';
import { ErrorBox } from '../components/ui';

const purposeLabels: Record<ProcedurePurpose, string> = {
  capacity: 'Capacity readiness',
  application: 'Application change readiness',
  task: 'Task execution readiness',
  shift: 'Operator handover observations',
};
export function ProcedurePlanner({
  onCreate,
  onCancel,
}: {
  onCreate: (body: ProcedureBody) => void;
  onCancel: () => void;
}) {
  const [setup, setSetup] = useState<ProcedureSetup>({
    purpose: 'capacity',
    target: '',
    title: 'Capacity readiness',
    minimumMemory: 20,
    minimumDisk: 15,
    expectedEnabled: true,
    includeLogs: true,
    reference: '',
  });
  const [targets, setTargets] = useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ProcedureBody>();
  useEffect(() => {
    let current = true;
    setTargets([]);
    setError('');
    if (setup.purpose !== 'task' && setup.purpose !== 'application') {
      setLoading(false);
      return;
    }
    setLoading(true);
    const task = setup.purpose === 'task';
    void iris(task ? '/v2/tasks' : '/v2/web-apps', task ? { maxRows: '1000' } : {})
      .then((response) => {
        if (!current) return;
        if (!Array.isArray(response.data)) throw new Error('The target inventory is not a list.');
        setTargets(
          response.data.map((row: any) => ({
            id: String(task ? row.Id : row.Name),
            title: task ? `${row.Name} (#${row.Id})` : String(row.Name),
          })),
        );
      })
      .catch((cause) => {
        if (current) setError((cause as Error).message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [setup.purpose]);
  function change<K extends keyof ProcedureSetup>(key: K, value: ProcedureSetup[K]) {
    setSetup({ ...setup, [key]: value });
    setPreview(undefined);
  }
  function prepare() {
    setError('');
    try {
      setPreview(buildSpecializedProcedure(setup));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div className="procedure-planner">
      <p>
        Choose a workflow, its target and capacity requirements. Review the resulting steps in the
        editor before saving a version.
      </p>
      {error && <ErrorBox error={error} />}
      <label className="field">
        Workflow
        <select
          value={setup.purpose}
          onChange={(event) => {
            const purpose = event.target.value as ProcedurePurpose;
            setSetup({ ...setup, purpose, target: '', title: purposeLabels[purpose] });
            setPreview(undefined);
          }}
        >
          {Object.entries(purposeLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Procedure title
        <input
          maxLength={100}
          value={setup.title}
          onChange={(event) => change('title', event.target.value)}
        />
      </label>
      {['application', 'task'].includes(setup.purpose) && (
        <label className="field">
          Native target
          <select
            disabled={loading}
            value={setup.target}
            onChange={(event) => change('target', event.target.value)}
          >
            <option value="">{loading ? 'Reading inventory…' : 'Choose a target'}</option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {setup.purpose === 'application' && (
        <label className="field">
          Expected application state
          <select
            value={String(setup.expectedEnabled)}
            onChange={(event) => change('expectedEnabled', event.target.value === 'true')}
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>
      )}
      <div className="planner-thresholds">
        <label className="field">
          Minimum available memory (%)
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={setup.minimumMemory}
            onChange={(event) => change('minimumMemory', Number(event.target.value))}
          />
        </label>
        <label className="field">
          Minimum free disk (%)
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={setup.minimumDisk}
            onChange={(event) => change('minimumDisk', Number(event.target.value))}
          />
        </label>
      </div>
      <p className="muted">
        The extension reports host-visible memory and the filesystem containing the IRIS manager
        directory. These thresholds do not describe a container memory limit.
      </p>
      <label className="check-option">
        <input
          type="checkbox"
          checked={setup.includeLogs}
          onChange={(event) => change('includeLogs', event.target.checked)}
        />
        Include recent message and alert observations
      </label>
      <label className="field">
        Optional procedure reference
        <input
          type="url"
          value={setup.reference}
          maxLength={1000}
          onChange={(event) => change('reference', event.target.value)}
          placeholder="https://your-documentation.example/procedure"
        />
      </label>
      <div className="procedure-actions">
        <button
          onClick={prepare}
          disabled={
            loading ||
            !setup.title.trim() ||
            (['application', 'task'].includes(setup.purpose) && !setup.target)
          }
        >
          Preview steps
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
      {preview && (
        <>
          <ProcedureReadiness body={preview} />
          <ol className="procedure-preview">
            {preview.steps.map((step) => (
              <li key={step.id}>
                <strong>{step.title}</strong>
                <span>{step.kind}</span>
                <p>{step.instruction}</p>
              </li>
            ))}
          </ol>
          <button className="primary" onClick={() => onCreate(preview)}>
            Open in procedure editor
          </button>
        </>
      )}
    </div>
  );
}
export function ProcedureReadiness({ body }: { body: ProcedureBody }) {
  const analysis = analyzeProcedure(body);
  return (
    <section className="procedure-readiness">
      <h3>Plan review</h3>
      <dl className="dossier-facts">
        <div>
          <dt>Native reads</dt>
          <dd>{analysis.observations}</dd>
        </div>
        <div>
          <dt>Recorded-result checks</dt>
          <dd>{analysis.assertions}</dd>
        </div>
        <div>
          <dt>Manual checkpoints</dt>
          <dd>{analysis.checklists}</dd>
        </div>
        <div>
          <dt>Required checklist items</dt>
          <dd>{analysis.requiredItems}</dd>
        </div>
      </dl>
      <p>
        <strong>Current native privileges required for reports:</strong>{' '}
        {analysis.privileges.join(', ')}.
      </p>
      {analysis.targets.length > 0 && (
        <p>
          <strong>Targets:</strong> {analysis.targets.join(', ')}
        </p>
      )}
      <details>
        <summary>Sources and dependencies</summary>
        <ul>
          {analysis.nativeSources.map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ul>
        {analysis.dependencies.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Recorded source</th>
                <th>Dependent check</th>
              </tr>
            </thead>
            <tbody>
              {analysis.dependencies.map((item) => (
                <tr key={item.check}>
                  <td>{item.sourceTitle}</td>
                  <td>{item.checkTitle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
      {analysis.findings.map((finding, index) => (
        <article className={'plan-finding ' + finding.kind} key={index}>
          <h4>{finding.title}</h4>
          <p>{finding.detail}</p>
          {finding.stepIds.length > 0 && (
            <small>
              Steps:{' '}
              {finding.stepIds
                .map((id) => body.steps.find((step) => step.id === id)?.title ?? id)
                .join(', ')}
            </small>
          )}
        </article>
      ))}
      <p className="muted">
        Creating a run saves an immutable plan. Each observation is read only when its step is
        executed. Failed or unknown checks remain evidence for the operator; they do not perform
        native rollback.
      </p>
    </section>
  );
}
