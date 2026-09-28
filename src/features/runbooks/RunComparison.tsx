import { useState } from 'react';
import { ArrowRight, Download } from 'lucide-react';
import type { RunSummary } from '../../../shared/runbook';
import type { RunComparison as Comparison } from '../../../shared/run-records';
import { download, request } from '../../api';
import { Badge, ErrorBox, Modal } from '../../components/ui';
import { Evidence } from '../../components/DataView';

export function RunComparison({
  runs,
  initial,
  onClose,
}: {
  runs: RunSummary[];
  initial?: string;
  onClose: () => void;
}) {
  const [before, setBefore] = useState(initial ?? runs[1]?.id ?? '');
  const [after, setAfter] = useState(runs.find((run) => run.id !== before)?.id ?? '');
  const [result, setResult] = useState<Comparison>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showUnchanged, setShowUnchanged] = useState(false);
  const collectionBoundaries =
    result?.sources.filter(
      (source) => source.beforeCollectionNotice || source.afterCollectionNotice,
    ).length ?? 0;
  async function compare() {
    setBusy(true);
    setError('');
    setResult(undefined);
    try {
      setResult(await request('runs/compare', { before, after }));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Compare recorded observations"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-body run-comparison">
        <div className="run-comparison-selectors">
          <label className="field">
            Before
            <select
              value={before}
              disabled={busy}
              onChange={(event) => {
                setBefore(event.target.value);
                setResult(undefined);
                setError('');
              }}
            >
              <option value="">Choose a run</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.title} · {new Date(run.createdAt).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <ArrowRight size={20} />
          <label className="field">
            After
            <select
              value={after}
              disabled={busy}
              onChange={(event) => {
                setAfter(event.target.value);
                setResult(undefined);
                setError('');
              }}
            >
              <option value="">Choose a run</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.title} · {new Date(run.createdAt).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>
          Only matching source types and targets are compared. Failed reads and sources missing from
          a plan are not treated as deleted data.
        </p>
        <button
          className="primary"
          disabled={busy || !before || !after || before === after}
          onClick={() => void compare()}
        >
          {busy ? 'Comparing…' : 'Compare runs'}
        </button>
        {error && <ErrorBox error={error} />}
        {result && (
          <>
            <div className="comparison-totals">
              <Badge>{result.totals.changed} changed fields</Badge>
              <Badge>{result.totals.unchanged} unchanged</Badge>
              <Badge
                tone={result.totals.unavailable + result.totals.missing ? 'warning' : 'neutral'}
              >
                {result.totals.unavailable + result.totals.missing} incomplete sources
              </Badge>
            </div>
            {collectionBoundaries > 0 && (
              <p className="comparison-warning collection-boundary-summary" role="status">
                {collectionBoundaries} source{collectionBoundaries === 1 ? '' : 's'} with bounded or
                unrecorded collection limits. Matching recorded values do not establish complete
                inventories or histories. Use Show sources without differences to inspect their
                limits.
              </p>
            )}
            <label className="check-option">
              <input
                type="checkbox"
                checked={showUnchanged}
                onChange={(event) => setShowUnchanged(event.target.checked)}
              />{' '}
              Show sources without differences
            </label>
            {result.sources
              .filter(
                (source) => showUnchanged || source.changes.length || source.state !== 'compared',
              )
              .map((source) => (
                <section className="source-comparison" key={source.key}>
                  <div className="section-heading">
                    <h3>{source.title}</h3>
                    <Badge tone={source.state === 'compared' ? 'neutral' : 'warning'}>
                      {source.state.replaceAll('-', ' ')}
                    </Badge>
                  </div>
                  <small>
                    {source.beforeAt
                      ? new Date(source.beforeAt).toLocaleString()
                      : 'No earlier capture'}{' '}
                    →{' '}
                    {source.afterAt
                      ? new Date(source.afterAt).toLocaleString()
                      : 'No later capture'}
                  </small>
                  {(source.beforeCollectionNotice || source.afterCollectionNotice) && (
                    <div className="comparison-collection-limits">
                      {source.beforeCollectionNotice && (
                        <p>
                          <strong>Before: </strong>
                          {source.beforeCollectionNotice}
                        </p>
                      )}
                      {source.afterCollectionNotice && (
                        <p>
                          <strong>After: </strong>
                          {source.afterCollectionNotice}
                        </p>
                      )}
                    </div>
                  )}
                  <p>{source.note}</p>
                  {source.truncated && (
                    <p className="comparison-warning">
                      This comparison reached a data limit. Inspect the original records before
                      concluding that no other values changed.
                    </p>
                  )}
                  {source.changes.length > 0 && (
                    <div className="comparison-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Field</th>
                            <th>Change</th>
                            <th>Before</th>
                            <th>After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {source.changes.map((change) => (
                            <tr key={change.path}>
                              <th>{change.path}</th>
                              <td>
                                {change.change === 'added'
                                  ? 'Only in after'
                                  : change.change === 'removed'
                                    ? 'Only in before'
                                    : 'Changed'}
                              </td>
                              <td>
                                <Evidence value={change.before} />
                              </td>
                              <td>
                                <Evidence value={change.after} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}
            <button onClick={() => download('waypoint-run-comparison.json', result)}>
              <Download size={15} /> Export comparison
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
