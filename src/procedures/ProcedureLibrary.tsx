import { useEffect, useRef, useState } from 'react';
import { Archive, Copy, Download, Edit3, Play, Plus, RefreshCw, Upload } from 'lucide-react';
import {
  observationSources,
  type Procedure,
  type ProcedureBody,
  type ProcedureSummary,
} from '../../shared/procedure';
import {
  parseProcedureImportText,
  PROCEDURE_IMPORT_TEXT_BYTES,
} from '../../shared/procedure-import';
import { request, download, RequestError } from '../api';
import { Badge, ErrorBox, Loading, Modal, PageHeader } from '../components/ui';
import { ProcedureEditor, blankProcedure } from './ProcedureEditor';
import { ProcedurePlanner, ProcedureReadiness } from './ProcedurePlanner';
import { ProcedureVersionDiff } from './ProcedureVersionDiff';
import { readProtected, readProtectedRecord, refreshProtected } from '../protected-read';
import './procedures.css';

export function ProcedureLibrary() {
  const [list, setList] = useState<ProcedureSummary[]>([]);
  const [selected, setSelected] = useState<Procedure>();
  const [versionNumber, setVersionNumber] = useState(1);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [archiveFilter, setArchiveFilter] = useState('active');
  const [editor, setEditor] = useState<
    | { body: ProcedureBody; editing: false }
    | { body: ProcedureBody; editing: true; id: string; revision: number }
  >();
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [duplicateTitle, setDuplicateTitle] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [unverified, setUnverified] = useState<Set<string>>(() => new Set());
  const detailSequence = useRef(0);
  const actionPending = useRef(false);
  const selectedUnverified = !!selected && unverified.has(selected.id);
  const editorUnverified = !!editor?.editing && unverified.has(editor.id);
  const version = selected?.versions.find((item) => item.number === versionNumber);
  const readList = () =>
    readProtected<ProcedureSummary[]>('procedures', setList, () => setList([]));
  const readDetail = (id: string, selecting = false) => {
    const sequence = ++detailSequence.current;
    const verified = () =>
      setUnverified((current) => {
        const remaining = new Set(current);
        remaining.delete(id);
        return remaining;
      });
    return readProtectedRecord<Procedure>(
      'procedures/' + id,
      (record) => {
        if (sequence !== detailSequence.current) return;
        verified();
        (selecting ? show : setSelected)(record);
      },
      () => {
        if (sequence !== detailSequence.current) return;
        verified();
        setSelected((current) => (current?.id === id ? undefined : current));
        setList((current) => current.filter((record) => record.id !== id));
        if (selected?.id === id) {
          setEditor((current) => (current?.editing ? undefined : current));
          setDuplicating(false);
          setDuplicateTitle('');
        }
      },
    );
  };
  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setError(
        await refreshProtected([readList, ...(selected ? [() => readDetail(selected.id)] : [])]),
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    return () => {
      ++detailSequence.current;
    };
  }, []);
  async function perform(action: () => Promise<void>, protectedId?: string) {
    if (actionPending.current || (protectedId && unverified.has(protectedId))) return;
    actionPending.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  async function mutate(resource: string, body: unknown, protectedId?: string) {
    try {
      return await request(resource, body);
    } catch (cause) {
      let message = (cause as Error).message;
      if (protectedId && cause instanceof RequestError && cause.status === 403) {
        message += await confirmReadAccess(protectedId);
      }
      throw new Error(message);
    }
  }
  async function confirmReadAccess(id: string) {
    setUnverified((current) => new Set(current).add(id));
    try {
      await readDetail(id);
      return '';
    } catch (cause) {
      return ' Could not confirm access to the saved procedure: ' + (cause as Error).message;
    }
  }
  async function refreshAfterSave(id: string) {
    try {
      await readList();
    } catch (cause) {
      const access =
        cause instanceof RequestError && cause.status === 403 ? await confirmReadAccess(id) : '';
      throw new Error(
        'The procedure was saved, but the list could not be refreshed. ' +
          (cause as Error).message +
          access +
          ' Do not repeat the save.',
      );
    }
  }
  function show(record: Procedure) {
    setSelected(record);
    setVersionNumber(record.versions.at(-1)!.number);
  }
  async function save(body: ProcedureBody, changeNote: string) {
    await perform(
      async () => {
        const record = editor?.editing
          ? await mutate(
              'procedures/' + editor.id + '/revisions',
              {
                revision: editor.revision,
                body,
                changeNote,
              },
              editor.id,
            )
          : await mutate('procedures', body, selected?.id);
        show(record);
        setEditor(undefined);
        await refreshAfterSave(record.id);
      },
      editor?.editing ? editor.id : selected?.id,
    );
  }
  async function importDefinition() {
    await perform(async () => {
      const parsed = parseProcedureImportText(importText);
      const record = await mutate('procedures/import', parsed, selected?.id);
      show(record);
      setImportText('');
      setImporting(false);
      await refreshAfterSave(record.id);
    }, selected?.id);
  }
  async function recheck(id: string) {
    setBusy(true);
    setError('');
    try {
      await readDetail(id);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = list.filter(
    (item) =>
      (archiveFilter === 'all' || (archiveFilter === 'archived') === item.archived) &&
      `${item.title} ${item.description} ${item.tags.join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title="Procedure library"
        description="Save repeatable observations, checkpoints and result checks."
      >
        <button disabled={busy} onClick={() => setPlanning(true)}>
          Guided procedure
        </button>
        <button disabled={busy || loading} onClick={() => void refresh()}>
          <RefreshCw size={16} /> Refresh
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setError('');
            setImporting(true);
          }}
        >
          <Upload size={16} /> Import
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={() => {
            setError('');
            setEditor({ body: blankProcedure(), editing: false });
          }}
        >
          <Plus size={16} /> New procedure
        </button>
      </PageHeader>
      {error && !editor && !importing && !duplicating && <ErrorBox error={error} />}
      {selectedUnverified && (
        <div role="alert" className="error-box">
          Procedure details and exports are hidden until current access is confirmed.
          <button disabled={busy || loading} onClick={() => void recheck(selected!.id)}>
            Read procedure again
          </button>
        </div>
      )}
      <div className="procedure-layout">
        <section className="panel procedure-list" aria-label="Saved procedures">
          <label className="field">
            Find a procedure
            <input
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or tag"
            />
          </label>
          <label className="field">
            Show
            <select
              value={archiveFilter}
              onChange={(event) => setArchiveFilter(event.target.value)}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All procedures</option>
            </select>
          </label>
          {loading && !list.length ? (
            <Loading />
          ) : (
            visible.map((item) => (
              <button
                className="procedure-option"
                key={item.id}
                aria-pressed={selected?.id === item.id}
                disabled={busy || loading}
                onClick={() =>
                  void perform(async () => {
                    await readDetail(item.id, true);
                  })
                }
              >
                <strong>{item.title}</strong>
                <span>
                  {item.stepCount} steps · version {item.versionCount}
                </span>
                <small>{item.tags.join(' · ')}</small>
                {item.archived && <Badge>Archived</Badge>}
              </button>
            ))
          )}
          {!loading && !visible.length && <p>No matching procedures.</p>}
        </section>
        {selected && version ? (
          <section
            className="panel procedure-detail"
            hidden={selectedUnverified}
            style={selectedUnverified ? { display: 'none' } : undefined}
          >
            <div className="section-heading">
              <div>
                <h2>{version.body.title}</h2>
                <span>
                  {selected.owner} · {selected.instance}
                </span>
              </div>
              {selected.archived && <Badge>Archived</Badge>}
            </div>
            <div className="procedure-toolbar">
              <label className="field">
                Version
                <select
                  value={versionNumber}
                  disabled={busy}
                  onChange={(event) => setVersionNumber(Number(event.target.value))}
                >
                  {selected.versions.map((item) => (
                    <option key={item.number} value={item.number}>
                      Version {item.number} · {new Date(item.createdAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={busy || loading || selected.archived}
                onClick={() => {
                  setError('');
                  setEditor({
                    body: selected.versions.at(-1)!.body,
                    editing: true,
                    id: selected.id,
                    revision: selected.revision,
                  });
                }}
              >
                <Edit3 size={15} /> Edit latest
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setError('');
                  setDuplicateTitle(version.body.title + ' copy');
                  setDuplicating(true);
                }}
              >
                <Copy size={15} /> Duplicate
              </button>
              <button
                disabled={selectedUnverified || busy}
                onClick={() =>
                  download('waypoint-procedure-' + selected.id + '-v' + version.number + '.json', {
                    format: 'waypoint-procedure-1',
                    body: version.body,
                  })
                }
              >
                <Download size={15} /> Export version
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    show(
                      await mutate(
                        'procedures/' + selected.id + '/archive',
                        {
                          revision: selected.revision,
                          archived: !selected.archived,
                        },
                        selected.id,
                      ),
                    );
                    await refreshAfterSave(selected.id);
                  }, selected.id)
                }
              >
                <Archive size={15} /> {selected.archived ? 'Restore' : 'Archive'}
              </button>
            </div>
            <p>{version.body.description}</p>
            <ProcedureReadiness body={version.body} />
            {version.body.expectedOutcome && (
              <div className="expected-outcome">
                <strong>Expected outcome</strong>
                <p>{version.body.expectedOutcome}</p>
              </div>
            )}
            <ol className="procedure-preview">
              {version.body.steps.map((step) => (
                <li key={step.id}>
                  <strong>{step.title}</strong>
                  <p>{step.instruction}</p>
                  {step.kind === 'observation' && (
                    <span>
                      {observationSources[step.source].title}
                      {step.target ? ' · ' + step.target : ''}
                    </span>
                  )}
                  {step.kind === 'checklist' && (
                    <>
                      <ul>
                        {step.items.map((item) => (
                          <li key={item.id}>
                            {item.text}
                            {item.required ? ' (required)' : ''}
                          </li>
                        ))}
                      </ul>
                      {step.requireNote && <small>Operator note required</small>}
                      {step.reference && (
                        <a
                          className="procedure-reference"
                          href={step.reference}
                          title={step.reference}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open reference · {new URL(step.reference).host}
                        </a>
                      )}
                    </>
                  )}
                  {step.kind === 'assertion' && (
                    <span>
                      {step.check.replaceAll('-', ' ')} = {String(step.expected)} · source:{' '}
                      {step.threshold !== undefined && `minimum ${step.threshold}% · `}
                      {version.body.steps.find((item) => item.id === step.sourceStepId)?.title}
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <div className="procedure-version-note">
              <strong>Version {version.number}</strong>
              <p>{version.changeNote}</p>
              <small>
                Saved by {version.createdBy} at {new Date(version.createdAt).toLocaleString()}
              </small>
            </div>
            {selected.versions.length > 1 && (
              <details>
                <summary>Compare saved versions</summary>
                <ProcedureVersionDiff
                  key={selected.id + ':' + selected.revision}
                  versions={selected.versions}
                />
              </details>
            )}
            <footer>
              <span>A run keeps this version even if the procedure is edited later.</span>
              <button
                className="primary"
                disabled={busy || selected.archived}
                onClick={() =>
                  void perform(async () => {
                    const run = await mutate(
                      'procedures/' + selected.id + '/run',
                      {
                        version: version.number,
                      },
                      selected.id,
                    );
                    window.dispatchEvent(
                      new CustomEvent('waypoint-run-created', { detail: run.id }),
                    );
                    location.hash = 'runbooks';
                  }, selected.id)
                }
              >
                <Play size={16} /> Create run from version {version.number}
              </button>
            </footer>
          </section>
        ) : (
          <section className="panel procedure-empty">
            <h2>Select a procedure</h2>
            <p>
              Create a procedure or import an exported definition. Plans contain only known read
              operations, manual checklists and predefined assertions.
            </p>
            <p>Use the Runbooks page for application or task maintenance windows.</p>
          </section>
        )}
      </div>
      {editor && (
        <Modal
          title={editor.editing ? 'Edit procedure' : 'New procedure'}
          onClose={() => {
            if (!busy) setEditor(undefined);
          }}
        >
          <div className="modal-body">
            {editorUnverified && (
              <div role="alert" className="error-box">
                The draft is hidden until current access is confirmed.
                {error && <p>{error}</p>}
                <button disabled={busy} onClick={() => void recheck(editor.id)}>
                  Read procedure again
                </button>
              </div>
            )}
            <div hidden={editorUnverified}>
              <ProcedureEditor
                initial={editor.body}
                editing={editor.editing}
                busy={busy || editorUnverified}
                remoteError={editorUnverified ? '' : error}
                onSave={save}
                onCancel={() => setEditor(undefined)}
              />
            </div>
          </div>
        </Modal>
      )}
      {planning && (
        <Modal title="Plan a specialized procedure" onClose={() => setPlanning(false)}>
          <div className="modal-body">
            <ProcedurePlanner
              onCancel={() => setPlanning(false)}
              onCreate={(body) => {
                setError('');
                setPlanning(false);
                setEditor({ body, editing: false });
              }}
            />
          </div>
        </Modal>
      )}
      {importing && (
        <Modal
          title="Import procedure"
          onClose={() => {
            if (!busy) setImporting(false);
          }}
        >
          <div className="modal-body">
            {error && <ErrorBox error={error} />}
            <p>
              Import creates a new procedure owned by your account. Imported definitions cannot
              execute commands, arbitrary code or external API calls.
            </p>
            <label className="field">
              Waypoint procedure JSON
              <textarea
                disabled={busy}
                rows={12}
                maxLength={PROCEDURE_IMPORT_TEXT_BYTES}
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
              />
            </label>
          </div>
          <footer>
            <button disabled={busy} onClick={() => setImporting(false)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy || !importText.trim()}
              onClick={() => void importDefinition()}
            >
              Validate and import
            </button>
          </footer>
        </Modal>
      )}
      {duplicating && !selectedUnverified && (
        <Modal
          title="Duplicate this version"
          onClose={() => {
            if (!busy) setDuplicating(false);
          }}
        >
          <div className="modal-body">
            {error && <ErrorBox error={error} />}
            <label className="field">
              New procedure name
              <input
                disabled={busy}
                maxLength={100}
                value={duplicateTitle}
                onChange={(event) => setDuplicateTitle(event.target.value)}
              />
            </label>
          </div>
          <footer>
            <button disabled={busy} onClick={() => setDuplicating(false)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy || !duplicateTitle.trim()}
              onClick={() =>
                void perform(async () => {
                  const record = await mutate(
                    'procedures/' + selected!.id + '/duplicate',
                    {
                      version: versionNumber,
                      title: duplicateTitle,
                    },
                    selected!.id,
                  );
                  show(record);
                  setDuplicating(false);
                  await refreshAfterSave(record.id);
                }, selected!.id)
              }
            >
              Create independent copy
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
