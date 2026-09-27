import type express from 'express';
import { z } from 'zod';
import { CommandJournal } from './command-journal.js';
import { CommandService } from './command-service.js';
import type { RunEngine } from './run-engine.js';
import { ApiError, type IrisClient } from './upstream.js';
import type { CommandResult } from '../shared/command-result.js';
import { requireCommandPrivileges } from './command-authorization.js';

const mutationSchema = z
  .object({
    path: z.string().max(160),
    method: z.enum(['POST', 'PUT', 'DELETE']),
    query: z.record(z.string().max(80), z.string().max(2000)).optional(),
    body: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export function commandRoutes(app: express.Express, engine: RunEngine, client: IrisClient) {
  const service = new CommandService(
    new CommandJournal(engine.store.root, engine.instance),
    client,
    engine.reservations,
  );
  const actor = (res: express.Response) => ({
    owner: String(res.locals.session.info.username),
    auth: String(res.locals.session.auth),
  });
  const requireRecordAccess = (
    record: Pick<CommandResult, 'operation'> & Partial<Pick<CommandResult, 'read'>>,
    res: express.Response,
  ) => requireCommandPrivileges(record, res.locals.commandPrivileges);
  app.use('/api/commands', async (_req, res, next) => {
    const current = (await client.request(actor(res).auth, { path: '/info', method: 'GET' })).data;
    if (current.username !== actor(res).owner)
      throw new ApiError(403, 'The authenticated native account changed. Sign in again.');
    res.locals.commandPrivileges = current.privileges;
    next();
  });
  app.get('/api/commands', async (_req, res) => {
    const records = await service.journal.list(actor(res).owner);
    const visible = records.filter((record) => {
      try {
        requireRecordAccess(record, res);
        return true;
      } catch {
        return false;
      }
    });
    res.json(
      visible.map((record) => ({
        id: record.id,
        title: record.title,
        target: record.target,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        message: record.message,
        operation: record.operation,
      })),
    );
  });
  app.post('/api/commands/review', async (req, res) => {
    const input = z
      .object({
        command: mutationSchema,
        selection: z
          .object({
            pid: z.string().max(30),
            started: z.string().max(100),
            job: z.string().max(30),
            user: z.string().max(128),
          })
          .strict()
          .optional(),
      })
      .strict()
      .parse(req.body);
    requireRecordAccess({ operation: { ...input.command, query: input.command.query ?? {} } }, res);
    res.status(201).json(await service.review(actor(res), input.command, input.selection));
  });
  app.use('/api/commands/:id', async (req, res, next) => {
    requireRecordAccess(await service.journal.read(actor(res).owner, String(req.params.id)), res);
    next();
  });
  app.get('/api/commands/:id', async (req, res) =>
    res.json(await service.get(actor(res), String(req.params.id))),
  );
  app.post('/api/commands/:id/execute', async (req, res) => {
    const input = z
      .object({ confirmation: z.string().max(2000) })
      .strict()
      .parse(req.body);
    res.json(await service.execute(actor(res), String(req.params.id), input.confirmation));
  });
  app.post('/api/commands/:id/reconcile', async (req, res) => {
    z.object({}).strict().parse(req.body);
    res.json(await service.reconcile(actor(res), String(req.params.id)));
  });
}
