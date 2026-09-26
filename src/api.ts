import type { RecordData } from '../shared/schema';
export type ApiResult<T = any> = { data: T; status: number; console: string[]; asyncId?: string };
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
const session = { token: '' };
export async function request<T = any>(resource: string, content?: unknown): Promise<T> {
  const writing = content !== undefined;
  const response = await fetch('/api/' + resource, {
    method: writing ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: writing ? { 'Content-Type': 'application/json', 'X-CSRF-Token': session.token } : {},
    body: writing ? JSON.stringify(content) : undefined,
  });
  let output: any;
  try {
    output = await response.json();
  } catch {
    throw new RequestError(
      'Unreadable gateway response. Verify current state before repeating a command.',
      response.status,
    );
  }
  if (!response.ok) {
    if (response.status === 401 && !['login', 'session'].includes(resource))
      window.dispatchEvent(new Event('session-ended'));
    throw new RequestError(
      typeof output.error === 'string' ? output.error : 'Waypoint could not complete the request.',
      response.status,
    );
  }
  if (typeof output.csrf === 'string') session.token = output.csrf;
  if (resource === 'logout') session.token = '';
  return output;
}
export async function iris<T = any>(
  path: string,
  query: Record<string, string> = {},
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: RecordData,
): Promise<ApiResult<T>> {
  const accepted = await request<ApiResult<T>>('iris', { path, query, method, body });
  if (!accepted.asyncId) return accepted;
  const job = accepted.asyncId;
  let remaining = 20;
  while (remaining--) {
    await new Promise<void>((done) => window.setTimeout(done, 700));
    const progress = await request<ApiResult>('iris', {
      path: '/v2/async-result',
      method: 'GET',
      query: { id: job },
    });
    switch (progress.data.State) {
      case 'Finished':
        return { ...progress, data: progress.data.Result, console: progress.data.Console ?? [] };
      case 'Failed':
      case 'Canceled':
      case 'Paused':
        throw new RequestError(
          'Background job ' + progress.data.State + ': ' + (progress.data.FailureReason ?? job),
          422,
        );
    }
  }
  throw new RequestError(
    'Job ' + job + ' is still running. Inspect background jobs before repeating this command.',
    202,
  );
}
export function download(filename: string, content: unknown) {
  const url = URL.createObjectURL(
    new Blob([typeof content === 'string' ? content : JSON.stringify(content, null, 2)], {
      type: typeof content === 'string' ? 'text/plain' : 'application/json',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
