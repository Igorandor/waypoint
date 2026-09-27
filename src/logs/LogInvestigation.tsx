import { useRef, useState } from 'react';
import { Bookmark, Download, RefreshCw, Search } from 'lucide-react';
import {
  captureOverlap,
  commonLogMessages,
  exportLogCapture,
  filterLogLines,
  logContext,
  logStatistics,
  parseLogLines,
  validateLogObservation,
  type LogCapture,
  type LogFilter,
  type LogLine,
  type LogSource,
} from '../../shared/log-investigation';
import { iris, request, download } from '../api';
import { ErrorBox, PageHeader } from '../components/ui';
import { discardDeniedLogEvidence } from './log-access';
import './logs.css';

const blankFilter: LogFilter = {
  text: '',
  exclude: '',
  signal: 'all',
  pid: '',
  from: '',
  to: '',
  caseSensitive: false,
};
export function LogInvestigation() {
  const [source, setSource] = useState<LogSource>('messages');
  const [limit, setLimit] = useState(200);
  const [capture, setCapture] = useState<LogCapture>();
  const [previous, setPrevious] = useState<LogCapture>();
  const [filter, setFilter] = useState<LogFilter>(blankFilter);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<number>();
  const [contextRadius, setContextRadius] = useState(3);
  const [tab, setTab] = useState<'lines' | 'patterns' | 'bookmarks' | 'comparison'>('lines');
  const requestSequence = useRef(0);
  const lines = capture ? parseLogLines(capture.observation) : [];
  const visible = filterLogLines(lines, filter);
  const stats = logStatistics(lines);
  const patterns = commonLogMessages(visible);
  const context = selected === undefined ? [] : logContext(lines, selected, contextRadius);
  const overlap = previous && capture ? captureOverlap(previous, capture) : undefined;
  const invalidDates = !!filter.from && !!filter.to && filter.from > filter.to;
  function updateFilter<K extends keyof LogFilter>(key: K, value: LogFilter[K]) {
    setFilter({ ...filter, [key]: value });
  }
  async function load() {
    const sequence = ++requestSequence.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await iris('/extension/logs', { source, limit: String(limit) });
      const observation = validateLogObservation(result.data, source);
      if (sequence !== requestSequence.current) return;
      setPrevious(capture?.observation.source === source ? capture : undefined);
      setCapture({
        id: crypto.randomUUID(),
        capturedAt: new Date().toISOString(),
        observation,
        bookmarks: [],
      });
      setSelected(undefined);
    } catch (cause) {
      if (sequence === requestSequence.current) {
        const evidence = { capture, previous, selected, notice };
        const remaining = discardDeniedLogEvidence(evidence, source, cause);
        if (remaining !== evidence) {
          if (remaining.capture !== capture) {
            setCapture(remaining.capture);
            setSelected(remaining.selected);
            setNotice(remaining.notice);
          }
          if (remaining.previous !== previous) setPrevious(remaining.previous);
        }
        setError((cause as Error).message);
      }
    } finally {
      if (sequence === requestSequence.current) setBusy(false);
    }
  }
  function bookmark(line: LogLine) {
    if (!capture) return;
    if (capture.bookmarks.some((item) => item.index === line.index)) {
      setTab('bookmarks');
      return;
    }
    if (capture.bookmarks.length >= 30) {
      setError(
        'This capture already has 30 bookmarks. Export it before starting another investigation.',
      );
      return;
    }
    setCapture({
      ...capture,
      bookmarks: [
        ...capture.bookmarks,
        { id: crypto.randomUUID(), index: line.index, text: line.text, note: '' },
      ],
    });
    setNotice('Line ' + (line.index + 1) + ' bookmarked in this capture.');
  }
  async function saveProcedure() {
    setBusy(true);
    setError('');
    try {
      await request('procedures', {
        title: 'Review ' + source + ' log',
        description: 'Capture a bounded native log tail and record an investigation decision.',
        expectedOutcome: 'Captured evidence and a documented follow-up owner.',
        tags: ['logs', source],
        steps: [
          {
            id: 'log',
            kind: 'observation',
            title: 'Capture recent ' + source,
            instruction:
              'Check the returned scope and timestamp range. This is not the complete file.',
            source,
            target: '',
          },
          {
            id: 'review',
            kind: 'checklist',
            title: 'Review the log evidence',
            instruction:
              'Use the investigation workspace for filtering and context. Do not treat absent lines as proof that an event did not happen.',
            items: [
              {
                id: 'range',
                text: 'Confirm the loaded timestamp range and bounded scope',
                required: true,
              },
              {
                id: 'signals',
                text: 'Inspect relevant messages with surrounding context',
                required: true,
              },
              {
                id: 'owner',
                text: 'Record follow-up and the responsible operator',
                required: true,
              },
            ],
            requireNote: true,
            reference: '',
          },
        ],
      });
      setNotice('Saved a repeatable log review in the procedure library.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="waypoint-log-investigation">
      <PageHeader
        title="Log investigation"
        description="Filter a captured native tail, preserve context and annotate relevant lines."
      >
        <a href="#logs">Other log and audit sources</a>
        <button
          disabled={!capture}
          onClick={() =>
            capture &&
            download(
              'waypoint-' + capture.observation.source + '-investigation.json',
              exportLogCapture(capture, filter, visible),
            )
          }
        >
          <Download size={16} />
          Export investigation
        </button>
      </PageHeader>
      {error && <ErrorBox error={error} />}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <section className="panel log-source-controls">
        <label className="field">
          Native file
          <select
            disabled={busy}
            value={source}
            onChange={(event) => {
              setSource(event.target.value as LogSource);
              setFilter(blankFilter);
            }}
          >
            <option value="messages">messages.log</option>
            <option value="alerts">alerts.log</option>
          </select>
        </label>
        <label className="field">
          Maximum tail lines
          <select disabled={busy} value={limit} onChange={(event) => setLimit(+event.target.value)}>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
        </label>
        <button className="primary" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={16} />
          {busy ? 'Reading…' : 'Capture tail'}
        </button>
        <p>
          IRIS reads at most the final 1 MiB and returns up to the selected line count. No polling
          or full-file search runs in the background.
        </p>
      </section>
      {capture ? (
        <>
          <section className="panel">
            <div className="section-heading">
              <h2>{capture.observation.source}.log capture</h2>
              <span>{new Date(capture.capturedAt).toLocaleString()}</span>
            </div>
            {capture.observation.notice && <p>{capture.observation.notice}</p>}
            <dl className="dossier-facts">
              <div>
                <dt>Loaded lines</dt>
                <dd>{stats.total}</dd>
              </div>
              <div>
                <dt>Native file size</dt>
                <dd>
                  {capture.observation.bytes === undefined
                    ? 'Not reported'
                    : capture.observation.bytes.toLocaleString() + ' bytes'}
                </dd>
              </div>
              <div>
                <dt>First recognized timestamp</dt>
                <dd>{stats.firstTimestamp ?? 'None'}</dd>
              </div>
              <div>
                <dt>Last recognized timestamp</dt>
                <dd>{stats.lastTimestamp ?? 'None'}</dd>
              </div>
              <div>
                <dt>Lines without recognized timestamp</dt>
                <dd>{stats.withoutTimestamp}</dd>
              </div>
            </dl>
            <p className="muted">
              Timestamps are shown as native wall time. Error/warning/information labels are literal
              word matches, not a native severity field. Unclassified lines are retained.
            </p>
          </section>
          <section className="panel log-filters">
            <label className="field">
              <span>
                <Search size={14} /> Contains literal text
              </span>
              <input
                value={filter.text}
                maxLength={200}
                onChange={(event) => updateFilter('text', event.target.value)}
              />
            </label>
            <label className="field">
              Exclude literal text
              <input
                value={filter.exclude}
                maxLength={200}
                onChange={(event) => updateFilter('exclude', event.target.value)}
              />
            </label>
            <label className="field">
              Text signal
              <select
                value={filter.signal}
                onChange={(event) => updateFilter('signal', event.target.value)}
              >
                <option value="all">All signals</option>
                {Object.entries(stats.counts).map(([key, count]) => (
                  <option key={key} value={key}>
                    {key} ({count})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Recognized process ID
              <select
                value={filter.pid}
                onChange={(event) => updateFilter('pid', event.target.value)}
              >
                <option value="">All processes</option>
                {stats.processes.map((item) => (
                  <option value={item.pid} key={item.pid}>
                    {item.pid} ({item.count} lines)
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              From native date
              <input
                type="date"
                value={filter.from}
                onChange={(event) => updateFilter('from', event.target.value)}
              />
            </label>
            <label className="field">
              Through native date
              <input
                type="date"
                value={filter.to}
                onChange={(event) => updateFilter('to', event.target.value)}
              />
            </label>
            <label className="check-option">
              <input
                type="checkbox"
                checked={filter.caseSensitive}
                onChange={(event) => updateFilter('caseSensitive', event.target.checked)}
              />
              Case-sensitive text
            </label>
            <button onClick={() => setFilter(blankFilter)}>Reset filters</button>
            {invalidDates && <ErrorBox error="The start date is after the end date." />}
          </section>
          <nav className="command-targets" aria-label="Investigation sections">
            {(['lines', 'patterns', 'bookmarks', 'comparison'] as const).map((value) => (
              <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>
                {value === 'comparison'
                  ? 'Previous capture'
                  : value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </nav>
          {tab === 'lines' && (
            <section className="panel">
              <h2>{visible.length} matching lines</h2>
              <p className="muted">
                Date filters omit lines without a recognized timestamp. Use context to inspect
                continuation lines.
              </p>
              <div className="log-lines" role="list">
                {visible.map((line) => (
                  <article role="listitem" className={'log-line ' + line.signal} key={line.index}>
                    <button
                      className="log-line-number"
                      aria-label={'Show context around line ' + (line.index + 1)}
                      onClick={() => setSelected(line.index)}
                    >
                      {line.index + 1}
                    </button>
                    <pre>
                      <LiteralHighlight
                        text={line.text}
                        query={filter.text}
                        caseSensitive={filter.caseSensitive}
                      />
                    </pre>
                    <button
                      aria-label={'Bookmark line ' + (line.index + 1)}
                      onClick={() => bookmark(line)}
                    >
                      <Bookmark size={14} />
                    </button>
                  </article>
                ))}
              </div>
              {!visible.length && (
                <p>
                  No captured lines match these filters. Earlier or omitted lines have not been
                  searched.
                </p>
              )}
            </section>
          )}
          {tab === 'patterns' && (
            <section className="panel">
              <h2>Repeated messages in filtered lines</h2>
              <p>
                Only an initial recognized timestamp is removed for grouping. Process IDs, numbers
                and message content stay intact.
              </p>
              {patterns.map((group, index) => (
                <article className="log-pattern" key={index}>
                  <strong>{group.count} occurrences</strong>
                  <pre>{group.message}</pre>
                  <div>
                    {group.indices.map((index) => (
                      <button key={index} onClick={() => setSelected(index)}>
                        Line {index + 1}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
              {!patterns.length && (
                <p>No repeated message text was found in the filtered capture.</p>
              )}
            </section>
          )}
          {tab === 'bookmarks' && (
            <section className="panel">
              <h2>Bookmarked evidence</h2>
              <p>
                Bookmarks and notes belong to this captured tail and remain in page memory. Export
                before loading another tail or navigating away.
              </p>
              {capture.bookmarks.map((item) => (
                <article className="log-bookmark" key={item.id}>
                  <div className="section-heading">
                    <button onClick={() => setSelected(item.index)}>Line {item.index + 1}</button>
                    <button
                      onClick={() =>
                        setCapture({
                          ...capture,
                          bookmarks: capture.bookmarks.filter(
                            (bookmark) => bookmark.id !== item.id,
                          ),
                        })
                      }
                    >
                      Remove bookmark
                    </button>
                  </div>
                  <pre>{item.text}</pre>
                  <label className="field">
                    Investigation note
                    <textarea
                      value={item.note}
                      maxLength={1000}
                      onChange={(event) =>
                        setCapture({
                          ...capture,
                          bookmarks: capture.bookmarks.map((bookmark) =>
                            bookmark.id === item.id
                              ? { ...bookmark, note: event.target.value }
                              : bookmark,
                          ),
                        })
                      }
                    />
                  </label>
                </article>
              ))}
              {!capture.bookmarks.length && <p>Bookmark a line to record why it matters.</p>}
            </section>
          )}
          {tab === 'comparison' && (
            <section className="panel">
              <h2>Compare with the previous capture</h2>
              {overlap ? (
                <>
                  <p>{overlap.reason}</p>
                  <p>
                    {overlap.reliable
                      ? `${overlap.overlap} matching boundary lines; ${overlap.newLines.length} subsequent lines in the current capture.`
                      : 'New lines cannot be reliably identified from these two tails.'}
                  </p>
                  {overlap.reliable && (
                    <pre className="log-overlap">
                      {overlap.newLines.join('\n') || 'No additional lines in the loaded window.'}
                    </pre>
                  )}
                  <small>Previous capture: {new Date(previous!.capturedAt).toLocaleString()}</small>
                </>
              ) : (
                <p>Capture the same source again to compare the two bounded windows.</p>
              )}
            </section>
          )}
          {selected !== undefined && (
            <section className="panel log-context">
              <div className="section-heading">
                <h2>Context around line {selected + 1}</h2>
                <button onClick={() => setSelected(undefined)}>Close context</button>
              </div>
              <label className="field">
                Lines before and after
                <select
                  value={contextRadius}
                  onChange={(event) => setContextRadius(+event.target.value)}
                >
                  <option value={1}>1</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                </select>
              </label>
              <div className="log-lines">
                {context.map((line) => (
                  <article
                    className={'log-line ' + (line.index === selected ? 'selected' : '')}
                    key={line.index}
                  >
                    <span className="log-line-number">{line.index + 1}</span>
                    <pre>{line.text}</pre>
                    <button onClick={() => bookmark(line)}>
                      <Bookmark size={14} />
                    </button>
                  </article>
                ))}
              </div>
              <p className="muted">
                Context includes only lines present in this capture, regardless of active filters.
              </p>
            </section>
          )}
        </>
      ) : (
        <section className="panel">
          <h2>Capture a native log tail</h2>
          <p>
            Choose messages or alerts. Each capture records its source, bounded lines and collection
            time. Filtering and annotation run against that captured result.
          </p>
        </section>
      )}
      <section className="panel">
        <h2>Preserve a repeatable log review</h2>
        <p>
          Save a procedure when a durable run should capture fresh log evidence and an operator
          checkpoint.
        </p>
        <button disabled={busy} onClick={() => void saveProcedure()}>
          Save {source} review procedure
        </button>
        <a href="#procedures"> Open procedure library</a>
      </section>
    </div>
  );
}
function LiteralHighlight({
  text,
  query,
  caseSensitive,
}: {
  text: string;
  query: string;
  caseSensitive: boolean;
}) {
  if (!query) return <>{text}</>;
  const haystack = caseSensitive ? text : text.toLowerCase(),
    needle = caseSensitive ? query : query.toLowerCase();
  const pieces: Array<{ text: string; marked: boolean }> = [];
  let cursor = 0;
  while (cursor < text.length && pieces.length < 100) {
    const found = haystack.indexOf(needle, cursor);
    if (found < 0) {
      pieces.push({ text: text.slice(cursor), marked: false });
      cursor = text.length;
      break;
    }
    if (found > cursor) pieces.push({ text: text.slice(cursor, found), marked: false });
    pieces.push({ text: text.slice(found, found + query.length), marked: true });
    cursor = found + query.length;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), marked: false });
  return (
    <>
      {pieces.map((piece, index) =>
        piece.marked ? (
          <mark key={index}>{piece.text}</mark>
        ) : (
          <span key={index}>{piece.text}</span>
        ),
      )}
    </>
  );
}
