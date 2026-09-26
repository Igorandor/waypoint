import { useState } from 'react';
import { readablePaths, parameters } from '../../shared/schema';
import { iris, request } from '../api';
import { DataView } from '../components/DataView';
import { ErrorBox, PageHeader } from '../components/ui';
type Source = { path: string; title: string; method?: 'POST'; query?: Record<string, string> };
const observations: Source[] = [
  { path: '/extension/telemetry', title: 'Host capacity and CPU counters' },
  { path: '/v2/monitor/dashboard/main', title: 'IRIS dashboard' },
  { path: '/info', title: 'Instance and privileges' },
];
const logs: Source[] = [
  { path: '/extension/logs', title: 'Messages log', query: { source: 'messages', limit: '200' } },
  { path: '/extension/logs', title: 'Alerts log', query: { source: 'alerts', limit: '200' } },
  { path: '/v2/security/audit/records', title: 'Audit records', method: 'POST' },
  { path: '/v2/task/history', title: 'Task history' },
  { path: '/v2/journal/files', title: 'Journal files' },
  { path: 'activity', title: 'This session’s command receipts' },
];
function size(value: number) {
  return (value / 1024 ** 3).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' GiB';
}
function Capacity({ data }: { data: any }) {
  const cards = [
    { name: 'Memory in use', total: data?.memory?.total, available: data?.memory?.available },
    { name: 'Disk in use', total: data?.disk?.total, available: data?.disk?.free },
  ];
  return (
    <div className="capacity-cards">
      {cards.map((card) => {
        const valid =
          Number.isFinite(card.total) &&
          card.total > 0 &&
          Number.isFinite(card.available) &&
          card.available >= 0 &&
          card.available <= card.total;
        return (
          <article key={card.name}>
            <h3>{card.name}</h3>
            {valid ? (
              <>
                <strong>{((1 - card.available / card.total) * 100).toFixed(1)}%</strong>
                <meter min={0} max={card.total} value={card.total - card.available} />
                <p>
                  {size(card.available)} available / {size(card.total)}
                </p>
              </>
            ) : (
              <p>Unavailable</p>
            )}
          </article>
        );
      })}
      <article>
        <h3>CPU observation</h3>
        <strong>{data?.cpu?.logicalCount ?? '—'} logical CPUs</strong>
        <p>Load average: {data?.cpu?.loadAverage?.join(' / ') ?? 'Unavailable'}</p>
        <small>
          Cumulative ticks are shown below; they are not an instantaneous CPU percentage.
        </small>
      </article>
    </div>
  );
}
export function Observations({ area }: { area: string }) {
  const sources: Source[] =
    area === 'logs'
      ? logs
      : area === 'explorer'
        ? readablePaths.map((item) => ({ path: item.path, title: item.summary }))
        : observations;
  const [selected, setSelected] = useState(0),
    [query, setQuery] = useState<Record<string, string>>(sources[0].query ?? {}),
    [result, setResult] = useState<any>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [captured, setCaptured] = useState('');
  const source = sources[selected];
  const fields =
    source.path === '/extension/logs'
      ? [{ name: 'source', required: true }, { name: 'limit' }]
      : parameters(source.path, source.method ?? 'GET');
  async function collect() {
    setBusy(true);
    setError('');
    setResult(undefined);
    setCaptured('');
    try {
      const result =
        source.path === 'activity'
          ? await request('activity')
          : (
              await iris(
                source.path,
                Object.fromEntries(Object.entries(query).filter(([, value]) => value)),
                source.method ?? 'GET',
                source.method ? {} : undefined,
              )
            ).data;
      setResult(result);
      setCaptured(new Date().toLocaleString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title={
          area === 'logs'
            ? 'Log observations'
            : area === 'explorer'
              ? 'Native API observations'
              : 'Instance watch'
        }
        description="Capture a bounded read from IRIS. Every result remains labelled with its source and collection time."
      />
      <section className="observation-controls panel">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void collect();
          }}
        >
          <fieldset disabled={busy}>
            <label className="field">
              Observation source
              <select
                value={selected}
                onChange={(event) => {
                  const next = +event.target.value;
                  setSelected(next);
                  setQuery(sources[next].query ?? {});
                  setResult(undefined);
                  setCaptured('');
                  setError('');
                }}
              >
                {sources.map((item, index) => (
                  <option key={index} value={index}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="observation-parameters">
              {fields.map((field) => (
                <label key={field.name} className="field">
                  {field.name}
                  {field.required ? ' *' : ''}
                  <input
                    required={!!field.required}
                    value={query[field.name] ?? ''}
                    onChange={(event) => {
                      setQuery({ ...query, [field.name]: event.target.value });
                      setResult(undefined);
                      setCaptured('');
                    }}
                  />
                </label>
              ))}
            </div>
            <button className="primary" disabled={busy}>
              {busy ? 'Collecting…' : 'Collect observation'}
            </button>
          </fieldset>
        </form>
      </section>
      {error && <ErrorBox error={error} />}
      <section className="observation-result panel">
        <h2>{source.title}</h2>
        {source.path === '/v2/monitor/dashboard/main' &&
          result &&
          result.Status?.SystemMonitor !== true && (
            <p className="error-box">
              System monitor is not updating; returned performance values may be stale.
            </p>
          )}
        <p className="muted">
          {captured ? 'Collected ' + captured : 'No observation collected yet.'}
        </p>
        {source.path === '/extension/telemetry' && result && (
          <>
            <p>{result.scope}</p>
            <Capacity data={result} />
          </>
        )}
        {result !== undefined && <DataView key={captured} data={result} kind={area} />}
      </section>
    </>
  );
}
