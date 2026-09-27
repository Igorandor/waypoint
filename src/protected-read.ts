import { request, RequestError } from './api';

/** Only a refused GET invalidates previously displayed data; write errors do not. */
export async function readProtected<T>(
  resource: string,
  received: (value: T) => void,
  denied: () => void,
  transport: typeof request = request,
): Promise<T> {
  let value: T;
  try {
    value = await transport<T>(resource);
  } catch (cause) {
    if (cause instanceof RequestError && cause.status === 403) denied();
    throw cause;
  }
  received(value);
  return value;
}

/** A failed list read must not prevent rechecking the already selected record. */
export async function refreshProtected(reads: Array<() => Promise<unknown>>): Promise<string> {
  const errors: string[] = [];
  for (const read of reads) {
    try {
      await read();
    } catch (cause) {
      errors.push((cause as Error).message);
      // request() has already ended the UI session; do not issue further reads.
      if (cause instanceof RequestError && cause.status === 401) break;
    }
  }
  return [...new Set(errors)].join(' ');
}
