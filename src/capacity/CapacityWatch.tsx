import { useEffect, useRef, useState } from 'react';
import { Download, Pause, Play, RefreshCw } from 'lucide-react';
import {
  capacityPoint,
  compareCapacitySamples,
  exportCapacitySession,
  formatMeasurement,
  metricTitles,
  seriesStatistics,
  thresholdFindings,
  type CapacityMetric,
  type CapacityPoint,
  type CapacityReading,
  type CapacitySample,
  type CapacityThresholds,
} from '../../shared/capacity-observations';
import { iris, download, request } from '../api';
import { ErrorBox, PageHeader } from '../components/ui';
import { Evidence } from '../components/DataView';
import './capacity.css';

const percentageMetrics: CapacityMetric[] = ['memoryUsed', 'diskUsed', 'cpuBusy'];
export function CapacityWatch() {
  const [samples, setSamples] = useState<CapacitySample[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [stopAt, setStopAt] = useState(0);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState('');
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [metric, setMetric] = useState<CapacityMetric>('memoryUsed');
  const [thresholds, setThresholds] = useState<CapacityThresholds>({
    memoryUsed: 85,
    diskUsed: 85,
    cpuBusy: 90,
  });
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const points = samples.map((sample, index) => capacityPoint(sample, samples[index - 1]));
  const latest = points.at(-1);
  const findings = thresholdFindings(points, thresholds);
  const chosen = samples.find((sample) => sample.id === selected);
  const baseline = samples.find((sample) => sample.id === before);
  const comparison = samples.find((sample) => sample.id === after);
  async function collect() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    const started = Date.now(),
      requestedAt = new Date().toISOString();
    let data: CapacityReading | undefined, failure: string | undefined;
    try {
      data = (await iris<CapacityReading>('/extension/telemetry')).data;
    } catch (cause) {
      failure = (cause as Error).message;
    }
    if (mounted.current) {
      const sample: CapacitySample = {
        id: crypto.randomUUID(),
        requestedAt,
        receivedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        data,
        error: failure,
      };
      setSamples((previous) => [...previous, sample].slice(-120));
      if (failure) {
        setError(failure);
        setRunning(false);
        setNotice(
          'Sampling stopped after a read failure. Refresh manually after resolving access or connectivity.',
        );
      }
      setBusy(false);
    }
    inFlight.current = false;
  }
  useEffect(() => {
    mounted.current = true;
    const hidden = () => {
      if (document.hidden) {
        setRunning(false);
        setNotice('Sampling stopped because the page was hidden.');
      }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      if (Date.now() >= stopAt) {
        setRunning(false);
        setNotice('The requested watch duration ended.');
        return;
      }
      if (document.hidden) {
        setRunning(false);
        return;
      }
      void collect();
    }, intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [running, intervalSeconds, stopAt]);
  function start() {
    setStopAt(Date.now() + durationMinutes * 60_000);
    setNotice('');
    setRunning(true);
    void collect();
  }
  async function saveProcedure() {
    setBusy(true);
    setError('');
    try {
      await request('procedures', {
        title: 'Capacity review',
        description:
          'Record host-visible capacity and review available space before an operational change.',
        expectedOutcome: 'A capacity observation and a recorded operator decision.',
        tags: ['capacity', 'readiness'],
        steps: [
          {
            id: 'capacity',
            kind: 'observation',
            title: 'Read host capacity',
            instruction: 'Check host scope, disk path, available memory and disk space.',
            source: 'capacity',
            target: '',
          },
          {
            id: 'review',
            kind: 'checklist',
            title: 'Confirm capacity readiness',
            instruction: 'Use the native system and workload requirements when judging headroom.',
            items: [
              {
                id: 'scope',
                text: 'Confirm the reported host and filesystem scope',
                required: true,
              },
              {
                id: 'headroom',
                text: 'Review memory and disk headroom for the planned work',
                required: true,
              },
              {
                id: 'monitoring',
                text: 'Agree how capacity will be monitored during the change',
                required: true,
              },
            ],
            requireNote: true,
            reference: '',
          },
        ],
      });
      setNotice('Capacity review saved to the procedure library.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="waypoint-capacity-watch">
      <PageHeader
        title="Capacity watch"
        description="Compare bounded host observations during an operational change."
      >
        <button disabled={busy} onClick={() => void collect()}>
          <RefreshCw size={16} />
          Read capacity
        </button>
        <button
          disabled={!samples.length}
          onClick={() =>
            download('waypoint-capacity-session.json', exportCapacitySession(samples, thresholds))
          }
        >
          <Download size={16} />
          Export session
        </button>
      </PageHeader>
      {error && <ErrorBox error={error} />}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <section className="panel watch-controls">
        <label className="field">
          Interval
          <select
            value={intervalSeconds}
            disabled={running}
            onChange={(event) => setIntervalSeconds(+event.target.value)}
          >
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
            <option value={120}>2 minutes</option>
            <option value={300}>5 minutes</option>
          </select>
        </label>
        <label className="field">
          Stop after
          <select
            value={durationMinutes}
            disabled={running}
            onChange={(event) => setDurationMinutes(+event.target.value)}
          >
            <option value={5}>5 minutes</option>
            <option value={10}>10 minutes</option>
            <option value={15}>15 minutes</option>
          </select>
        </label>
        {running ? (
          <button
            onClick={() => {
              setRunning(false);
              setNotice('Sampling stopped by operator.');
            }}
          >
            <Pause size={16} />
            Stop watch
          </button>
        ) : (
          <button disabled={busy} onClick={start}>
            <Play size={16} />
            Start bounded watch
          </button>
        )}
        <p>
          {running
            ? 'Sampling until ' + new Date(stopAt).toLocaleTimeString()
            : 'Manual reads are available without starting a watch.'}{' '}
          At most one read is in flight. Leaving this page or hiding the browser stops the watch.
        </p>
      </section>
      <p className="muted">
        The newest 120 samples stay in this page’s memory. Export them before navigating away. These
        observations describe the operating system visible to IRIS; container limits may differ.
      </p>
      <div className="watch-metrics">
        {percentageMetrics.map((key) => (
          <article className="panel" key={key}>
            <h3>{metricTitles[key]}</h3>
            <strong>{latest ? formatMeasurement(latest[key]) : 'No samples'}</strong>
            {latest?.[key].value !== undefined ? (
              <meter min={0} max={100} value={latest[key].value} />
            ) : (
              <p>{latest?.[key].reason ?? 'Read capacity to begin.'}</p>
            )}
            <small>
              {key === 'cpuBusy'
                ? 'Measured between consecutive native counter readings.'
                : 'Point-in-time reading.'}
            </small>
          </article>
        ))}
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Observation timeline</h2>
          <label className="field">
            Metric
            <select
              value={metric}
              onChange={(event) => setMetric(event.target.value as CapacityMetric)}
            >
              {Object.entries(metricTitles).map(([key, title]) => (
                <option value={key} key={key}>
                  {title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <CapacityChart points={points} metric={metric} />
        <SeriesSummary points={points} metric={metric} />
      </section>
      <section className="panel">
        <h2>Review thresholds</h2>
        <p>
          Thresholds highlight the current page’s readings. They do not send notifications, change
          IRIS or constitute an availability check.
        </p>
        <div className="watch-thresholds">
          {(['memoryUsed', 'diskUsed', 'cpuBusy'] as const).map((key) => (
            <label className="field" key={key}>
              {metricTitles[key]} (%)
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={thresholds[key]}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isInteger(value) && value >= 1 && value <= 100)
                    setThresholds({ ...thresholds, [key]: value });
                }}
              />
            </label>
          ))}
        </div>
        {findings.length ? (
          <ul>
            {findings.map((finding) => (
              <li key={finding.metric}>
                {metricTitles[finding.metric]} is {finding.value.toFixed(1)}%, at or above{' '}
                {finding.threshold}% in {finding.consecutive} consecutive loaded readings.
              </li>
            ))}
          </ul>
        ) : (
          <p>
            No latest measured value exceeds the selected thresholds. Missing readings remain
            unknown.
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Before and after</h2>
        <p>
          Choose two captured points to compare headroom. This does not identify which operation
          caused a difference.
        </p>
        <div className="watch-compare-selectors">
          <label className="field">
            Before
            <select value={before} onChange={(event) => setBefore(event.target.value)}>
              <option value="">Choose a reading</option>
              {samples.map((sample, index) => (
                <option value={sample.id} key={sample.id}>
                  {index + 1} · {new Date(sample.receivedAt).toLocaleTimeString()}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            After
            <select value={after} onChange={(event) => setAfter(event.target.value)}>
              <option value="">Choose a reading</option>
              {samples.map((sample, index) => (
                <option value={sample.id} key={sample.id}>
                  {index + 1} · {new Date(sample.receivedAt).toLocaleTimeString()}
                </option>
              ))}
            </select>
          </label>
        </div>
        {baseline && comparison && (
          <div
            className="table-wrap watch-table-scroll"
            role="region"
            aria-label="Capacity comparison table"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Difference</th>
                </tr>
              </thead>
              <tbody>
                {compareCapacitySamples(baseline, comparison).map((row) => (
                  <tr key={row.metric}>
                    <td>
                      {metricTitles[row.metric]}
                      <small className="comparison-explanation">{row.meaning}</small>
                    </td>
                    <td>{formatMeasurement(row.before)}</td>
                    <td>{formatMeasurement(row.after)}</td>
                    <td>
                      {row.delta === undefined
                        ? 'Not comparable'
                        : row.before.unit === '%'
                          ? row.delta.toFixed(1) + ' percentage points'
                          : formatMeasurement({ value: row.delta, unit: row.before.unit })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Readings and annotations</h2>
        <div
          className="table-wrap watch-table-scroll"
          role="region"
          aria-label="Capacity readings table"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Received</th>
                <th>Read latency</th>
                <th>Memory used</th>
                <th>Disk used</th>
                <th>CPU interval</th>
                <th>Note</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((sample, index) => (
                <tr key={sample.id}>
                  <td>{new Date(sample.receivedAt).toLocaleTimeString()}</td>
                  <td>{sample.durationMs} ms</td>
                  <td>{formatMeasurement(points[index].memoryUsed)}</td>
                  <td>{formatMeasurement(points[index].diskUsed)}</td>
                  <td>{formatMeasurement(points[index].cpuBusy)}</td>
                  <td>{sample.note ?? ''}</td>
                  <td>
                    <button onClick={() => setSelected(sample.id)}>Inspect</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!samples.length && <p>No readings have been captured.</p>}
        {chosen && (
          <div className="watch-inspector">
            <div className="section-heading">
              <h3>Captured {new Date(chosen.receivedAt).toLocaleString()}</h3>
              <button onClick={() => setSelected('')}>Close</button>
            </div>
            {chosen.error && <ErrorBox error={chosen.error} />}
            <label className="field">
              Observation note
              <textarea
                maxLength={1000}
                value={chosen.note ?? ''}
                onChange={(event) =>
                  setSamples((previous) =>
                    previous.map((sample) =>
                      sample.id === chosen.id ? { ...sample, note: event.target.value } : sample,
                    ),
                  )
                }
              />
            </label>
            <Evidence value={chosen.data} />
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Repeatable capacity review</h2>
        <p>
          Save a procedure when the observation and an operator checkpoint should be retained across
          sessions. The procedure reads fresh native data when its steps are run.
        </p>
        <button disabled={busy} onClick={() => void saveProcedure()}>
          Save capacity review procedure
        </button>
        <a href="#procedures"> Open procedure library</a>
      </section>
    </div>
  );
}
function SeriesSummary({ points, metric }: { points: CapacityPoint[]; metric: CapacityMetric }) {
  const stats = seriesStatistics(points, metric),
    unit = points.at(-1)?.[metric].unit ?? '';
  return (
    <dl className="dossier-facts">
      <div>
        <dt>Measured / missing</dt>
        <dd>
          {stats.measured} / {stats.missing}
        </dd>
      </div>
      {(['minimum', 'maximum', 'average', 'median'] as const).map((key) => (
        <div key={key}>
          <dt>{key[0].toUpperCase() + key.slice(1)}</dt>
          <dd>{formatMeasurement({ value: stats[key], unit })}</dd>
        </div>
      ))}
    </dl>
  );
}
function CapacityChart({ points, metric }: { points: CapacityPoint[]; metric: CapacityMetric }) {
  const width = 900,
    height = 240,
    padding = 38;
  const values = points.flatMap((point) =>
    point[metric].value === undefined ? [] : [point[metric].value!],
  );
  const maximum = percentageMetrics.includes(metric) ? 100 : Math.max(...values, 1);
  const stamps = points.map((point) => Date.parse(point.at));
  const first = stamps[0] ?? 0,
    last = stamps.at(-1) ?? 1;
  const x = (index: number) =>
    padding + ((stamps[index] - first) / Math.max(last - first, 1)) * (width - 2 * padding);
  const y = (value: number) => height - padding - (value / maximum) * (height - 2 * padding);
  const segments: string[] = [];
  let active = '';
  points.forEach((point, index) => {
    const value = point[metric].value;
    if (value === undefined) {
      if (active) segments.push(active);
      active = '';
    } else active += (active ? ' L ' : 'M ') + x(index) + ' ' + y(value);
  });
  if (active) segments.push(active);
  if (!values.length)
    return (
      <div className="watch-chart-empty">
        No valid readings for {metricTitles[metric].toLowerCase()} yet.
      </div>
    );
  return (
    <svg
      className="watch-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={metricTitles[metric] + ' over captured time; missing samples create gaps'}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
        <g key={fraction}>
          <line
            x1={padding}
            x2={width - padding}
            y1={y(maximum * fraction)}
            y2={y(maximum * fraction)}
            className="watch-grid"
          />
          <text x={padding - 5} y={y(maximum * fraction) + 4} textAnchor="end">
            {(maximum * fraction).toLocaleString(undefined, {
              maximumFractionDigits: 1,
              notation: 'compact',
            })}
          </text>
        </g>
      ))}
      {segments.map((path, index) => (
        <path key={index} d={path} className="watch-line" />
      ))}
      {points.map((point, index) =>
        point[metric].value === undefined ? null : (
          <circle
            key={point.id}
            cx={x(index)}
            cy={y(point[metric].value!)}
            r={3}
            className="watch-dot"
          >
            <title>
              {new Date(point.at).toLocaleTimeString() + ': ' + formatMeasurement(point[metric])}
            </title>
          </circle>
        ),
      )}
      <text x={padding} y={height - 5}>
        {new Date(first).toLocaleTimeString()}
      </text>
      <text x={width - padding} y={height - 5} textAnchor="end">
        {new Date(last).toLocaleTimeString()}
      </text>
    </svg>
  );
}
