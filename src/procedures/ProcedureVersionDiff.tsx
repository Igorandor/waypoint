import { useState } from 'react';
import type { ProcedureVersion } from '../../shared/procedure';
import {
  compareProcedureVersions,
  displayProcedureValue,
  type ProcedureFieldChange,
} from '../../shared/procedure-diff';
import { download } from '../api';
import { Badge } from '../components/ui';
export function ProcedureVersionDiff({ versions }: { versions: ProcedureVersion[] }) {
  const [beforeNumber, setBeforeNumber] = useState(
    versions.length > 1 ? versions[versions.length - 2].number : versions[0].number,
  );
  const [afterNumber, setAfterNumber] = useState(versions.at(-1)!.number);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const before = versions.find((version) => version.number === beforeNumber);
  const after = versions.find((version) => version.number === afterNumber);
  if (!before || !after) return null;
  const comparison = compareProcedureVersions(before, after);
  const visible = comparison.steps.filter((step) => showUnchanged || step.kind !== 'unchanged');
  return (
    <section className="procedure-version-comparison">
      <h3>Compare immutable versions</h3>
      <p>
        Steps are matched by their stored identifier. Recreated steps appear as additions and
        removals; their identity is not guessed from similar text.
      </p>
      <div className="planner-thresholds">
        <label className="field">
          Before
          <select value={beforeNumber} onChange={(event) => setBeforeNumber(+event.target.value)}>
            {versions.map((version) => (
              <option value={version.number} key={version.number}>
                Version {version.number} · {new Date(version.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          After
          <select value={afterNumber} onChange={(event) => setAfterNumber(+event.target.value)}>
            {versions.map((version) => (
              <option value={version.number} key={version.number}>
                Version {version.number} · {new Date(version.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
        </label>
      </div>
      <dl className="dossier-facts">
        <div>
          <dt>Added steps</dt>
          <dd>{comparison.addedSteps}</dd>
        </div>
        <div>
          <dt>Removed steps</dt>
          <dd>{comparison.removedSteps}</dd>
        </div>
        <div>
          <dt>Changed definitions</dt>
          <dd>{comparison.changedSteps}</dd>
        </div>
        <div>
          <dt>Position changes</dt>
          <dd>{comparison.movedSteps}</dd>
        </div>
      </dl>
      <div className="version-change-notes">
        <article>
          <h4>Before change note</h4>
          <p>{before.changeNote}</p>
          <small>
            Saved by {before.createdBy} at {new Date(before.createdAt).toLocaleString()}
          </small>
        </article>
        <article>
          <h4>After change note</h4>
          <p>{after.changeNote}</p>
          <small>
            Saved by {after.createdBy} at {new Date(after.createdAt).toLocaleString()}
          </small>
        </article>
      </div>
      {comparison.metadata.length > 0 && (
        <>
          <h4>Procedure metadata</h4>
          <ChangedFields changes={comparison.metadata} />
        </>
      )}
      <label className="check-option">
        <input
          type="checkbox"
          checked={showUnchanged}
          onChange={(event) => setShowUnchanged(event.target.checked)}
        />
        Show unchanged steps
      </label>
      {visible.map((step) => (
        <article className="version-step-change" key={step.id}>
          <div className="section-heading">
            <h4>{step.title}</h4>
            <Badge>{step.kind}</Badge>
          </div>
          <p>
            Position {step.beforePosition ?? '—'} → {step.afterPosition ?? '—'}
          </p>
          {step.dependencyChanged && (
            <p className="muted">
              The evidence source, target or check dependency changed. Review execution order and
              expected results.
            </p>
          )}
          {step.fields.length > 0 &&
            (step.kind === 'added' || step.kind === 'removed' ? (
              <>
                <h5>{step.kind === 'added' ? 'Added definition' : 'Removed definition'}</h5>
                <dl className="version-step-definition">
                  {step.fields.map((field) => (
                    <div key={field.field}>
                      <dt>{fieldLabels[field.field] ?? field.field}</dt>
                      <dd>
                        <pre>
                          {displayProcedureValue(
                            step.kind === 'added' ? field.after : field.before,
                          )}
                        </pre>
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <ChangedFields changes={step.fields} />
            ))}
        </article>
      ))}
      {!comparison.metadata.length && !visible.length && (
        <p>No differences are shown for these versions.</p>
      )}
      <button
        onClick={() =>
          download(
            'waypoint-procedure-v' + before.number + '-v' + after.number + '-comparison.json',
            { format: 'waypoint-procedure-comparison-1', ...comparison },
          )
        }
      >
        Export version comparison
      </button>
      <p className="muted">
        Existing runs keep their original procedure version. This comparison does not alter a saved
        definition or any run.
      </p>
    </section>
  );
}
const fieldLabels: Record<string, string> = {
  title: 'Title',
  description: 'When to use it',
  expectedOutcome: 'Expected outcome',
  tags: 'Tags',
  kind: 'Step type',
  instruction: 'Instructions',
  source: 'Observation source',
  target: 'Target',
  items: 'Checklist items',
  requireNote: 'Operator note required',
  reference: 'Reference',
  sourceStepId: 'Observation step ID',
  check: 'Check',
  expected: 'Expected value',
  threshold: 'Minimum available (%)',
};
function ChangedFields({ changes }: { changes: ProcedureFieldChange[] }) {
  return (
    <div className="table-wrap">
      <table className="version-diff-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.field}>
              <th>{fieldLabels[change.field] ?? change.field}</th>
              <td>
                <pre>{displayProcedureValue(change.before)}</pre>
              </td>
              <td>
                <pre>{displayProcedureValue(change.after)}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
