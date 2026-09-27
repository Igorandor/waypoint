import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Operators, type OperatorSession } from './operator-sessions.js';
import { IrisClient, ApiError, type Operation } from './upstream.js';
import { parameters } from '../shared/schema.js';
import { RunEngine } from './run-engine.js';
import { RunStore } from './run-store.js';
import { runRoutes } from './run-routes.js';
import { consolePreview } from './activity.js';
import { procedureRoutes } from './procedure-routes.js';
import { commandTarget } from './target-reservations.js';
import { commandRoutes } from './command-routes.js';
import { PROCEDURE_IMPORT_REQUEST_BYTES } from '../shared/procedure-import.js';
export type AppOptions = {
  irisUrl: string;
  instanceId?: string;
  dataDirectory?: string;
  runEngine?: RunEngine;
  origin?: string;
  secure?: boolean;
  client?: IrisClient;
  now?: () => number;
};
const signIn = z
  .object({
    username: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[^:\r\n]+$/),
    password: z.string().min(1).max(1024),
  })
  .strict();
const operation = z
  .object({
    path: z.string().max(160),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
    query: z.record(z.string().max(80), z.string().max(2000)).optional(),
    body: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
function nativeIdentity(info: any) {
  const version = info?.apiVersion,
    name = info?.username;
  if (
    (typeof version !== 'number' && !(typeof version === 'string' && /^\d+$/.test(version))) ||
    !Number.isSafeInteger(Number(version)) ||
    +version < 0 ||
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 128
  )
    throw new ApiError(502, 'IRIS returned an invalid API version or account identity.');
  if (+version < 2) throw new ApiError(409, 'Waypoint requires the SysAdmin v2 API.');
}
export function createApp(settings: AppOptions) {
  const app = express(),
    clock = settings.now ?? Date.now,
    client = settings.client ?? new IrisClient(settings.irisUrl);
  const operators = new Operators(clock, settings.secure ?? false);
  const engine =
    settings.runEngine ??
    new RunEngine(
      new RunStore(settings.dataDirectory ?? './data'),
      client,
      settings.instanceId || new URL(settings.irisUrl).origin,
    );
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { 'script-src': ["'self'"], 'style-src': ["'self'", "'unsafe-inline'"] },
      },
    }),
  );
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const host = req.get('host') ?? '';
    if (!settings.origin && !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host))
      throw new ApiError(403, 'Set PUBLIC_ORIGIN before using a non-loopback host.');
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (
        (req.get('origin') && req.get('origin') !== (settings.origin ?? 'http://' + host)) ||
        req.get('sec-fetch-site') === 'cross-site'
      )
        throw new ApiError(403, 'Request origin is not allowed.');
      if (!req.is('application/json')) throw new ApiError(415, 'JSON requests are required.');
    }
    next();
  });
  const standardJson = express.json({ limit: 256 * 1024 });
  const procedureImportJson = express.json({ limit: PROCEDURE_IMPORT_REQUEST_BYTES });
  app.use((req, res, next) => {
    // The import envelope adds 41 bytes around a body accepted by ordinary creation.
    const parser =
      req.method === 'POST' && req.path === '/api/procedures/import'
        ? procedureImportJson
        : standardJson;
    parser(req, res, next);
  }, cookieParser());
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, app: 'Waypoint', target: new URL(settings.irisUrl).host }),
  );
  app.post('/api/login', async (req, res) => {
    const input = signIn.parse(req.body);
    operators.budget(req.ip ?? 'local');
    const auth = 'Basic ' + Buffer.from(input.username + ':' + input.password).toString('base64');
    const { data } = await client.request(auth, { path: '/info', method: 'GET' });
    nativeIdentity(data);
    res.json(operators.establish(req, res, auth, data));
  });
  app.use('/api', operators.require);
  app.get('/api/session', (_req, res) =>
    res.json({ info: res.locals.session.info, csrf: res.locals.session.csrf }),
  );
  app.post('/api/logout', (req, res) => {
    operators.remove(req, res);
    res.json({ ok: true });
  });
  app.get('/api/activity', (_req, res) => res.json(res.locals.session.activity));
  runRoutes(app, engine, client);
  procedureRoutes(app, engine, client);
  commandRoutes(app, engine, client);
  app.post('/api/iris', async (req, res) => {
    const command = operation.parse(req.body) as Operation;
    if (command.method !== 'GET' && command.path !== '/v2/security/audit/records')
      throw new ApiError(
        409,
        'Prepare and confirm this change through the command review endpoint. Direct writes are not accepted.',
      );
    if (
      (command.method === 'GET' || command.path === '/v2/security/audit/records') &&
      parameters(command.path, command.method).some((field) => field.name === 'maxRows') &&
      !command.query?.maxRows
    )
      command.query = { ...command.query, maxRows: '250' };
    const session = res.locals.session as OperatorSession,
      started = clock();
    const receipt = (status: number, output?: unknown) => {
      session.activity = [
        {
          at: new Date(clock()).toISOString(),
          method: command.method,
          path: command.path,
          status,
          elapsed: clock() - started,
          console: consolePreview(output),
        },
        ...session.activity,
      ].slice(0, 100);
    };
    // Only this caller-owned read follows its response lifetime. Durable work has no signal.
    const disconnected = command.method === 'GET' ? new AbortController() : undefined;
    const abandonRead = () => {
      if (!res.writableEnded) disconnected?.abort();
    };
    if (disconnected) {
      res.once('close', abandonRead);
      if (res.destroyed) abandonRead();
    }
    try {
      const result = await engine.reservations.withTarget(commandTarget(command), undefined, () =>
        client.request(session.auth, command, disconnected?.signal),
      );
      if (!disconnected?.signal.aborted && (command.method !== 'GET' || result.console?.length))
        receipt(result.status, result.console);
      if (!res.destroyed) res.json(result);
    } catch (error) {
      if (!disconnected?.signal.aborted) receipt(error instanceof ApiError ? error.status : 500);
      if (!res.destroyed) throw error;
    } finally {
      if (disconnected) res.off('close', abandonRead);
    }
  });
  app.use('/api', () => {
    throw new ApiError(404, 'Unknown Waypoint endpoint.');
  });
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
  app.use(
    (error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status =
        error instanceof ApiError
          ? error.status
          : error instanceof z.ZodError || error.type === 'entity.parse.failed'
            ? 400
            : error.type === 'entity.too.large'
              ? 413
              : 500;
      res.status(status).json({
        error:
          error instanceof ApiError
            ? error.message
            : status === 400
              ? 'Invalid request.'
              : 'The request could not be processed.',
      });
    },
  );
  return app;
}
