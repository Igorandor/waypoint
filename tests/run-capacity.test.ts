import test from 'node:test';
import assert from 'node:assert/strict';
import { RunEngine } from '../server/run-engine';
import { RunStore } from '../server/run-store';
import { ApiError, IrisClient } from '../server/upstream';
import type { Run, RunSummary } from '../shared/runbook';
import type { ProcedureVersion } from '../shared/procedure';

const actor = { owner: 'capacity-review', auth: 'unused' };
const procedure: ProcedureVersion = {
  number: 1,
  createdAt: '2026-09-29T08:00:00.000Z',
  createdBy: actor.owner,
  changeNote: '',
  body: {
    title: 'Capacity review',
    description: '',
    expectedOutcome: '',
    tags: [],
    steps: [
      {
        id: 'health',
        kind: 'observation',
        title: 'Health',
        instruction: '',
        source: 'health',
        target: '',
      },
    ],
  },
};

for (const mode of ['template', 'procedure'] as const) {
  test(`${mode} creation distinguishes unarchived and total limits without changing stored records`, async () => {
    let records: RunSummary[] = [];
    const saved: Run[] = [];
    const store = {
      root: 'unused-capacity-fixture',
      list: async (owner: string, instance: string) => {
        assert.equal(owner, actor.owner);
        assert.equal(instance, 'capacity-instance');
        return records;
      },
      save: async (run: Run) => {
        saved.push(run);
      },
    } as unknown as RunStore;
    const client = new IrisClient('http://unused', async () =>
      assert.fail('Creation must not call IRIS'),
    );
    const engine = new RunEngine(store, client, 'capacity-instance');
    const create = () =>
      mode === 'template'
        ? engine.create(actor, 'observe', '', '')
        : engine.fromProcedure(actor, 'capacity-procedure', procedure);
    const fill = (total: number, unarchived: number) => {
      records = Array.from(
        { length: total },
        (_, index) =>
          ({
            id: String(index),
            archivedAt: index < unarchived ? undefined : '2026-09-29T08:00:00.000Z',
          }) as RunSummary,
      );
    };
    for (const [total, unarchived, expected] of [
      [100, 100, /100 unarchived runs.*Archive closed runs/],
      [999, 100, /100 unarchived runs.*Archive closed runs/],
      [1000, 0, /1,000 stored runs.*Archiving does not reduce/],
      [1000, 100, /1,000 stored runs.*Archiving does not reduce/],
    ] as const) {
      fill(total, unarchived);
      const before = JSON.stringify(records);
      await assert.rejects(
        create,
        (error) =>
          error instanceof ApiError && error.status === 409 && expected.test(error.message),
      );
      assert.equal(saved.length, 0);
      assert.equal(JSON.stringify(records), before);
    }
    fill(999, 99);
    await create();
    assert.equal(saved.length, 1, 'Existing below-limit behavior stays available');
  });
}
