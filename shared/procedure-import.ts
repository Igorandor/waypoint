import { procedureImportSchema, procedureShapeLimits, type ProcedureBody } from './procedure.js';

export const PROCEDURE_BODY_BYTES = 256 * 1024;
const bytes = (text: string) => new TextEncoder().encode(text).length;
const envelope = (body: unknown) => ({ format: 'waypoint-procedure-1', body });
const envelopeBytes = bytes(JSON.stringify(envelope({}))) - 2;
export const PROCEDURE_IMPORT_REQUEST_BYTES = PROCEDURE_BODY_BYTES + envelopeBytes;

// Checklists have the most structural fields at every bounded array level.
// Content/escaping costs are already included in the compact body byte budget;
// this shape measures only the whitespace added by our two-space JSON exporter.
const largestStructure = envelope({
  title: 'x',
  description: '',
  expectedOutcome: '',
  tags: Array.from({ length: procedureShapeLimits.tags }, (_, index) => 't' + index),
  steps: Array.from({ length: procedureShapeLimits.steps }, (_, index) => ({
    id: 's' + index,
    kind: 'checklist',
    title: 'x',
    instruction: '',
    items: Array.from({ length: procedureShapeLimits.checklistItems }, (_, item) => ({
      id: 'i' + item,
      text: 'x',
      required: true,
    })),
    requireNote: true,
    reference: '',
  })),
});
export const PROCEDURE_IMPORT_TEXT_BYTES =
  PROCEDURE_IMPORT_REQUEST_BYTES +
  bytes(JSON.stringify(largestStructure, null, 2)) -
  bytes(JSON.stringify(largestStructure));

export function procedureBodyFitsRequest(body: ProcedureBody) {
  return bytes(JSON.stringify(body)) <= PROCEDURE_BODY_BYTES;
}

export function parseProcedureImportText(text: string) {
  if (text.length > PROCEDURE_IMPORT_TEXT_BYTES || bytes(text) > PROCEDURE_IMPORT_TEXT_BYTES)
    throw new Error(
      `The import exceeds ${PROCEDURE_IMPORT_TEXT_BYTES.toLocaleString('en-US')} UTF-8 bytes, including formatting.`,
    );
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Paste a valid Waypoint procedure JSON document.');
  }
  const parsed = procedureImportSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues
        .map((issue) => {
          const path = issue.path.reduce<string>(
            (current, part) =>
              typeof part === 'number' ? `${current}[${part}]` : `${current}.${String(part)}`,
            '$',
          );
          return `${path}: ${issue.message}`;
        })
        .join(' '),
    );
  if (!procedureBodyFitsRequest(parsed.data.body))
    throw new Error('The procedure body exceeds the 256 KiB request limit after validation.');
  return parsed.data;
}
