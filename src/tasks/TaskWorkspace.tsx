import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, ClipboardCheck, Play, Pause, Search } from 'lucide-react';
import {
  durationLabel,
  explainSchedule,
  historyStatistics,
  nativeText,
  normalizeTaskHistory,
  taskExecutionState,
  taskReadiness,
  type HistoryRow,
  type NativeObject,
} from '../../shared/task-insights';
import type { ProcedureBody } from '../../shared/procedure';
import { iris, request, download, RequestError } from '../api';
import { Badge, ErrorBox, Loading, PageHeader } from '../components/ui';
import { Evidence } from '../components/DataView';
import { ReviewedAction, type ActionCandidate } from '../commands/ReviewedAction';
import './tasks.css';

type Observation<T> = { data?: T; error?: string; at: string };
type Dossier = {
  id: string;
  configuration: Observation<NativeObject>;
  state: Observation<NativeObject>;
  history: Observation<NativeObject[]>;
};
async function observed<T>(path: string, query: Record<string, string>): Promise<Observation<T>> {
  try {
    return { data: (await iris<T>(path, query)).data, at: new Date().toISOString() };
  } catch (cause) {
    return { error: (cause as Error).message, at: new Date().toISOString() };
  }
}
function taskProcedure(id: string, name: string): ProcedureBody {
  return {
    title: ('Task readiness: ' + name).slice(0, 100),
    description:
      'Record configuration, scheduling state and recent execution history before an operator decides whether to request work.',
    expectedOutcome:
      'A documented decision based on current scheduling state and execution evidence.',
    tags: ['task', 'readiness'],
    steps: [
      {
        id: 'definition',
        kind: 'observation',
        title: 'Read task configuration',
        instruction: 'Check execution namespace, class and run-as identity.',
        source: 'task',
        target: id,
      },
      {
        id: 'state',
        kind: 'observation',
        title: 'Read scheduling state',
        instruction:
          'Inspect Status, Suspended and NextScheduled. Suspending scheduling does not stop running work.',
        source: 'task-state',
        target: id,
      },
      {
        id: 'history',
        kind: 'observation',
        title: 'Read recent executions',
        instruction:
          'Review recent errors, completion and output. This is a bounded history sample.',
        source: 'task-history',
        target: id,
      },
      {
        id: 'decision',
        kind: 'checklist',
        title: 'Record the execution decision',
        instruction: 'Use the command review workflow separately when a native change is needed.',
        items: [
          {
            id: 'identity',
            text: 'Confirm the task class, namespace and run-as identity',
            required: true,
          },
          { id: 'overlap', text: 'Check for running or overlapping work', required: true },
          { id: 'errors', text: 'Review recent errors and the recovery owner', required: true },
          {
            id: 'window',
            text: 'Confirm scheduling and maintenance-window obligations',
            required: true,
          },
        ],
        requireNote: true,
        reference: '',
      },
    ],
  };
}
export function TaskWorkspace() {
  const [tasks, setTasks] = useState<NativeObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [suspension, setSuspension] = useState('all');
  const [dossier, setDossier] = useState<Dossier>();
  const [selected, setSelected] = useState('');
  const [action, setAction] = useState<{ candidate: ActionCandidate; title: string }>();
  const [tab, setTab] = useState<'readiness' | 'schedule' | 'history' | 'configuration'>(
    'readiness',
  );
  const [notice, setNotice] = useState('');
  const [listAt, setListAt] = useState('');
  const sequence = useRef(0);
  async function loadList() {
    setLoading(true);
    setError('');
    try {
      const value = (await iris('/v2/tasks', { maxRows: '1000' })).data;
      if (!Array.isArray(value)) throw new Error('The task inventory response is not a list.');
      setTasks(value);
      setListAt(new Date().toISOString());
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 403) {
        setTasks([]);
        setListAt('');
      }
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void loadList();
    return () => {
      sequence.current++;
    };
  }, []);
  async function inspect(id: string) {
    const ticket = ++sequence.current;
    setSelected(id);
    setBusy(true);
    setAction(undefined);
    setDossier(undefined);
    setError('');
    setNotice('');
    const [configuration, state, history] = await Promise.all([
      observed<NativeObject>('/v2/task', { id }),
      observed<NativeObject>('/v2/task/info', { id }),
      observed<NativeObject[]>('/v2/task/history', { taskId: id, maxRows: '200' }),
    ]);
    if (ticket !== sequence.current) return;
    setDossier({ id, configuration, state, history });
    setBusy(false);
  }
  const list = tasks.filter((task) => {
    const text = [task.Id, task.Name, task.Namespace, task.Description].join(' ').toLowerCase();
    return (
      text.includes(search.toLowerCase()) &&
      (type === 'all' || task.Type === type) &&
      (suspension === 'all' ||
        (suspension === 'suspended' ? task.Suspended === true : task.Suspended === false))
    );
  });
  const config = dossier?.configuration.data;
  const info = dossier?.state.data;
  const history = dossier?.history.data
    ? normalizeTaskHistory(dossier.history.data, dossier.id)
    : undefined;
  const findings = taskReadiness(config, info, history);
  const name = nativeText(
    config?.Name,
    (tasks.find((row) => String(row.Id) === selected)?.Name as string) ?? selected,
  );
  async function saveProcedure() {
    if (!dossier) return;
    setBusy(true);
    setError('');
    try {
      const record = await request('procedures', taskProcedure(dossier.id, name));
      setNotice(
        'Saved procedure “' +
          record.versions[0].body.title +
          '”. Open the procedure library to review and run it.',
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function prepare(kind: 'run' | 'suspend' | 'resume') {
    if (!dossier) return;
    setAction({
      title: {
        run: 'Request task execution',
        suspend: 'Suspend future scheduling',
        resume: 'Resume future scheduling',
      }[kind],
      candidate: { path: '/v2/task/' + kind, method: 'POST', query: { id: dossier.id } },
    });
  }
  return (
    <>
      <PageHeader
        title="Task readiness"
        description="Review a task’s execution state, schedule and recent history before operating it."
      >
        <button disabled={loading} onClick={() => void loadList()}>
          <RefreshCw size={16} />
          Refresh inventory
        </button>
        <a href="#tasks">Task configuration editor</a>
      </PageHeader>
      {error && <ErrorBox error={error} />}
      {notice && (
        <div className="notice" role="status">
          {notice} <a href="#procedures">Procedure library</a>
        </div>
      )}
      <div className="task-workspace">
        <aside className="panel task-inventory">
          <label className="field">
            <span>
              <Search size={14} /> Find task
            </span>
            <input
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, ID or namespace"
            />
          </label>
          <div className="task-filter-row">
            <label className="field">
              Type
              <select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="all">All types</option>
                {[...new Set(tasks.map((row) => nativeText(row.Type)))].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Scheduling
              <select value={suspension} onChange={(event) => setSuspension(event.target.value)}>
                <option value="all">All states</option>
                <option value="suspended">Suspended</option>
                <option value="scheduled">Not suspended</option>
              </select>
            </label>
          </div>
          <p className="muted">
            {list.length} of {tasks.length} loaded tasks
            {tasks.length === 1000 ? ' · inventory limit reached' : ''}
          </p>
          {loading && !tasks.length ? (
            <Loading />
          ) : (
            list.map((task, index) => (
              <button
                className="task-choice"
                aria-pressed={selected === String(task.Id)}
                key={String(task.Id) + ':' + index}
                onClick={() => void inspect(String(task.Id))}
              >
                <strong>{nativeText(task.Name)}</strong>
                <span>
                  #{nativeText(task.Id)} · {nativeText(task.Namespace)} · {nativeText(task.Type)}
                </span>
                <span>
                  {task.Suspended === true
                    ? 'Scheduling suspended'
                    : task.Suspended === false
                      ? 'Scheduling not suspended'
                      : 'Scheduling state unknown'}
                </span>
              </button>
            ))
          )}
          {!loading && !list.length && <p>No loaded tasks match these filters.</p>}
          {listAt && <small>Inventory read {new Date(listAt).toLocaleTimeString()}</small>}
        </aside>
        <section className="task-dossier" aria-label="Selected task dossier">
          {busy && !dossier ? (
            <Loading />
          ) : !dossier ? (
            <section className="panel">
              <h2>Select a task</h2>
              <p>
                The dossier reads configuration, live state and recent history independently.
                Permission errors remain visible for each source.
              </p>
            </section>
          ) : (
            <>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <p className="muted">Task #{dossier.id}</p>
                    <h2>{name}</h2>
                  </div>
                  <button disabled={busy} onClick={() => void inspect(dossier.id)}>
                    <RefreshCw size={16} />
                    Refresh task
                  </button>
                </div>
                <dl className="dossier-facts">
                  <div>
                    <dt>Execution</dt>
                    <dd>
                      <Badge>{taskExecutionState(info)}</Badge>
                    </dd>
                  </div>
                  <div>
                    <dt>Scheduling</dt>
                    <dd>
                      {info?.Suspended === true
                        ? 'Suspended'
                        : info?.Suspended === false
                          ? 'Not suspended'
                          : 'Unknown'}
                    </dd>
                  </div>
                  <div>
                    <dt>Namespace</dt>
                    <dd>{nativeText(config?.NameSpace)}</dd>
                  </div>
                  <div>
                    <dt>Run as</dt>
                    <dd>{nativeText(config?.RunAsUser)}</dd>
                  </div>
                  <div>
                    <dt>Task class</dt>
                    <dd>{nativeText(config?.TaskClass)}</dd>
                  </div>
                  <div>
                    <dt>Next native schedule</dt>
                    <dd>{nativeText(info?.NextScheduled)}</dd>
                  </div>
                </dl>
                <div className="task-toolbar">
                  <button
                    disabled={busy || !config || taskExecutionState(info) === 'running'}
                    onClick={() => prepare('run')}
                  >
                    <Play size={15} />
                    Review run request
                  </button>
                  <button
                    disabled={busy || typeof info?.Suspended !== 'boolean'}
                    onClick={() => prepare(info?.Suspended ? 'resume' : 'suspend')}
                  >
                    <Pause size={15} />
                    {info?.Suspended ? 'Review resume' : 'Review suspension'}
                  </button>
                  <button disabled={busy || !config} onClick={() => void saveProcedure()}>
                    <ClipboardCheck size={15} />
                    Save readiness procedure
                  </button>
                  <button
                    onClick={() =>
                      download('waypoint-task-' + dossier.id + '.json', {
                        format: 'waypoint-task-dossier-1',
                        ...dossier,
                        findings,
                        scope:
                          'Bounded observations, not a complete execution history. Native timestamps have no UTC offset.',
                      })
                    }
                  >
                    <Download size={15} />
                    Export dossier
                  </button>
                </div>
              </section>
              {action && (
                <ReviewedAction
                  key={action.title + selected}
                  {...action}
                  onClose={() => setAction(undefined)}
                  onSettled={() =>
                    setNotice(
                      'The command result was recorded. Refresh this task to load a new dossier.',
                    )
                  }
                />
              )}
              <nav className="command-targets" aria-label="Task dossier sections">
                {(['readiness', 'schedule', 'history', 'configuration'] as const).map((value) => (
                  <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </nav>
              {tab === 'readiness' && (
                <>
                  <section className="panel">
                    <h3>Evidence availability</h3>
                    <div className="task-source-grid">
                      {(['configuration', 'state', 'history'] as const).map((source) => (
                        <div key={source}>
                          <strong>{source}</strong>
                          <p>{dossier[source].error ?? 'Read successfully'}</p>
                          <small>{new Date(dossier[source].at).toLocaleString()}</small>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="panel">
                    <h3>Readiness findings</h3>
                    <p className="muted">
                      These observations support an operator decision. They do not approve execution
                      or reserve a maintenance window.
                    </p>
                    {findings.length ? (
                      findings.map((finding) => (
                        <article className={'task-finding ' + finding.severity} key={finding.id}>
                          <Badge>{finding.severity}</Badge>
                          <h4>{finding.title}</h4>
                          <p>{finding.detail}</p>
                          {finding.fields.length > 0 && (
                            <small>Native fields: {finding.fields.join(', ')}</small>
                          )}
                        </article>
                      ))
                    ) : (
                      <p>No configured readiness rules raised a finding for the loaded data.</p>
                    )}
                  </section>
                  <section className="panel">
                    <h3>Before a maintenance window</h3>
                    <ol>
                      <li>Review the execution identity and task class.</li>
                      <li>Check running work and recent failures.</li>
                      <li>
                        Create a task scheduling window in Runbooks when scheduling must be held.
                        That window retains its original state and reserves the target.
                      </li>
                      <li>
                        Record external maintenance and restore the original scheduling state.
                      </li>
                    </ol>
                    <a href="#runbooks">Open runbooks</a>
                  </section>
                </>
              )}
              {tab === 'schedule' && (
                <TaskSchedule configuration={dossier.configuration} state={dossier.state} />
              )}
              {tab === 'history' && (
                <TaskHistory
                  rows={history ?? []}
                  error={dossier.history.error}
                  limitReached={dossier.history.data?.length === 200}
                />
              )}
              {tab === 'configuration' && (
                <section className="panel">
                  <h3>Native task configuration</h3>
                  {dossier.configuration.error ? (
                    <ErrorBox error={dossier.configuration.error} />
                  ) : (
                    <Evidence value={config} />
                  )}
                  <details>
                    <summary>Native execution state</summary>
                    {dossier.state.error ? (
                      <ErrorBox error={dossier.state.error} />
                    ) : (
                      <Evidence value={info} />
                    )}
                  </details>
                </section>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
function TaskSchedule({
  configuration,
  state,
}: {
  configuration: Observation<NativeObject>;
  state: Observation<NativeObject>;
}) {
  const schedule = configuration.data ? explainSchedule(configuration.data) : undefined;
  return (
    <section className="panel">
      <h3>Schedule interpretation</h3>
      {configuration.error && <ErrorBox error={configuration.error} />}
      {schedule && (
        <>
          <h4>{schedule.period}</h4>
          {schedule.daily && <p>{schedule.daily}</p>}
          {schedule.warnings.map((warning) => (
            <p className="task-finding attention" key={warning}>
              {warning}
            </p>
          ))}
          <ul>
            {schedule.limits.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </>
      )}
      <h4>Native task-manager observations</h4>
      {state.error ? (
        <ErrorBox error={state.error} />
      ) : (
        <dl className="dossier-facts">
          {['LastSchedule', 'LastStarted', 'LastFinished', 'NextScheduled', 'Status', 'Error'].map(
            (field) => (
              <div key={field}>
                <dt>{field}</dt>
                <dd>{nativeText(state.data?.[field])}</dd>
              </div>
            ),
          )}
        </dl>
      )}
      <p className="muted">
        Suspension affects future scheduling. It does not terminate a task process which has already
        started.
      </p>
    </section>
  );
}
function TaskHistory({
  rows,
  error,
  limitReached,
}: {
  rows: HistoryRow[];
  error?: string;
  limitReached?: boolean;
}) {
  const [outcome, setOutcome] = useState('all');
  const [filter, setFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<HistoryRow>();
  const stats = historyStatistics(rows);
  const visible = rows.filter(
    (row) =>
      (outcome === 'all' || row.outcome === outcome) &&
      [row.source.Name, row.source.Result, row.source.Username, row.source.Pid]
        .join(' ')
        .toLowerCase()
        .includes(filter.toLowerCase()) &&
      (!from || (row.started?.date ?? '') >= from) &&
      (!to || (row.started?.date ?? '') <= to),
  );
  return (
    <section className="panel">
      <h3>Loaded execution history</h3>
      {error && <ErrorBox error={error} />}
      <p className="muted">
        Up to 200 records for this task. Durations use native wall-clock timestamps; daylight-saving
        transitions can affect them.{' '}
        {limitReached ? 'The limit was reached; earlier executions may be omitted.' : ''}
      </p>
      <dl className="dossier-facts">
        <div>
          <dt>Records</dt>
          <dd>{stats.total}</dd>
        </div>
        <div>
          <dt>Known successes</dt>
          <dd>{stats.successes}</dd>
        </div>
        <div>
          <dt>Errors</dt>
          <dd>{stats.errors}</dd>
        </div>
        <div>
          <dt>Unclassified</dt>
          <dd>{stats.unknown}</dd>
        </div>
        <div>
          <dt>Median wall duration</dt>
          <dd>{durationLabel(stats.medianDuration)}</dd>
        </div>
        <div>
          <dt>Longest wall duration</dt>
          <dd>{durationLabel(stats.maximumDuration)}</dd>
        </div>
      </dl>
      <div className="task-history-filters">
        <label className="field">
          Result
          <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
            <option value="all">All</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
            <option value="running">Running</option>
            <option value="unknown">Unclassified</option>
          </select>
        </label>
        <label className="field">
          Find in history
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            maxLength={100}
          />
        </label>
        <label className="field">
          From native date
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="field">
          Through native date
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Started</th>
              <th>Completed</th>
              <th>Outcome</th>
              <th>Wall duration</th>
              <th>Native result</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key}>
                <td>{nativeText(row.source.LastStart)}</td>
                <td>{nativeText(row.source.Completed)}</td>
                <td>
                  <Badge>{row.outcome}</Badge>
                </td>
                <td>{durationLabel(row.duration)}</td>
                <td className="history-result">{nativeText(row.source.Result)}</td>
                <td>
                  <button onClick={() => setSelected(row)}>Inspect</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && <p>No loaded records match these filters.</p>}
      {selected && (
        <div className="task-history-detail">
          <div className="section-heading">
            <h4>Execution evidence</h4>
            <button onClick={() => setSelected(undefined)}>Close</button>
          </div>
          <Evidence value={selected.source} />
        </div>
      )}
      <button
        onClick={() =>
          download('waypoint-task-history.json', {
            scope: 'Filtered loaded history only',
            rows: visible.map((row) => row.source),
          })
        }
      >
        <Download size={15} />
        Export filtered history
      </button>
    </section>
  );
}
