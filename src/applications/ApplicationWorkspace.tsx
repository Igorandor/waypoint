import { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, Download, RefreshCw } from 'lucide-react';
import {
  appString,
  applicationFields,
  applicationHandler,
  applicationReadiness,
  applicationReviewProcedure,
  applicationRoleMappings,
  authenticationInventory,
  compareApplicationDossiers,
  fieldGroupLabels,
  isApplicationRecord,
  maintenanceChecks,
  relatedApplications,
  validApplicationName,
  type ApplicationDossier,
  type ApplicationRecord,
  type ApplicationSource,
  type FieldGroup,
} from '../../shared/application-insights';
import type { Procedure } from '../../shared/procedure';
import { download, iris, request, RequestError } from '../api';
import { Badge, ErrorBox, Loading, PageHeader } from '../components/ui';
import { Evidence } from '../components/DataView';
import { observeApplication } from './application-observation';
import './applications.css';

function SourceStatus({ source, title }: { source: ApplicationSource; title: string }) {
  return (
    <article className="application-source-card">
      <header>
        <h3>{title}</h3>
        <Badge tone={source.outcome === 'read' ? 'good' : 'neutral'}>{source.outcome}</Badge>
      </header>
      <code>{source.path}</code>
      {source.explanation && <p>{source.explanation}</p>}
      <small>Observed {new Date(source.observedAt).toLocaleString()}</small>
      {source.data && (
        <details>
          <summary>Native response</summary>
          <Evidence value={source.data} />
        </details>
      )}
    </article>
  );
}
function Fact({ name, value }: { name: string; value: unknown }) {
  return (
    <div>
      <dt>{name}</dt>
      <dd>
        {value === undefined
          ? 'Not returned'
          : value === ''
            ? 'Empty'
            : typeof value === 'boolean'
              ? value
                ? 'Yes'
                : 'No'
              : String(value)}
      </dd>
    </div>
  );
}
function AccessContext({ dossier }: { dossier: ApplicationDossier }) {
  const config = dossier.configuration.data ?? {};
  const auth = authenticationInventory(config.AutheEnabled);
  const mappings = applicationRoleMappings(config.MatchRoles);
  return (
    <div className="application-context-grid">
      <section className="panel">
        <h2>Authentication inputs</h2>
        <dl className="application-definition">
          <Fact name="Bitmap" value={config.AutheEnabled} />
          <Fact
            name="Known mechanisms"
            value={auth.valid ? auth.enabled.join(', ') || 'None enabled' : undefined}
          />
          <Fact name="Unrecognized flag value" value={auth.unknown} />
          <Fact name="JWT enabled" value={config.JWTAuthEnabled} />
          <Fact name="Two-factor enabled" value={config.TwoFactorEnabled} />
          <Fact name="Entry resource" value={config.Resource} />
          <Fact
            name="Public resource grants"
            value={dossier.entryResource.data?.PublicPermission}
          />
        </dl>
        <p className="muted">
          These are native configuration inputs. Handler code and the deployed web gateway may
          impose additional checks.
        </p>
      </section>
      <section className="panel">
        <h2>Session behavior</h2>
        <dl className="application-definition">
          <Fact name="Cookie mode" value={config.UseCookies} />
          <Fact name="Cookie path" value={config.CookiePath} />
          <Fact name="Session SameSite" value={config.SessionScope} />
          <Fact name="User-cookie SameSite default" value={config.UserCookieScope} />
          <Fact name="Session timeout (seconds)" value={config.Timeout} />
          <Fact name="Native login CSRF check" value={config.CSRFToken} />
          <Fact name="Authentication group" value={config.GroupById} />
        </dl>
      </section>
      <section className="panel application-wide">
        <h2>Application role mappings</h2>
        {mappings.length ? (
          <div className="application-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Prerequisite role</th>
                  <th>Granted roles</th>
                  <th>Interpretation</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping, index) => (
                  <tr key={index}>
                    <td>{mapping.trigger || 'No matching-role prerequisite'}</td>
                    <td>{mapping.grants.join(', ') || 'No roles returned'}</td>
                    <td>
                      {mapping.malformed
                        ? 'Incomplete or invalid mapping'
                        : mapping.trigger
                          ? 'Conditional application grant'
                          : 'Unconditional application grant'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No mappings were returned.</p>
        )}
        <p className="muted">
          This list does not resolve inherited roles or prove the effective permissions of a
          particular user.
        </p>
      </section>
      <section className="panel application-wide">
        <h2>CORS configuration</h2>
        <dl className="application-definition">
          <Fact name="Credentials allowed" value={config.CorsCredentialsAllowed} />
        </dl>
        <div className="application-context-grid">
          <div>
            <h3>Origins</h3>
            <Evidence value={config.CorsAllowlist ?? 'Not returned'} />
          </div>
          <div>
            <h3>Headers</h3>
            <Evidence value={config.CorsHeadersList ?? 'Not returned'} />
          </div>
        </div>
        <p className="muted">
          Origin entries are displayed as data. Waypoint does not send requests to them.
        </p>
      </section>
    </div>
  );
}
function ConfigurationFields({ dossier }: { dossier: ApplicationDossier }) {
  const [group, setGroup] = useState<FieldGroup>('routing');
  const configuration = dossier.configuration.data ?? {};
  return (
    <section className="panel">
      <div className="application-section-heading">
        <h2>Selected configuration fields</h2>
        <label>
          Field group
          <select value={group} onChange={(event) => setGroup(event.target.value as FieldGroup)}>
            {Object.entries(fieldGroupLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {applicationFields
        .filter((field) => field.group === group)
        .map((field) => (
          <article className="application-field-record" key={field.key}>
            <h3>
              {field.label} <code>{field.key}</code>
            </h3>
            <p>{field.consequence}</p>
            <Evidence
              value={
                Object.hasOwn(configuration, field.key)
                  ? configuration[field.key]
                  : 'Not returned by this source'
              }
            />
          </article>
        ))}
    </section>
  );
}
function Comparison({ before, after }: { before: ApplicationDossier; after: ApplicationDossier }) {
  const [changesOnly, setChangesOnly] = useState(true);
  const [group, setGroup] = useState('all');
  const compared = compareApplicationDossiers(before, after);
  const rows = compared.fields.filter(
    (field) =>
      (!changesOnly || !['same', 'unavailable'].includes(field.status)) &&
      (group === 'all' || field.group === group),
  );
  return (
    <section className="panel">
      <h2>Configuration comparison</h2>
      <p>{compared.reason}</p>
      <dl className="application-definition">
        <Fact name="Baseline" value={new Date(before.capturedAt).toLocaleString()} />
        <Fact name="Current observation" value={new Date(after.capturedAt).toLocaleString()} />
      </dl>
      {compared.comparable && (
        <>
          <div className="application-comparison-filters">
            <label>
              <input
                type="checkbox"
                checked={changesOnly}
                onChange={(event) => setChangesOnly(event.target.checked)}
              />{' '}
              Show differences only
            </label>
            <label>
              Group
              <select value={group} onChange={(event) => setGroup(event.target.value)}>
                <option value="all">All field groups</option>
                {Object.entries(fieldGroupLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {rows.length ? (
            rows.map((row) => (
              <article key={row.key} className="application-field-record">
                <header>
                  <h3>{row.label}</h3>
                  <Badge>{row.status.replaceAll('-', ' ')}</Badge>
                </header>
                <p>{row.consequence}</p>
                <div className="application-context-grid">
                  <div>
                    <h4>Baseline</h4>
                    <Evidence value={row.before === undefined ? 'Not returned' : row.before} />
                  </div>
                  <div>
                    <h4>Current</h4>
                    <Evidence value={row.after === undefined ? 'Not returned' : row.after} />
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p>No differences match these filters.</p>
          )}
        </>
      )}
    </section>
  );
}
function Prerequisites({
  dossier,
  onSave,
  saving,
  saved,
}: {
  dossier: ApplicationDossier;
  onSave: () => void;
  saving: boolean;
  saved: string;
}) {
  const checks = maintenanceChecks(dossier);
  const [completed, setCompleted] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState(false);
  function exportReview() {
    download('waypoint-application-readiness.json', {
      format: 'waypoint-application-readiness-1',
      exportedAt: new Date().toISOString(),
      application: dossier.application,
      capturedAt: dossier.capturedAt,
      checks: checks.map((check) => ({
        ...check,
        checkedByOperator: completed.includes(check.id),
      })),
      notes,
      evidence: dossier,
      limitation:
        'Browser checklist only; no change was authorized or executed by checking these items.',
    });
  }
  return (
    <section className="panel">
      <h2>Maintenance prerequisites</h2>
      <p>
        Review these items before opening a maintenance window. Export before refreshing the
        observation or leaving this workspace. Saving a procedure creates reusable steps in the
        library.
      </p>
      <div className="application-prerequisites">
        {checks.map((check) => (
          <label key={check.id}>
            <input
              type="checkbox"
              checked={completed.includes(check.id)}
              onChange={(event) =>
                setCompleted(
                  event.target.checked
                    ? [...completed, check.id]
                    : completed.filter((id) => id !== check.id),
                )
              }
            />
            <span>
              <strong>{check.title}</strong>
              <small>{check.detail}</small>
              <Badge>{check.source === 'native' ? 'Native evidence' : 'Operator check'}</Badge>
            </span>
          </label>
        ))}
      </div>
      <label className="field">
        Operator notes
        <textarea
          value={notes}
          maxLength={4000}
          rows={4}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Decision, responsible operator and verification plan"
        />
      </label>
      <p>
        {completed.length} of {checks.length} prerequisites checked. Checked items do not authorize
        a native change.
      </p>
      <div className="inline-actions">
        <button onClick={exportReview}>
          <Download size={16} /> Export checklist and evidence
        </button>
        <button onClick={() => setPreview(!preview)} aria-expanded={preview}>
          {preview ? 'Hide procedure preview' : 'Preview reusable procedure'}
        </button>
      </div>
      {preview && (
        <div className="application-procedure-preview">
          <h3>Procedure steps</h3>
          <ol>
            {applicationReviewProcedure(dossier).steps.map((step) => (
              <li key={step.id}>
                <strong>{step.title}</strong>
                <p>{step.instruction}</p>
              </li>
            ))}
          </ol>
          <button className="primary" disabled={saving || Boolean(saved)} onClick={onSave}>
            <ClipboardCheck size={16} />
            {saving ? 'Saving…' : saved ? 'Procedure saved' : 'Save procedure to library'}
          </button>
          {saved && (
            <p role="status">
              Procedure saved. <a href="#procedures">Open procedure library</a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
type View =
  'readiness' | 'access' | 'dependencies' | 'compare' | 'prerequisites' | 'fields' | 'sources';
const viewLabels: Record<View, string> = {
  readiness: 'Readiness',
  access: 'Access context',
  dependencies: 'Dependencies',
  compare: 'Compare',
  prerequisites: 'Prerequisites',
  fields: 'Configuration',
  sources: 'Source evidence',
};
export function ApplicationWorkspace() {
  const [inventory, setInventory] = useState<ApplicationRecord[]>([]);
  const [inventoryAt, setInventoryAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inventoryError, setInventoryError] = useState('');
  const [search, setSearch] = useState('');
  const [namespace, setNamespace] = useState('all');
  const [enabled, setEnabled] = useState('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState('');
  const [dossier, setDossier] = useState<ApplicationDossier>();
  const [baseline, setBaseline] = useState<ApplicationDossier>();
  const [view, setView] = useState<View>('readiness');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const sequence = useRef(0);
  const listSequence = useRef(0);
  async function loadInventory() {
    const current = ++listSequence.current;
    setLoading(true);
    try {
      const result = (await iris('/v2/web-apps')).data;
      if (!Array.isArray(result) || result.some((row) => !isApplicationRecord(row)))
        throw new Error('The native application inventory is not a record list.');
      if (result.length > 2000)
        throw new Error(
          'This workspace supports up to 2,000 applications. Use the command station for a larger inventory.',
        );
      if (current !== listSequence.current) return;
      setInventory(result);
      setInventoryAt(new Date().toISOString());
      setInventoryError('');
    } catch (cause) {
      if (current === listSequence.current) {
        if (cause instanceof RequestError && cause.status === 403) {
          setInventory([]);
          setInventoryAt('');
        }
        setInventoryError((cause as Error).message);
      }
    } finally {
      if (current === listSequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    void loadInventory();
    return () => {
      sequence.current++;
      listSequence.current++;
    };
  }, []);
  async function inspect(name: string, keepBaseline = false) {
    const current = ++sequence.current;
    setSelected(name);
    setBusy(true);
    setError('');
    setSaved('');
    if (!keepBaseline) {
      setDossier(undefined);
      setBaseline(undefined);
      setView('readiness');
    }
    try {
      const result = await observeApplication(name);
      if (current === sequence.current) setDossier(result);
    } catch (cause) {
      if (current === sequence.current) setError((cause as Error).message);
    } finally {
      if (current === sequence.current) setBusy(false);
    }
  }
  async function saveProcedure() {
    if (!dossier || saving) return;
    setSaving(true);
    setError('');
    const current = sequence.current;
    try {
      const procedure = await request<Procedure>('procedures', applicationReviewProcedure(dossier));
      if (current === sequence.current) setSaved(procedure.id);
    } catch (cause) {
      if (current === sequence.current) setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const namespaces = [
    ...new Set(inventory.map((row) => appString(row.NameSpace)).filter(Boolean)),
  ].sort();
  const filtered = inventory.filter((row) => {
    const text = [row.Name, row.NameSpace, row.Description, row.DispatchClass]
      .filter((value) => typeof value === 'string')
      .join(' ')
      .toLowerCase();
    return (
      text.includes(search.trim().toLowerCase()) &&
      (namespace === 'all' || row.NameSpace === namespace) &&
      (enabled === 'all' || (enabled === 'yes' ? row.Enabled === true : row.Enabled === false))
    );
  });
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages - 1);
  const readiness = dossier ? applicationReadiness(dossier) : [];
  return (
    <div className="waypoint-applications">
      <PageHeader
        title={selected || 'Application readiness'}
        description={
          selected
            ? 'Configuration evidence and maintenance prerequisites.'
            : 'Choose an application to inspect before a maintenance window.'
        }
      >
        {selected ? (
          <>
            <button
              disabled={busy || saving}
              onClick={() => {
                sequence.current++;
                setSelected('');
                setDossier(undefined);
                setBaseline(undefined);
                setError('');
                setBusy(false);
              }}
            >
              All applications
            </button>
            <button disabled={busy || saving} onClick={() => void inspect(selected, true)}>
              <RefreshCw size={16} /> Refresh observation
            </button>
            <button
              disabled={!dossier || busy}
              onClick={() =>
                dossier &&
                download('waypoint-application-evidence.json', {
                  format: 'waypoint-application-evidence-1',
                  dossier,
                  baseline,
                })
              }
            >
              <Download size={16} /> Export evidence
            </button>
          </>
        ) : (
          <button disabled={loading} onClick={() => void loadInventory()}>
            <RefreshCw size={16} /> Refresh inventory
          </button>
        )}
      </PageHeader>
      {error && <ErrorBox error={error} />}
      {inventoryError && <ErrorBox error={'Application inventory: ' + inventoryError} />}
      {!selected && (
        <>
          <div className="application-inventory-filters">
            <label>
              Search applications
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
                placeholder="Path, namespace, description or class"
              />
            </label>
            <label>
              Namespace
              <select
                value={namespace}
                onChange={(event) => {
                  setNamespace(event.target.value);
                  setPage(0);
                }}
              >
                <option value="all">All namespaces</option>
                {namespaces.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Native enabled state
              <select
                value={enabled}
                onChange={(event) => {
                  setEnabled(event.target.value);
                  setPage(0);
                }}
              >
                <option value="all">Any state</option>
                <option value="yes">Enabled</option>
                <option value="no">Disabled</option>
              </select>
            </label>
          </div>
          {loading ? (
            <Loading />
          ) : filtered.length ? (
            <>
              <div className="application-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Application</th>
                      <th>Namespace</th>
                      <th>Enabled</th>
                      <th>Handler from inventory</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(currentPage * 20, currentPage * 20 + 20).map((row, index) => {
                      const name = appString(row.Name);
                      return (
                        <tr key={name + index}>
                          <td>
                            <button
                              disabled={!validApplicationName(name)}
                              onClick={() => void inspect(name)}
                            >
                              {name || 'Unnamed row'}
                            </button>
                          </td>
                          <td>{appString(row.NameSpace) || 'Not returned'}</td>
                          <td>
                            {typeof row.Enabled === 'boolean'
                              ? row.Enabled
                                ? 'Yes'
                                : 'No'
                              : 'Unknown'}
                          </td>
                          <td>{applicationHandler(row)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="application-pagination">
                <span>
                  {filtered.length} applications · page {currentPage + 1} of {pages}
                </span>
                <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                  Previous
                </button>
                <button
                  disabled={currentPage + 1 >= pages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </button>
              </div>
            </>
          ) : !inventoryAt ? (
            <section className="panel">
              <h2>Application inventory unavailable</h2>
              <p>Use Refresh inventory to try again.</p>
            </section>
          ) : (
            <section className="panel">
              <h2>No matching applications</h2>
              <p>Adjust the filters or refresh the native inventory.</p>
            </section>
          )}
          {inventoryAt && (
            <p className="muted">
              Inventory read {new Date(inventoryAt).toLocaleString()}. Open an application for its
              current detail record.
            </p>
          )}
        </>
      )}
      {selected && busy && <Loading />}
      {selected && dossier && (
        <>
          <section className="application-overview">
            <div>
              <small>Native enabled state</small>
              <strong>
                {typeof dossier.configuration.data?.Enabled === 'boolean'
                  ? dossier.configuration.data.Enabled
                    ? 'Enabled'
                    : 'Disabled'
                  : 'Unavailable'}
              </strong>
            </div>
            <div>
              <small>Namespace</small>
              <strong>{appString(dossier.configuration.data?.NameSpace) || 'Unavailable'}</strong>
            </div>
            <div>
              <small>Handler</small>
              <strong>{applicationHandler(dossier.configuration.data ?? {})}</strong>
            </div>
          </section>
          <nav className="application-view-tabs" aria-label="Application workspace views">
            {Object.entries(viewLabels).map(([key, label]) => (
              <button key={key} aria-pressed={view === key} onClick={() => setView(key as View)}>
                {label}
              </button>
            ))}
          </nav>
          {view === 'readiness' && (
            <section className="panel">
              <div className="application-section-heading">
                <h2>Configuration review points</h2>
                <Badge>
                  {readiness.filter((item) => item.status === 'review').length} to review
                </Badge>
              </div>
              <p>
                Review points describe configuration and missing evidence. They are not a
                penetration test or a runtime authorization verdict.
              </p>
              <div className="application-readiness-list">
                {readiness.map((item) => (
                  <article key={item.id}>
                    <header>
                      <h3>{item.title}</h3>
                      <Badge tone={item.status === 'observed' ? 'good' : 'neutral'}>
                        {item.status}
                      </Badge>
                    </header>
                    <p>{item.detail}</p>
                    {item.fields.length > 0 && (
                      <small>Native fields: {item.fields.join(', ')}</small>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {view === 'access' && <AccessContext dossier={dossier} />}
          {view === 'dependencies' && (
            <>
              <section className="panel">
                <h2>Execution dependencies</h2>
                <dl className="application-definition">
                  <Fact name="Namespace" value={dossier.configuration.data?.NameSpace} />
                  <Fact name="Default globals database" value={dossier.namespace.data?.Globals} />
                  <Fact name="Default routines database" value={dossier.namespace.data?.Routines} />
                  <Fact
                    name="Temporary globals database"
                    value={dossier.namespace.data?.TempGlobals}
                  />
                  <Fact name="Entry resource" value={dossier.configuration.data?.Resource} />
                </dl>
                <p className="muted">
                  These are configured names. Namespace mappings, database health and deployment
                  files are not inspected here.
                </p>
              </section>
              <section className="panel">
                <h2>Related inventory entries</h2>
                <p>
                  Relationships come from route boundaries, namespace names and any authentication
                  groups returned by the inventory. They do not establish request routing
                  precedence.
                </p>
                <div className="application-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Application</th>
                        <th>Observed relationship</th>
                        <th>Enabled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatedApplications(
                        selected,
                        dossier.configuration.data ?? {},
                        inventory,
                      ).map((item) => (
                        <tr key={item.name}>
                          <td>
                            <button
                              disabled={busy || saving}
                              onClick={() => void inspect(item.name)}
                            >
                              {item.name}
                            </button>
                          </td>
                          <td>{item.reasons.join(' · ')}</td>
                          <td>
                            {item.enabled === undefined ? 'Unknown' : item.enabled ? 'Yes' : 'No'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {view === 'compare' && (
            <>
              <section className="panel">
                <h2>Comparison baseline</h2>
                <p>
                  Keep an observation in this page, refresh the native record after your work, then
                  compare selected fields. The baseline is discarded when you choose another
                  application or leave this workspace.
                </p>
                <button
                  disabled={busy || dossier.configuration.outcome !== 'read'}
                  onClick={() => setBaseline(structuredClone(dossier))}
                >
                  {baseline
                    ? 'Replace baseline with current observation'
                    : 'Keep current observation as baseline'}
                </button>
                {baseline && (
                  <button disabled={busy} onClick={() => setBaseline(undefined)}>
                    Clear baseline
                  </button>
                )}
              </section>
              {baseline && <Comparison before={baseline} after={dossier} />}
            </>
          )}
          <div hidden={view !== 'prerequisites'}>
            <Prerequisites
              key={dossier.capturedAt}
              dossier={dossier}
              onSave={() => void saveProcedure()}
              saving={saving}
              saved={saved}
            />
          </div>
          {view === 'fields' && <ConfigurationFields dossier={dossier} />}
          {view === 'sources' && (
            <div className="application-source-grid">
              <SourceStatus source={dossier.configuration} title="Application configuration" />
              <SourceStatus source={dossier.namespace} title="Namespace configuration" />
              <SourceStatus source={dossier.entryResource} title="Entry resource" />
            </div>
          )}
          <p className="application-observation-time">
            Captured {new Date(dossier.capturedAt).toLocaleString()}. Sources are read separately.
            No request was sent to the application endpoint.
          </p>
        </>
      )}
    </div>
  );
}
