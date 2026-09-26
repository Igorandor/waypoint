import { useState } from 'react';
import { download } from '../api';
export const human = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
export function Evidence({ value, level = 0 }: { value: any; level?: number }) {
  if (value == null) return <span className="muted">—</span>;
  if (typeof value === 'boolean')
    return <span className={'badge ' + (value ? 'good' : 'neutral')}>{value ? 'Yes' : 'No'}</span>;
  if (typeof value !== 'object') return <span className="evidence-text">{String(value)}</span>;
  if (level > 6) return <span>Nested evidence is available in the export.</span>;
  const items = Object.entries(value);
  return (
    <dl className="waypoint-evidence">
      {items.slice(0, 100).map(([key, item]) => (
        <div key={key}>
          <dt>{Array.isArray(value) ? Number(key) + 1 : human(key)}</dt>
          <dd>
            {item && typeof item === 'object' ? (
              <EvidenceBranch value={item} level={level + 1} />
            ) : (
              <Evidence value={item} level={level + 1} />
            )}
          </dd>
        </div>
      ))}
      {items.length > 100 && <p>First 100 entries shown; export contains the loaded evidence.</p>}
    </dl>
  );
}
function EvidenceBranch({ value, level }: { value: any; level: number }) {
  const [open, setOpen] = useState(level === 1);
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        {Array.isArray(value) ? value.length + ' items' : Object.keys(value).length + ' properties'}
      </summary>
      {open && <Evidence value={value} level={level} />}
    </details>
  );
}
export function DataView({
  data,
  kind = 'evidence',
}: {
  data: any;
  kind?: string;
  [key: string]: any;
}) {
  const [filter, setFilter] = useState(''),
    [expanded, setExpanded] = useState<number>();
  const list = Array.isArray(data) ? data : undefined;
  const rows = list
    ?.map((value, index) => ({ value, index }))
    .filter((row) => JSON.stringify(row.value).toLowerCase().includes(filter.toLowerCase()));
  return (
    <section className="waypoint-data">
      <div className="evidence-toolbar">
        {list && (
          <input
            aria-label="Filter evidence"
            placeholder="Filter this result…"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setExpanded(undefined);
            }}
          />
        )}
        <button onClick={() => download('waypoint-' + kind + '.json', data)}>
          Export evidence
        </button>
      </div>
      {rows ? (
        <>
          <p className="muted">
            {rows.length} matching / {list!.length} loaded
          </p>
          <div className="evidence-cards">
            {rows.slice(0, 250).map(({ value, index }) => (
              <article key={index}>
                <button
                  aria-expanded={expanded === index}
                  onClick={() => setExpanded(expanded === index ? undefined : index)}
                >
                  <strong>
                    {String(
                      value?.Name ??
                        value?.Alias ??
                        value?.ApplicationName ??
                        value?.Pid ??
                        value?.Id ??
                        value?.ID ??
                        'Entry ' + (index + 1),
                    )}
                  </strong>
                  <span>
                    {typeof value === 'object' && value !== null
                      ? String(
                          value.Description ?? value.FullName ?? value.State ?? 'Inspect evidence',
                        )
                      : String(value)}
                  </span>
                </button>
                {expanded === index && <Evidence value={value} />}
              </article>
            ))}
          </div>
          {rows.length > 250 && <p>First 250 matching entries shown.</p>}
        </>
      ) : (
        <Evidence value={data} />
      )}
    </section>
  );
}
