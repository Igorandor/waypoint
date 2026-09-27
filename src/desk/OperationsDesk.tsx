import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, Workflow, RotateCcw, ShieldAlert, ClipboardList } from 'lucide-react';
import {
  deskCounts,
  deskIssues,
  deskTimeline,
  exportDesk,
  groupIssuesByTarget,
  nextDeskAction,
  type DeskIssue,
  type DeskSnapshot,
  type DeskSource,
  type DeskCommand,
} from '../../shared/operations-desk';
import type { Run, RunSummary } from '../../shared/runbook';
import type { CommandResult } from '../../shared/command-result';
import type { ProcedureSummary } from '../../shared/procedure';
import { outcomeLabels } from '../../shared/command-result';
import { request, download } from '../api';
import { Badge, ErrorBox, Loading, PageHeader } from '../components/ui';
import { Evidence } from '../components/DataView';
import './desk.css';

async function source<T>(resource: string): Promise<DeskSource<T>> {
  try {
    return { data: await request<T>(resource), readAt: new Date().toISOString() };
  } catch (cause) {
    return { error: (cause as Error).message, readAt: new Date().toISOString() };
  }
}
export function OperationsDesk() {
  const [snapshot, setSnapshot] = useState<DeskSnapshot>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [tab, setTab] = useState<'attention' | 'active' | 'timeline' | 'targets'>('attention');
  const [selected, setSelected] = useState<DeskIssue>();
  const [run, setRun] = useState<Run>();
  const [command, setCommand] = useState<CommandResult>();
  const sequence = useRef(0);
  async function refresh() {
    setLoading(true);
    setError('');
    const [runs, commands, procedures] = await Promise.all([
      source<RunSummary[]>('runs'),
      source<DeskCommand[]>('commands'),
      source<ProcedureSummary[]>('procedures'),
    ]);
    setSnapshot({ runs, commands, procedures });
    setLoading(false);
  }
  useEffect(() => {
    void refresh();
    return () => {
      sequence.current++;
    };
  }, []);
  async function inspect(issue: DeskIssue) {
    const ticket = ++sequence.current;
    setSelected(issue);
    setRun(undefined);
    setCommand(undefined);
    setBusy(true);
    setError('');
    try {
      const record = await request((issue.link === 'run' ? 'runs/' : 'commands/') + issue.recordId);
      if (ticket !== sequence.current) return;
      if (issue.link === 'run') setRun(record);
      else setCommand(record);
    } catch (cause) {
      if (ticket === sequence.current) setError((cause as Error).message);
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!command) return;
    const ticket = ++sequence.current;
    const commandId = command.id;
    setBusy(true);
    setError('');
    try {
      const result = await request<CommandResult>('commands/' + commandId + '/reconcile', {});
      if (ticket !== sequence.current || result.id !== commandId) return;
      setCommand(result);
      await refresh();
    } catch (cause) {
      if (ticket === sequence.current) setError((cause as Error).message);
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }
  function openRun(id: string) {
    window.dispatchEvent(new CustomEvent('waypoint-run-created', { detail: id }));
    location.hash = 'runbooks';
  }
  const counts = snapshot ? deskCounts(snapshot) : undefined;
  const issues = snapshot ? deskIssues(snapshot) : [];
  const visible = issues.filter(
    (issue) =>
      (kind === 'all' || issue.urgency === kind) &&
      [issue.title, issue.target, issue.detail]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const timeline = snapshot
    ? deskTimeline(snapshot).filter((event) =>
        [event.title, event.target, event.state]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    : [];
  const groups = groupIssuesByTarget(visible);
  return (
    <div className="waypoint-operations-desk">
      <PageHeader
        title="Operations desk"
        description="Review restoration obligations, uncertain outcomes and recorded follow-up work."
      >
        <button disabled={loading} onClick={() => void refresh()}>
          <RefreshCw size={16} />
          Refresh records
        </button>
        <button
          disabled={!snapshot}
          onClick={() =>
            snapshot && download('waypoint-operations-desk.json', exportDesk(snapshot))
          }
        >
          <Download size={16} />
          Export desk
        </button>
      </PageHeader>
      {error && <ErrorBox error={error} />}
      {loading && !snapshot ? (
        <Loading />
      ) : snapshot && counts ? (
        <>
          <section className="desk-counts">
            <DeskCount
              title="Restoration obligations"
              value={counts.restorationObligations}
              icon={<RotateCcw size={19} />}
              detail="Runs whose original state still needs attention"
            />
            <DeskCount
              title="Unresolved commands"
              value={counts.unresolvedCommands}
              icon={<ShieldAlert size={19} />}
              detail="Dispatching or uncertain native outcomes"
            />
            <DeskCount
              title="Active runs"
              value={counts.activeRuns}
              icon={<Workflow size={19} />}
              detail="Includes observation and maintenance workflows"
            />
            <DeskCount
              title="Open follow-ups"
              value={counts.followUps}
              icon={<ClipboardList size={19} />}
              detail={`${counts.overdueRuns} run(s) with an overdue recorded deadline`}
            />
          </section>
          <section className="panel desk-sources">
            <h2>Record visibility</h2>
            <p>
              This desk includes only the signed-in account’s records. Another operator’s notes and
              work are not listed.
            </p>
            <div>
              {Object.entries(snapshot).map(([name, value]) => (
                <article key={name}>
                  <strong>{name[0].toUpperCase() + name.slice(1)}</strong>
                  <p>{value.error ?? `${value.data?.length ?? 0} records loaded`}</p>
                  <small>Read {new Date(value.readAt).toLocaleString()}</small>
                </article>
              ))}
            </div>
            {counts.incompleteSources > 0 && (
              <p className="desk-incomplete">
                Visibility is incomplete. A missing source is not evidence that there are no open
                obligations.
              </p>
            )}
          </section>
          <div className="desk-filters">
            <label className="field">
              Find records
              <input
                value={search}
                maxLength={100}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Title, target or outcome"
              />
            </label>
            <label className="field">
              Attention level
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="all">All levels</option>
                <option value="restore">Restoration</option>
                <option value="verify">Verification</option>
                <option value="review">Review</option>
              </select>
            </label>
          </div>
          <nav className="command-targets" aria-label="Operations desk views">
            {(['attention', 'active', 'targets', 'timeline'] as const).map((value) => (
              <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>
                {value === 'attention'
                  ? 'Needs attention'
                  : value === 'active'
                    ? 'Active runs'
                    : value === 'targets'
                      ? 'By target'
                      : 'Record timeline'}
              </button>
            ))}
          </nav>
          <div className="desk-layout">
            <section aria-label="Operational records">
              {tab === 'attention' && (
                <section className="panel">
                  <h2>{visible.length} items to review</h2>
                  <p className="muted">
                    One run can appear more than once when it has separate restoration, verification
                    or follow-up obligations.
                  </p>
                  {visible.map((issue) => (
                    <IssueCard
                      issue={issue}
                      key={issue.id}
                      selected={selected?.id === issue.id}
                      onSelect={() => void inspect(issue)}
                    />
                  ))}
                  {!visible.length && (
                    <p>
                      {counts.incompleteSources
                        ? 'No items in the available sources match this filter. Other sources could not be read.'
                        : 'No loaded record matches this attention filter. Native changes outside Waypoint are not represented here.'}
                    </p>
                  )}
                </section>
              )}
              {tab === 'active' && (
                <section className="panel">
                  <h2>Active run progress</h2>
                  {(snapshot.runs.data ?? [])
                    .filter(
                      (run) =>
                        run.status === 'active' &&
                        [run.title, run.target]
                          .join(' ')
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    )
                    .map((run) => (
                      <article className="desk-active-run" key={run.id}>
                        <div className="section-heading">
                          <h3>{run.title}</h3>
                          <Badge>{run.needsRestore ? 'restore pending' : 'active'}</Badge>
                        </div>
                        <p>{run.target || 'Instance-wide observations'}</p>
                        <progress max={run.total} value={run.completed} />
                        <p>
                          {run.completed} of {run.total} steps resolved. Next:{' '}
                          {run.pendingStep ?? 'No pending step reported'}.
                        </p>
                        <small>Updated {new Date(run.updatedAt).toLocaleString()}</small>
                        <button onClick={() => openRun(run.id)}>Open run</button>
                      </article>
                    ))}
                  {counts.activeRuns === 0 && (
                    <p>No active runs were returned by the available run source.</p>
                  )}
                </section>
              )}
              {tab === 'targets' && (
                <section className="panel">
                  <h2>Attention grouped by target label</h2>
                  <p>
                    Grouping is for navigation. It does not establish a native dependency or replace
                    target reservations.
                  </p>
                  {groups.map((group) => (
                    <details key={group.target} open={groups.length < 4}>
                      <summary>
                        {group.target} · {group.issues.length} items
                      </summary>
                      {group.issues.map((issue) => (
                        <IssueCard
                          key={issue.id}
                          issue={issue}
                          selected={selected?.id === issue.id}
                          onSelect={() => void inspect(issue)}
                        />
                      ))}
                    </details>
                  ))}
                  {!groups.length && <p>No target groups match the current filter.</p>}
                </section>
              )}
              {tab === 'timeline' && (
                <section className="panel">
                  <h2>Latest record updates</h2>
                  <p className="muted">
                    One row per record, showing its latest update. This is not the native IRIS audit
                    log or a reconstruction of every event.
                  </p>
                  <ol className="desk-timeline">
                    {timeline.slice(0, 100).map((event) => (
                      <li key={event.id}>
                        <time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time>
                        <Badge>{event.source}</Badge>
                        <strong>{event.title}</strong>
                        <span>
                          {event.target || 'Instance-wide'} · {event.state}
                        </span>
                        {event.source === 'run' ? (
                          <button onClick={() => openRun(event.recordId)}>Open run</button>
                        ) : (
                          <a href={event.source === 'command' ? '#command-history' : '#procedures'}>
                            Open{' '}
                            {event.source === 'command' ? 'command history' : 'procedure library'}
                          </a>
                        )}
                      </li>
                    ))}
                  </ol>
                  {timeline.length > 100 && (
                    <p>
                      The newest 100 matching record updates are shown. Use source histories for
                      older records.
                    </p>
                  )}
                </section>
              )}
            </section>
            <aside className="desk-inspector">
              <section className="panel">
                <h2>{selected ? 'Selected obligation' : 'Review an item'}</h2>
                {!selected ? (
                  <p>
                    Select an attention item to read its current authorized record. This does not
                    send a native change.
                  </p>
                ) : (
                  <>
                    <Badge>{selected.urgency}</Badge>
                    <h3>{selected.title}</h3>
                    <p>{nextDeskAction(selected)}</p>
                    {busy && !run && !command ? <Loading /> : null}
                    {run && (
                      <>
                        <dl className="dossier-facts">
                          <div>
                            <dt>Current run status</dt>
                            <dd>{run.status}</dd>
                          </div>
                          <div>
                            <dt>Restoration</dt>
                            <dd>{run.needsRestore ? 'Required' : 'No obligation recorded'}</dd>
                          </div>
                          <div>
                            <dt>Owner</dt>
                            <dd>{run.owner}</dd>
                          </div>
                          <div>
                            <dt>Instance</dt>
                            <dd>{run.instance}</dd>
                          </div>
                        </dl>
                        <h4>Steps requiring review</h4>
                        {run.steps
                          .filter(
                            (step) =>
                              ['failed', 'uncertain', 'running'].includes(step.status) ||
                              (step.procedureStep?.kind === 'assertion' &&
                                ['failed', 'unknown'].includes(
                                  (step.evidence as { outcome?: string })?.outcome ?? '',
                                )),
                          )
                          .map((step, index) => (
                            <article key={index} className="desk-step">
                              <strong>{step.title}</strong>
                              <Badge>{step.status}</Badge>
                              {step.error && <p>{step.error}</p>}
                              {step.procedureStep?.kind === 'assertion' && (
                                <Evidence value={step.evidence} />
                              )}
                            </article>
                          ))}
                        {run.handover && (
                          <>
                            <h4>Owner-recorded handover</h4>
                            <p>{run.handover.summary}</p>
                            {run.handover.outstandingRisks && (
                              <p>{run.handover.outstandingRisks}</p>
                            )}
                            <ul>
                              {run.handover.nextActions
                                .filter((action) => !action.completed)
                                .map((action) => (
                                  <li key={action.id}>
                                    {action.title}
                                    {action.dueAt
                                      ? ' · due ' + new Date(action.dueAt).toLocaleString()
                                      : ''}
                                  </li>
                                ))}
                            </ul>
                            <small>This package does not transfer execution authority.</small>
                          </>
                        )}
                        <button className="primary" onClick={() => openRun(run.id)}>
                          Open run controls
                        </button>
                      </>
                    )}
                    {command && (
                      <>
                        <h4>{outcomeLabels[command.status]}</h4>
                        <p>{command.message}</p>
                        <dl className="dossier-facts">
                          <div>
                            <dt>Native operation</dt>
                            <dd>
                              {command.operation.method} {command.operation.path}
                            </dd>
                          </div>
                          <div>
                            <dt>Target</dt>
                            <dd>{command.target}</dd>
                          </div>
                          <div>
                            <dt>Last observed</dt>
                            <dd>
                              {command.observedAt
                                ? new Date(command.observedAt).toLocaleString()
                                : 'No successful readback recorded'}
                            </dd>
                          </div>
                        </dl>
                        {['uncertain', 'acknowledged'].includes(command.status) && (
                          <button disabled={busy} onClick={() => void reconcile()}>
                            Read current result
                          </button>
                        )}
                        <details>
                          <summary>Recorded outcome events</summary>
                          <ol>
                            {command.events.map((event, index) => (
                              <li key={index}>
                                <time>{new Date(event.at).toLocaleString()}</time>
                                <p>{event.message}</p>
                              </li>
                            ))}
                          </ol>
                        </details>
                        <a href="#command-history">Open command history</a>
                      </>
                    )}
                  </>
                )}
              </section>
              <section className="panel">
                <h3>Start from a reviewed plan</h3>
                <p>
                  {counts.availableProcedures} active procedure definitions are available in the
                  loaded library. Each execution keeps its chosen version.
                </p>
                <a href="#procedures">Open procedure library</a>
                <h3>Before a native change</h3>
                <ul>
                  <li>Read current configuration and execution state.</li>
                  <li>Resolve uncertain outcomes on the same target.</li>
                  <li>Use a maintenance window when original state must be restored.</li>
                  <li>Keep a responsible operator and recorded follow-up.</li>
                </ul>
                <div className="desk-links">
                  <a href="#application-readiness">Application readiness</a>
                  <a href="#task-readiness">Task readiness</a>
                  <a href="#capacity-watch">Capacity watch</a>
                  <a href="#log-investigation">Log investigation</a>
                </div>
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
function DeskCount({
  title,
  value,
  icon,
  detail,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  detail: string;
}) {
  return (
    <article className="panel desk-count">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
function IssueCard({
  issue,
  selected,
  onSelect,
}: {
  issue: DeskIssue;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article className={'desk-issue ' + issue.urgency + (selected ? ' selected' : '')}>
      <div className="section-heading">
        <h3>{issue.title}</h3>
        <Badge>{issue.urgency}</Badge>
      </div>
      <p className="desk-target">{issue.target || 'Instance-wide'}</p>
      <p>{issue.detail}</p>
      {issue.dueAt && (
        <p>
          Earliest open deadline:{' '}
          <time dateTime={issue.dueAt}>{new Date(issue.dueAt).toLocaleString()}</time>
        </p>
      )}
      <div className="section-heading">
        <small>Updated {new Date(issue.at).toLocaleString()}</small>
        <button onClick={onSelect} aria-pressed={selected}>
          Inspect record
        </button>
      </div>
    </article>
  );
}
