import type express from 'express';
import { z } from 'zod';
import { procedureBodySchema, procedureImportSchema } from '../shared/procedure.js';
import { procedureBodyFitsRequest } from '../shared/procedure-import.js';
import { ProcedureStore } from './procedure-store.js';
import { RunEngine } from './run-engine.js';
import { ApiError, type IrisClient } from './upstream.js';

export function procedureRoutes(app: express.Express, engine: RunEngine, client: IrisClient) {
  const library = new ProcedureStore(engine.store.root, engine.instance);
  const owner = (res: express.Response) => String(res.locals.session.info.username);
  app.use('/api/procedures', async (_req, res, next) => {
    const current = (
      await client.request(res.locals.session.auth, { path: '/info', method: 'GET' })
    ).data;
    if (current.username !== owner(res) || current.privileges?.Operate?.use !== true)
      throw new ApiError(
        403,
        'Current IRIS operating privileges are required to access procedures.',
      );
    next();
  });
  app.get('/api/procedures', async (_req, res) => res.json(await library.list(owner(res))));
  app.post('/api/procedures', async (req, res) =>
    res.status(201).json(await library.create(owner(res), procedureBodySchema.parse(req.body))),
  );
  app.post('/api/procedures/import', async (req, res) => {
    const imported = procedureImportSchema.parse(req.body);
    if (!procedureBodyFitsRequest(imported.body))
      throw new ApiError(
        413,
        'The procedure body exceeds the 256 KiB request limit after validation.',
      );
    res
      .status(201)
      .json(
        await library.create(owner(res), imported.body, 'Imported validated procedure definition'),
      );
  });
  app.get('/api/procedures/:id', async (req, res) =>
    res.json(await library.read(owner(res), String(req.params.id))),
  );
  app.post('/api/procedures/:id/revisions', async (req, res) => {
    const input = z
      .object({
        revision: z.number().int().positive(),
        body: procedureBodySchema,
        changeNote: z.string().trim().min(1).max(1000),
      })
      .strict()
      .parse(req.body);
    res.json(
      await library.revise(
        owner(res),
        String(req.params.id),
        input.revision,
        input.body,
        input.changeNote,
      ),
    );
  });
  app.post('/api/procedures/:id/archive', async (req, res) => {
    const input = z
      .object({ revision: z.number().int().positive(), archived: z.boolean() })
      .strict()
      .parse(req.body);
    res.json(
      await library.archive(owner(res), String(req.params.id), input.revision, input.archived),
    );
  });
  app.post('/api/procedures/:id/duplicate', async (req, res) => {
    const input = z
      .object({ version: z.number().int().positive(), title: z.string().trim().min(1).max(100) })
      .strict()
      .parse(req.body);
    const record = await library.read(owner(res), String(req.params.id));
    const version = record.versions.find((item) => item.number === input.version);
    if (!version) throw new ApiError(404, 'Procedure version not found.');
    res
      .status(201)
      .json(
        await library.create(
          owner(res),
          { ...version.body, title: input.title },
          'Duplicated version ' + input.version,
        ),
      );
  });
  app.post('/api/procedures/:id/run', async (req, res) => {
    const input = z.object({ version: z.number().int().positive() }).strict().parse(req.body);
    const record = await library.read(owner(res), String(req.params.id));
    if (record.archived)
      throw new ApiError(409, 'Restore the procedure before creating another run.');
    const version = record.versions.find((item) => item.number === input.version);
    if (!version) throw new ApiError(404, 'Procedure version not found.');
    res
      .status(201)
      .json(
        await engine.fromProcedure(
          { owner: owner(res), auth: res.locals.session.auth },
          record.id,
          version,
        ),
      );
  });
}
