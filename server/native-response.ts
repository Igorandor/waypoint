import { redact } from '../shared/redaction.js';
import { boundedJson } from './json-limits.js';
import { ApiError } from './command-policy.js';
export function irisError(input: any): string | undefined {
  const document = redact(input),
    status = document?.status,
    errors = status?.errors ?? status?.Errors;
  const describe = (value: any) =>
    typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  if (Array.isArray(errors) && errors.length)
    return errors
      .map(
        (item) =>
          describe(item?.message ?? item?.error ?? item?.text ?? item).trim() ||
          'IRIS returned an error without a message.',
      )
      .join('; ');
  if (document?.error) return describe(document.error);
  if (status?.summary && !/^(ok|success)$/i.test(status.summary)) return String(status.summary);
}
export async function readDocument(response: Response) {
  let bytes = 0;
  const pieces: Uint8Array[] = [];
  const stream = response.body?.getReader();
  try {
    if (stream)
      for (;;) {
        const part = await stream.read();
        if (part.done) break;
        bytes += part.value.length;
        if (bytes > 8_000_000) {
          await stream.cancel();
          throw new ApiError(502, 'IRIS returned too much data; narrow the request.');
        }
        pieces.push(part.value);
      }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'Native response interrupted. Verify state before retrying a write.');
  } finally {
    stream?.releaseLock();
  }
  const denial =
    response.status === 401
      ? 'IRIS rejected the credentials.'
      : response.status === 403
        ? 'Your IRIS account does not have the required privilege.'
        : undefined;
  let document: any;
  try {
    document = JSON.parse(Buffer.concat(pieces, bytes).toString('utf8'));
  } catch {
    throw new ApiError(denial ? response.status : 502, denial ?? 'IRIS sent a non-JSON response.');
  }
  if (!document || typeof document !== 'object')
    throw new ApiError(
      denial ? response.status : 502,
      denial ?? 'Invalid native response document.',
    );
  if (!boundedJson(document, 64, 200000))
    throw new ApiError(502, 'Native response exceeds the complexity budget.');
  return document;
}
