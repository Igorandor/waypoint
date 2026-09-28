import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Plus,
  ClipboardList,
  FileCheck2,
  RefreshCw,
  RotateCcw,
  Search,
  Timer,
  Workflow,
} from 'lucide-react';
import { templates, type Run, type RunSummary, type TemplateId } from '../../shared/runbook';
import { request, RequestError } from '../api';
import { Badge, ErrorBox, Loading, Modal, PageHeader } from '../components/ui';
import { CreateRun } from '../features/runbooks/CreateRun';
import { RunDetail } from '../features/runbooks/RunDetail';
import { RunComparison } from '../features/runbooks/RunComparison';
import { readProtected, readProtectedRecord, refreshProtected } from '../protected-read';

export type RunActionResult =
  | { ok: true; warning?: string; accessDenied?: boolean }
  | { ok: false; error: string; outcomeUnknown?: boolean; accessDenied?: boolean };
export type RunAction = (
  action: string,
  body?: Record<string, unknown>,
) => Promise<RunActionResult>;

export async function performRunAction(
  id: string,
  action: string,
  body: Record<string, unknown>,
  publishRun: (run: Run) => void,
  publishList: (runs: RunSummary[]) => void,
  transport: typeof request = request,
): Promise<RunActionResult> {
  let updated: Run;
  try {
    updated = await transport<Run>('runs/' + id + '/' + action, body);
  } catch (cause) {
    const outcomeUnknown =
      cause instanceof TypeError ||
      (cause instanceof RequestError &&
        ((cause.status >= 200 && cause.status < 300) || cause.status >= 500));
    return {
      ok: false,
      error: (cause as Error).message,
      outcomeUnknown,
      accessDenied: cause instanceof RequestError && cause.status === 403,
    };
  }
  // The returned record confirms the action independently of the history list.
  publishRun(updated);
  try {
    await readProtected<RunSummary[]>('runs', publishList, () => publishList([]), transport);
    return { ok: true };
  } catch (cause) {
    return {
      ok: true,
      accessDenied: cause instanceof RequestError && cause.status === 403,
      warning:
        'The action was saved, but the run list could not be refreshed. ' +
        (cause as Error).message +
        ' Use Refresh runs to update the list; do not repeat the action.',
    };
  }
}

