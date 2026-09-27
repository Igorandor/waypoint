import { credentialValues, redact } from '../shared/redaction.js';
import { ApiError, validateOperation, type Operation } from './command-policy.js';
import { irisError, readDocument } from './native-response.js';
export { ApiError, validateOperation, type Operation, irisError, redact };

function diagnosticValues(auth: string, body: unknown) {
  const tokens = credentialValues(body);
  if (auth.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString(),
      separator = decoded.indexOf(':');
    if (separator >= 0) tokens.push(decoded.slice(separator + 1));
    tokens.push(auth, auth.slice(6));
  }
  return tokens.flatMap((text) => [
    text,
    JSON.stringify(text).slice(1, -1),
    encodeURIComponent(Buffer.from(text).toString()),
    new URLSearchParams({ v: text }).toString().slice(2),
  ]);
}
/** A command executes exactly once. RunEngine owns explicit recovery and reconciliation. */
export class IrisClient {
  private readonly executing = new Map<symbol, string>();
  constructor(
    private endpoint: string,
    private send: typeof fetch = fetch,
  ) {}
  async request(auth: string, command: Operation, callerSignal?: AbortSignal) {
    validateOperation(command);
    if (
      this.executing.size >= 16 ||
      [...this.executing.values()].filter((value) => value === auth).length >= 8
    )
      throw new ApiError(429, 'Too many concurrent IRIS requests.');
    const ticket = Symbol();
    this.executing.set(ticket, auth);
    try {
      const route = command.path.startsWith('/extension/')
        ? command.path.replace('/extension/', '/api/waypoint/')
        : '/api/admin' + command.path;
      const destination = new URL(route, this.endpoint);
      destination.search = new URLSearchParams(command.query).toString();
      let content = command.body && { ...command.body };
      const oauth = command.path === '/v2/security/oauth2/client/client-configuration';
      if (oauth && content?.OAuth2ServerDefinition !== undefined) {
        content.ServerDefinition = content.OAuth2ServerDefinition;
        delete content.OAuth2ServerDefinition;
      }
      let response: Response;
      try {
        const deadline = AbortSignal.timeout(20_000);
        const signal =
          command.method === 'GET' && callerSignal
            ? AbortSignal.any([deadline, callerSignal])
            : deadline;
        signal.throwIfAborted();
        response = await this.send(destination, {
          method: command.method,
          body: content ? JSON.stringify(content) : undefined,
          redirect: 'error',
          signal,
          headers: {
            Authorization: auth,
            Accept: 'application/json',
            'Accept-Language': 'en',
            'Content-Type': 'application/json',
          },
        });
      } catch {
        throw new ApiError(
          502,
          'IRIS is unavailable or exceeded the 20-second timeout. A write may have completed; verify before retrying.',
        );
      }
      const document = redact(await readDocument(response));
      const secrets = diagnosticValues(auth, command.body);
      const failure = irisError(
        redact({ status: document.status, error: document.error }, secrets),
      );
      if (failure || !response.ok)
        throw new ApiError(
          response.ok ? 422 : response.status,
          failure ??
            (response.status === 403
              ? 'Your IRIS account does not have the required privilege.'
              : 'IRIS returned HTTP ' + response.status + '.'),
        );
      let asyncId: string | undefined;
      if (response.status === 202) {
        try {
          asyncId =
            new URL(response.headers.get('location') ?? '', this.endpoint).searchParams.get('id') ??
            undefined;
        } catch {}
        if (!asyncId?.trim() || asyncId.length > 2000)
          throw new ApiError(
            502,
            'Accepted command has no usable job identifier. Inspect native job state before retrying.',
          );
      }
      let data = document.result ?? document;
      if (oauth && data.ServerDefinition !== undefined) {
        data.OAuth2ServerDefinition = data.ServerDefinition;
        delete data.ServerDefinition;
      }
      if (['/v2/async-result', '/v2/async-results'].includes(command.path)) {
        for (const job of Array.isArray(data) ? data : [data])
          if (job && typeof job === 'object')
            for (const key of ['Console', 'FailureReason'])
              if (Object.hasOwn(job, key)) job[key] = redact(job[key], secrets);
      }
      const output = redact(document.console ?? [], secrets);
      if (command.path === '/extension/logs') data = redact(data, secrets);
      if (document.result == null && Object.hasOwn(document, 'console')) data.console = output;
      return { data, console: output, status: response.status, asyncId };
    } finally {
      this.executing.delete(ticket);
    }
  }
}
