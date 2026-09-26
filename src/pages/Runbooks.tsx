import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  ClipboardList,
  FileCheck2,
  RefreshCw,
  RotateCcw,
  Search,
  Timer,
  Workflow,
} from 'lucide-react';
import { templates, type Run, type RunSummary, type TemplateId } from '../../shared/runbook';
import { request } from '../api';
import { Badge, ErrorBox, Loading, PageHeader } from '../components/ui';
import { CreateRun } from '../features/runbooks/CreateRun';
import { RunDetail } from '../features/runbooks/RunDetail';

export function Runbooks() {
  const [runs, setRuns] = useState<RunSummary[]>([]),
    [run, setRun] = useState<Run>(),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [template, setTemplate] = useState<TemplateId>(),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all');
  async function refresh() {
    setError('');
    setLoading(true);
    try {
      const list = await request('runs');
      setRuns(list);
      if (run) setRun(await request('runs/' + run.id));
      else if (list.length) setRun(await request('runs/' + list[0].id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function select(id: string) {
    setBusy(true);
    setError('');
    try {
      setRun(await request('runs/' + id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(action: string, body: Record<string, string> = {}) {
    if (!run) return false;
    setBusy(true);
    setError('');
    try {
      setRun(await request('runs/' + run.id + '/' + action, body));
      setRuns(await request('runs'));
      return true;
    } catch (e) {
      setError(
        (e as Error).message +
          ' Refresh this run before retrying if the connection was interrupted.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const visible = runs.filter(
    (r) =>
      (filter === 'all' || (filter === 'active' ? r.status === 'active' : r.status !== 'active')) &&
      (r.title + ' ' + r.target).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title="Operations desk"
        description="Observation reports and application or task maintenance windows."
      >
        <button disabled={loading || busy} onClick={() => void refresh()}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh runs
        </button>
      </PageHeader>
      <div className="runbook-stats">
        <span>
          <Workflow size={17} />
          <strong>{runs.filter((r) => r.status === 'active').length}</strong> active runs
        </span>
        <span>
          <RotateCcw size={17} />
          <strong>{runs.filter((r) => r.needsRestore).length}</strong> awaiting restoration
        </span>
        <span>
          <FileCheck2 size={17} />
          <strong>{runs.filter((r) => r.status === 'completed').length}</strong> completed
        </span>
        <span className="persist-note">History for this account</span>
      </div>
      <div className="template-heading">
        <h2>New run</h2>
      </div>
      <div className="template-grid">
        {(Object.entries(templates) as Array<[TemplateId, (typeof templates)[TemplateId]]>).map(
          ([id, t], i) => (
            <button
              key={id}
              className="template-card"
              disabled={busy}
              onClick={() => setTemplate(id)}
            >
              <span className="template-symbol">
                {i === 0 ? (
                  <Activity size={22} />
                ) : i === 1 ? (
                  <ClipboardList size={22} />
                ) : (
                  <Timer size={22} />
                )}
              </span>
              <div>
                <span className="eyebrow">
                  {t.target === 'none' ? 'Observation' : 'Maintenance'} · {t.steps.length} steps
                </span>
                <h3>{t.title}</h3>
                <p>{t.description}</p>
              </div>
              <ArrowUpRight size={17} />
            </button>
          ),
        )}
      </div>
      {error && <ErrorBox error={error} />}
      <div className="runs-workbench">
        <section className="panel runs-list" aria-label="Saved runs">
          <div className="section-heading">
            <h2>Run history</h2>
            <Badge>{runs.length}</Badge>
          </div>
          <div className="runs-filters">
            <div className="search-field">
              <Search size={16} />
              <input
                aria-label="Find a run"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a run…"
              />
            </div>
            <select
              aria-label="Run status filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All runs</option>
              <option value="active">Active</option>
              <option value="closed">Completed or stopped</option>
            </select>
          </div>
          {loading && !runs.length ? (
            <Loading />
          ) : (
            <div className="run-options">
              {visible.map((r) => (
                <button
                  key={r.id}
                  className={run?.id === r.id ? 'selected' : ''}
                  disabled={busy}
                  onClick={() => void select(r.id)}
                >
                  <span className="run-option-top">
                    <Badge
                      tone={
                        r.needsRestore || r.attention
                          ? 'warning'
                          : r.status === 'completed'
                            ? 'good'
                            : 'neutral'
                      }
                    >
                      {r.needsRestore
                        ? 'Restore pending'
                        : r.attention
                          ? 'Needs attention'
                          : r.status}
                    </Badge>
                    <small>
                      {r.completed}/{r.total}
                    </small>
                  </span>
                  <strong>{r.title}</strong>
                  <code>{r.target}</code>
                  <small>{new Date(r.updatedAt).toLocaleString()}</small>
                </button>
              ))}
              {!visible.length && (
                <p className="padded muted">
                  No matching runs. Choose a runbook above to create a plan.
                </p>
              )}
            </div>
          )}
        </section>
        {run ? (
          <RunDetail key={run.id} run={run} busy={busy} onAction={action} />
        ) : (
          <section className="panel run-placeholder">
            <h2>No run selected</h2>
            <p>Select a saved run from the history, or create an observation report.</p>
            <button className="primary" onClick={() => setTemplate('observe')}>
              Create observation report <ArrowUpRight size={16} />
            </button>
          </section>
        )}
      </div>
      <p className="runbook-footnote">
        Maintenance windows require manual restoration. Closing this page leaves the application or
        task in its current state.
      </p>
      {template && (
        <CreateRun
          template={template}
          onClose={() => setTemplate(undefined)}
          onCreated={(created) => {
            setRun(created);
            setTemplate(undefined);
            void request('runs')
              .then(setRuns)
              .catch((e) => setError(e.message));
          }}
        />
      )}
    </>
  );
}
