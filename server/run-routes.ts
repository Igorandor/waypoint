import express from 'express';
import { z } from 'zod';
import { RunEngine } from './run-engine.js';
import { IrisClient, ApiError } from './upstream.js';
import type { OperatorSession } from './operator-sessions.js';
export function runRoutes(app: express.Express, engine: RunEngine, client: IrisClient) {
  const actor = (res: express.Response) => ({
    owner: String(res.locals.session.info.username),
    auth: res.locals.session.auth as string,
  });
  // Stored reports contain operating data: cached login identity is not authorization.
  app.use('/api/runs', async (_req, res, next) => {
    const session = res.locals.session as OperatorSession;
    const current = await client.request(session.auth, { path: '/info', method: 'GET' });
    if (
      current.data.username !== session.info.username ||
      current.data.privileges?.Operate?.use !== true
    )
      throw new ApiError(
        403,
        'Current IRIS operating privileges are required to access run reports.',
      );
    next();
  });
  app.get('/api/runs', async (_req, res) =>
    res.json(await engine.store.list(actor(res).owner, engine.instance)),
  );
  app.post('/api/runs', async (req, res) => {
    const input = z
      .object({
        template: z.enum(['observe', 'application-window', 'task-window']),
        target: z.string().max(256).default(''),
        confirmation: z.string().max(256).default(''),
        observation: z
          .object({
            sources: z.array(z.string().max(40)).min(1).max(8),
            title: z.string().trim().max(80).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .parse(req.body);
    res
      .status(201)
      .json(
        await engine.create(
          actor(res),
          input.template,
          input.target,
          input.confirmation,
          input.observation,
        ),
      );
  });
  app.get('/api/runs/:id', async (req, res) =>
    res.json(await engine.get(actor(res), String(req.params.id))),
  );
  app.post('/api/runs/:id/next', async (req, res) => {
    const input = z
      .object({ note: z.string().max(2000).default('') })
      .strict()
      .parse(req.body);
    res.json(await engine.next(actor(res), String(req.params.id), input.note));
  });
  app.post('/api/runs/:id/reconcile', async (req, res) =>
    res.json(await engine.reconcile(actor(res), String(req.params.id))),
  );
  app.post('/api/runs/:id/restore', async (req, res) => {
    const input = z
      .object({ confirmation: z.string().max(256) })
      .strict()
      .parse(req.body);
    res.json(await engine.restore(actor(res), String(req.params.id), input.confirmation));
  });
  app.post('/api/runs/:id/stop', async (req, res) =>
    res.json(await engine.stop(actor(res), String(req.params.id))),
  );
}