export function Runbooks() {
  const [runs, setRuns] = useState<RunSummary[]>([]),
    [run, setRun] = useState<Run>(),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [template, setTemplate] = useState<TemplateId>(),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [choosing, setChoosing] = useState(false);
  const [comparing, setComparing] = useState(false),
    [archived, setArchived] = useState(false),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const [unresolvedRuns, setUnresolvedRuns] = useState<Set<string>>(() => new Set());
  const [unverifiedRuns, setUnverifiedRuns] = useState<Set<string>>(() => new Set());
  const detailSequence = useRef(0);
  const actionPending = useRef(false);
  const readList = () =>
    readProtected<RunSummary[]>('runs', setRuns, () => {
      setRuns([]);
      setComparing(false);
    });
  const readDetail = (id: string) => {
    const sequence = ++detailSequence.current;
    return readProtectedRecord<Run>(
      'runs/' + id,
      (received) => {
        if (sequence !== detailSequence.current) return;
        setRun(received);
        setUnverifiedRuns((current) => {
          const remaining = new Set(current);
          remaining.delete(id);
          return remaining;
        });
        setUnresolvedRuns((current) => {
          const remaining = new Set(current);
          remaining.delete(id);
          return remaining;
        });
      },
      () => {
        if (sequence !== detailSequence.current) return;
        setUnverifiedRuns((current) => {
          const remaining = new Set(current);
          remaining.delete(id);
          return remaining;
        });
        setRun((current) => (current?.id === id ? undefined : current));
        setRuns((current) => current.filter((record) => record.id !== id));
        setComparing(false);
      },
    );
  };
  async function refresh() {
    setError('');
    setLoading(true);
    try {
      let firstId: string | undefined;
      setError(
        await refreshProtected([
          async () => {
            firstId = (await readList())[0]?.id;
          },
          async () => {
            const id = run?.id ?? firstId;
            if (id) await readDetail(id);
          },
        ]),
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    const created = (event: Event) => {
      void select((event as CustomEvent<string>).detail);
      void readList().catch((cause) => setError(cause.message));
    };
    window.addEventListener('waypoint-run-created', created);
    return () => {
      ++detailSequence.current;
      window.removeEventListener('waypoint-run-created', created);
    };
  }, []);
  async function select(id: string) {
    setBusy(true);
    setError('');
    try {
      await readDetail(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(
    action: string,
    body: Record<string, unknown> = {},
  ): Promise<RunActionResult> {
    if (!run) return { ok: false, error: 'Select a run before performing this action.' };
    if (actionPending.current || unverifiedRuns.has(run.id))
      return { ok: false, error: 'Read the current run before sending another action.' };
    if (unresolvedRuns.has(run.id))
      return { ok: false, error: 'Read the current run before sending another action.' };
    actionPending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await performRunAction(run.id, action, body, setRun, setRuns);
      if (result.accessDenied) {
        setUnverifiedRuns((current) => new Set(current).add(run.id));
        setComparing(false);
        let error = result.ok ? (result.warning ?? '') : result.error;
        try {
          await readDetail(run.id);
        } catch (cause) {
          error += ' Could not confirm access to the saved run: ' + (cause as Error).message;
        }
        setError(error);
        return result.ok ? { ...result, warning: error } : { ...result, error };
      }
      if (!result.ok && result.outcomeUnknown) {
        const id = run.id;
        setUnresolvedRuns((current) => new Set(current).add(id));
        let recovery: string;
        try {
          await readDetail(id);
          recovery =
            'The current run was read from the journal. Inspect its recorded state before continuing.';
        } catch (cause) {
          recovery =
            'The current run could not be read: ' +
            (cause as Error).message +
            ' Use Refresh runs before sending another action.';
        }
        const error =
          'The action response was not obtained; the action may have been applied. ' +
          result.error +
          ' ' +
          recovery;
        setError(error);
        return { ...result, error };
      }
      setError(result.ok ? (result.warning ?? '') : result.error);
      return result;
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  const visible = runs.filter(
    (r) =>
      (filter === 'all' || (filter === 'active' ? r.status === 'active' : r.status !== 'active')) &&
      !!r.archivedAt === archived &&
      (!from || r.createdAt.slice(0, 10) >= from) &&
      (!to || r.createdAt.slice(0, 10) <= to) &&
      (r.title + ' ' + r.target).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title="Run queue"
        description="Select a run to inspect its steps and recorded results."
      >
        <button
          disabled={busy || unverifiedRuns.size > 0 || runs.length < 2}
          onClick={() => setComparing(true)}
        >
          Compare runs
        </button>
        <button disabled={loading || busy} onClick={() => void refresh()}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh runs
        </button>
        <button className="primary" disabled={busy || loading} onClick={() => setChoosing(true)}>
          <Plus size={16} /> New run
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
      {error && <ErrorBox error={error} />}
      {run && unverifiedRuns.has(run.id) && (
        <div role="alert" className="error-box">
          Run details and exports are hidden until current access is confirmed.
          <button disabled={busy || loading} onClick={() => void select(run.id)}>
            Read run again
          </button>
        </div>
      )}
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
            <label className="check-option">
              <input
                type="checkbox"
                checked={archived}
                onChange={(event) => setArchived(event.target.checked)}
              />{' '}
              Archived runs
            </label>
            <label className="field">
              From (UTC)
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label className="field">
              To (UTC)
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
          {loading && !runs.length ? (
            <Loading />
          ) : (
            <div className="run-options">
              {visible.map((r) => (
                <button
                  key={r.id}
                  className={run?.id === r.id ? 'selected' : ''}
                  disabled={busy || loading}
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
                <p className="padded muted">No matching runs. Use New run to create a plan.</p>
              )}
            </div>
          )}
        </section>
        {run ? (
          <RunDetail
            key={run.id}
            run={run}
            busy={busy || loading}
            outcomeUnknown={unresolvedRuns.has(run.id)}
            accessPending={unverifiedRuns.has(run.id)}
            onAction={action}
          />
        ) : (
          <section className="panel run-placeholder">
            <h2>No run selected</h2>
            <p>Select a saved run from the history, or create an observation report.</p>
            <button
              className="primary"
              disabled={busy || loading}
              onClick={() => setTemplate('observe')}
            >
              Create observation report <ArrowUpRight size={16} />
            </button>
          </section>
        )}
      </div>
      <p className="runbook-footnote">
        Maintenance windows require manual restoration. Closing this page leaves the application or
        task in its current state.
      </p>
      {choosing && (
        <Modal
          title="Choose a runbook"
          subtitle="Review the steps before creating a run"
          onClose={() => setChoosing(false)}
        >
          <div className="modal-body">
            {' '}
            <div className="template-grid">
              {(
                Object.entries(templates) as Array<[TemplateId, (typeof templates)[TemplateId]]>
              ).map(([id, t], i) => (
                <button
                  key={id}
                  className="template-card"
                  disabled={busy}
                  onClick={() => {
                    setChoosing(false);
                    setTemplate(id);
                  }}
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
              ))}
            </div>
          </div>
        </Modal>
      )}
      {template && (
        <CreateRun
          template={template}
          onClose={() => setTemplate(undefined)}
          onCreated={(created) => {
            setRun(created);
            setTemplate(undefined);
            void readList().catch((e) => setError(e.message));
          }}
        />
      )}
      {comparing && (
        <RunComparison runs={runs} initial={run?.id} onClose={() => setComparing(false)} />
      )}
    </>
  );
}
