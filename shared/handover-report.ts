import type { Run } from './runbook.js';
import { assertionCounts } from './run-records.js';
import { observationSources } from './procedure.js';

export function escapeReport(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}
function block(value: unknown) {
  const encoded = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    '<pre>' +
    escapeReport(encoded?.slice(0, 20000)) +
    (encoded && encoded.length > 20000
      ? '\n[Report preview truncated; use the JSON package for the retained data.]'
      : '') +
    '</pre>'
  );
}
function observationMetadata(step: Run['steps'][number]) {
  const observation = step.procedureStep;
  if (observation?.kind !== 'observation') return '';
  const source = Object.hasOwn(observationSources, observation.source)
    ? observationSources[observation.source]
    : undefined;
  const label = source ? `${source.title} (${observation.source})` : observation.source;
  return `<dt>Source</dt><dd>${escapeReport(label)}</dd><dt>Target</dt><dd>${escapeReport(observation.target || 'No specific target')}</dd>`;
}
export function handoverHtml(run: Run) {
  const checks = assertionCounts(run);
  const text = (value: unknown) => escapeReport(value);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; form-action 'none'; base-uri 'none'">
<title>${text(run.title)} — Waypoint handover</title>
<style>
body{font-family:system-ui,sans-serif;line-height:1.5;color:#192638;background:#fff;max-width:1050px;margin:32px auto;padding:0 24px}
h1{font-size:30px;margin-bottom:8px}h2{border-top:2px solid #dce3eb;padding-top:24px;margin-top:32px}h3{margin-bottom:8px}
h1,h2,h3,p,li,th,td,small,time{overflow-wrap:anywhere}
dl{display:grid;grid-template-columns:160px minmax(0,1fr);gap:6px 18px}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}
.notice{padding:16px;border:2px solid #bd6413;background:#fff8ec}.safe{padding:16px;background:#edf7f3}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:#f4f6f8;padding:14px;border:1px solid #dce3eb}
table{border-collapse:collapse;width:100%;margin:16px 0}th,td{text-align:left;vertical-align:top;padding:10px;border:1px solid #dce3eb}
p{white-space:pre-wrap}small,time{color:#516074}.step{break-inside:avoid;padding:12px 0}
.report-table-scroll{overflow-x:auto}.report-table-scroll:focus-visible{outline:2px solid #365f8d;outline-offset:2px}.mobile-table-hint{display:none}
@media screen{.followups,.journal{table-layout:fixed}.followups th:first-child{width:48%}.followups th:nth-child(2){width:20%}.journal th:first-child{width:36%}}
@media screen and (max-width:600px){body{margin:20px auto;padding:0 16px}h1{font-size:24px}dl{grid-template-columns:minmax(0,1fr);gap:4px}dd{margin-bottom:10px}table{font-size:14px}th,td{padding:8px}.followups{min-width:44rem}.journal{min-width:40rem}.mobile-table-hint{display:block;font-size:13px;color:#516074}}
@media print{body{margin:0;padding:12px;font-size:11px}h1{font-size:22px}details{display:block}pre{max-height:none}a{color:inherit}.report-table-scroll{overflow:visible}}
</style></head><body>
<header><small>Waypoint · read-only operational handover</small><h1>${text(run.title)}</h1><p>${text(run.target)}</p></header>
<div class="notice"><strong>This document does not transfer execution authority.</strong><p>The account ${text(run.owner)} remains the execution owner in Waypoint. A recipient cannot resume or restore this run by importing the package. No action is executed by opening this document.</p></div>
<h2>Current responsibility</h2>
<dl><dt>Instance</dt><dd>${text(run.instance)}</dd><dt>Run ID</dt><dd>${text(run.id)}</dd><dt>Owner</dt><dd>${text(run.owner)}</dd><dt>Status</dt><dd>${text(run.status)}</dd><dt>Started</dt><dd>${text(run.createdAt)}</dd><dt>Updated</dt><dd>${text(run.updatedAt)}</dd><dt>Package produced</dt><dd>${text(new Date().toISOString())}</dd><dt>Intended recipient</dt><dd>${text(run.handover?.recipient || 'Not specified')}</dd><dt>Delivery</dt><dd>${run.handover?.delivered ? 'Marked delivered by ' + text(run.handover.updatedBy) + ' at ' + text(run.handover.deliveryRecordedAt) : 'Not marked delivered'}</dd></dl>
${run.needsRestore ? '<div class="notice"><strong>RESTORATION STILL REQUIRED</strong><p>Closing this report or the browser does not restore the application or task. The original account must restore and verify the recorded state in Waypoint.</p></div>' : '<div class="safe">No restoration obligation is recorded in this snapshot.</div>'}
<h2>Handover summary</h2><p>${text(run.handover?.summary || 'No handover summary was recorded.')}</p><h3>Outstanding risks</h3><p>${text(run.handover?.outstandingRisks || 'No risk note was recorded. This is not evidence that no risks exist.')}</p>
<h3>Follow-up actions</h3><p class="mobile-table-hint">Scroll horizontally to read all columns.</p><div class="report-table-scroll" tabindex="0" role="region" aria-label="Follow-up actions"><table class="followups"><thead><tr><th>Action</th><th>State</th><th>Due</th></tr></thead><tbody>${(run.handover?.nextActions ?? []).map((item) => '<tr><td>' + text(item.title) + '</td><td>' + (item.completed ? 'Marked complete' : 'Open') + '</td><td>' + text(item.dueAt || 'Not set') + '</td></tr>').join('')}</tbody></table></div>
<h3>Reference addresses</h3><ul>${(run.handover?.references ?? []).map((reference) => '<li>' + text(reference) + '</li>').join('')}</ul>
<h2>Checks</h2><p>${checks.passed} passed · ${checks.failed} failed · ${checks.unknown} unknown. A completed run means its steps were recorded; it does not mean every assertion passed.</p>
${run.procedure ? '<p>Procedure ' + text(run.procedure.id) + ', immutable version ' + text(run.procedure.version.number) + '</p>' : ''}
<h2>Step results</h2>${run.steps.map((step, index) => `<section class="step"><h3>${index + 1}. ${text(step.title)}</h3><p>${text(step.description)}</p><dl>${observationMetadata(step)}<dt>Status</dt><dd>${text(step.status)}</dd><dt>Attempts</dt><dd>${text(step.attempts)}</dd><dt>Recorded at</dt><dd>${text(step.finishedAt || step.startedAt || 'Not started')}</dd></dl>${step.error ? '<p><strong>Error:</strong> ' + text(step.error) + '</p>' : ''}${step.note ? '<p><strong>Operator note:</strong> ' + text(step.note) + '</p>' : ''}${step.evidence === undefined ? '<p>No result recorded.</p>' : block(step.evidence)}</section>`).join('')}
<h2>Operator notes</h2>${(run.notes ?? []).map((note) => '<section><h3>' + text(note.category) + '</h3><small>' + text(note.at) + ' · ' + text(note.author) + '</small><p>' + text(note.text) + '</p></section>').join('')}
<h2>Run journal</h2><p class="mobile-table-hint">Scroll horizontally to read all columns.</p><div class="report-table-scroll" tabindex="0" role="region" aria-label="Run journal"><table class="journal"><thead><tr><th>Time</th><th>Event</th></tr></thead><tbody>${run.events.map((event) => '<tr><td>' + text(event.at) + '</td><td>' + text(event.message) + '</td></tr>').join('')}</tbody></table></div>
<footer><p>This report contains operating data. Share it only with the intended recipients. Observations may be incomplete or time-dependent; consult the recorded source and time before acting.</p></footer>
</body></html>`;
}
