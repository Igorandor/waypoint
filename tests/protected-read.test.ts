import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readProtected, refreshProtected } from '../src/protected-read';
import { request, RequestError } from '../src/api';

test('protected GET invalidates only an explicitly forbidden resource', async () => {
  for (const status of [403, 500, 401, 404]) {
    let displayed: { id: string } | undefined = { id: 'saved-record' };
    let exportsAvailable = true;
    const error = new RequestError('Read refused: ' + status, status);
    await assert.rejects(
      readProtected(
        'commands/saved-record',
        (value: { id: string }) => {
          displayed = value;
        },
        () => {
          displayed = undefined;
          exportsAvailable = false;
        },
        (async (...args: unknown[]) => {
          assert.deepEqual(args, ['commands/saved-record'], 'the helper never sends POST content');
          throw error;
        }) as typeof request,
      ),
      (cause) => cause === error,
    );
    assert.equal(displayed === undefined, status === 403);
    assert.equal(exportsAvailable, status !== 403);
  }
});

test('a refreshed index cannot leave a refused selected receipt available for export', async () => {
  let index = [{ id: 'restricted' }, { id: 'allowed' }];
  let selected: { id: string; observed: unknown } | undefined = {
    id: 'restricted',
    observed: { protected: true },
  };
  const reads: string[] = [];
  const transport = (async (resource: string) => {
    reads.push(resource);
    if (resource === 'commands') return [{ id: 'allowed' }];
    throw new RequestError('Current record privileges are required.', 403);
  }) as typeof request;
  const message = await refreshProtected([
    () =>
      readProtected(
        'commands',
        (value: typeof index) => {
          index = value;
        },
        () => {
          index = [];
        },
        transport,
      ),
    () =>
      readProtected(
        'commands/restricted',
        (value: NonNullable<typeof selected>) => {
          selected = value;
        },
        () => {
          selected = undefined;
          index = index.filter((record) => record.id !== 'restricted');
        },
        transport,
      ),
  ]);
  assert.equal(selected, undefined);
  assert.deepEqual(index, [{ id: 'allowed' }]);
  assert.equal(message, 'Current record privileges are required.');
  assert.deepEqual(reads, ['commands', 'commands/restricted']);
});

test('list and detail revalidation remain independent after a refused or unavailable list', async () => {
  for (const listStatus of [403, 500]) {
    for (const detailStatus of [200, 403, 500]) {
      let index = [{ id: 'run' }];
      let selected: { id: string; revision: number } | undefined = { id: 'run', revision: 1 };
      const calls: string[] = [];
      const transport = (async (resource: string) => {
        calls.push(resource);
        const status = resource === 'runs' ? listStatus : detailStatus;
        if (status !== 200) throw new RequestError(resource + ' unavailable', status);
        return { id: 'run', revision: 2 };
      }) as typeof request;
      await refreshProtected([
        () =>
          readProtected(
            'runs',
            (value: typeof index) => {
              index = value;
            },
            () => {
              index = [];
            },
            transport,
          ),
        () =>
          readProtected(
            'runs/run',
            (value: NonNullable<typeof selected>) => {
              selected = value;
            },
            () => {
              selected = undefined;
            },
            transport,
          ),
      ]);
      assert.equal(index.length, listStatus === 403 ? 0 : 1);
      assert.equal(
        selected?.revision,
        detailStatus === 403 ? undefined : detailStatus === 200 ? 2 : 1,
      );
      assert.deepEqual(calls, ['runs', 'runs/run']);
    }
  }
});

test('unauthenticated refresh stops after request() has triggered the existing session-ended flow', async () => {
  let laterReads = 0;
  const message = await refreshProtected([
    async () => {
      throw new RequestError('Session expired.', 401);
    },
    async () => {
      laterReads++;
    },
  ]);
  assert.equal(message, 'Session expired.');
  assert.equal(laterReads, 0);
});
