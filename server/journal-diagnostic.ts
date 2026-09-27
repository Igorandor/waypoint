// Two KiB per newly recorded message keeps 200 run events and 50 command events bounded.
// Count JSON-encoded UTF-8, including escaping, rather than characters alone.
export const JOURNAL_DIAGNOSTIC_BYTES = 2048;
const shortened =
  '\n[Diagnostic shortened for the journal; inspect the native source for the full message.]';

export function journalDiagnostic(message: string): string {
  const encodedBytes = (value: string) => Buffer.byteLength(JSON.stringify(value));
  if (encodedBytes(message) <= JOURNAL_DIAGNOSTIC_BYTES) return message;
  let start = 0;
  let end = Math.min(message.length, JOURNAL_DIAGNOSTIC_BYTES);
  while (start < end) {
    const middle = Math.ceil((start + end) / 2);
    if (encodedBytes(message.slice(0, middle) + shortened) <= JOURNAL_DIAGNOSTIC_BYTES)
      start = middle;
    else end = middle - 1;
  }
  // Preserve Unicode pairs at the retained boundary.
  if (start && /[\uD800-\uDBFF]/.test(message[start - 1])) start--;
  return message.slice(0, start) + shortened;
}
