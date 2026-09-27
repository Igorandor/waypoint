import express from 'express';
import { z } from 'zod';
import { RunEngine } from './run-engine.js';
import { IrisClient, ApiError } from './upstream.js';
import type { OperatorSession } from './operator-sessions.js';
import type { Run } from '../shared/runbook.js';
import { compareRuns, exportHandover, handoverInputSchema } from '../shared/run-records.js';
export function runRoutes(app: express.Express, engine: RunEngine, client: IrisClient) {
  const actor = (res: express.Response) => ({
    owner: String(res.locals.session.info.username),
    auth: res.locals.session.auth as string,
  });
  const authorizeReport = (run: Run, res: express.Response) => {
    const secureEvidence = run.steps.some(
      (step) =>
        step.evidence !== undefined &&
        (['inspect-app', 'application-inventory'].includes(step.kind) ||
          (step.procedureStep?.kind === 'observation' &&
            ['application', 'applications'].includes(step.procedureStep.source))),
    );
    if (secureEvidence && res.locals.currentPrivileges?.Secure?.use !== true)
      throw new ApiError(
        403,
        'This report contains application configuration. Current IRIS security privileges are required.',
      );
  };
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
    res.locals.currentPrivileges = current.data.privileges;
    next();
  });
  app.get('/api/runs', async (_req, res) => {
    const list = await engine.store.list(actor(res).owner, engine.instance);
    for (const summary of list)
      authorizeReport(await engine.store.read(actor(res).owner, engine.instance, summary.id), res);
    res.json(list);
  });
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
  app.post('/api/runs/compare', async (req, res) => {
    const input = z
      .object({ before: z.string().uuid(), after: z.string().uuid() })
      .strict()
      .parse(req.body);
    const before = await engine.get(actor(res), input.before),
      after = await engine.get(actor(res), input.after);
    authorizeReport(before, res);
    authorizeReport(after, res);
    res.json(compareRuns(before, after));
  });
  app.use('/api/runs/:id', async (req, res, next) => {
    authorizeReport(
      await engine.store.read(actor(res).owner, engine.instance, String(req.params.id)),
      res,
    );
    next();
  });
  app.get('/api/runs/:id', async (req, res) =>
    res.json(await engine.get(actor(res), String(req.params.id))),
  );
  app.post('/api/runs/:id/next', async (req, res) => {
    const input = z
      .object({
        note: z.string().max(2000).default(''),
        completedItems: z.array(z.string().max(40)).max(12).default([]),
      })
      .strict()
      .parse(req.body);
    res.json(
      await engine.next(actor(res), String(req.params.id), input.note, input.completedItems),
    );
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
  app.post('/api/runs/:id/archive', async (req, res) => {
    const input = z
      .object({ revision: z.number().int().nonnegative(), archived: z.boolean() })
      .strict()
      .parse(req.body);
    res.json(
      await engine.archive(actor(res), String(req.params.id), input.revision, input.archived),
    );
  });
  app.post('/api/runs/:id/handover', async (req, res) => {
    const input = z
      .object({ revision: z.number().int().nonnegative(), handover: handoverInputSchema })
      .strict()
      .parse(req.body);
    res.json(
      await engine.handover(actor(res), String(req.params.id), input.revision, input.handover),
    );
  });
  app.get('/api/runs/:id/handover', async (req, res) =>
    res.json(exportHandover(await engine.get(actor(res), String(req.params.id)))),
  );
  app.post('/api/runs/:id/notes', async (req, res) => {
    const input = z
      .object({
        revision: z.number().int().nonnegative(),
        text: z.string().trim().min(1).max(2000),
        category: z.enum(['observation', 'decision', 'follow-up']),
      })
      .strict()
      .parse(req.body);
    res.json(
      await engine.addNote(
        actor(res),
        String(req.params.id),
        input.revision,
        input.text,
        input.category,
      ),
    );
  });
}
