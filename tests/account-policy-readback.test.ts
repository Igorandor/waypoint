import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandService } from '../server/command-service';
import { protectedField } from '../server/command-readback';
import { IrisClient } from '../server/upstream';
import type { CommandJournal } from '../server/command-journal';
import type { TargetReservations } from '../server/target-reservations';
import type { CommandResult } from '../shared/command-result';

const actor = { owner: 'operator', auth: 'fixture-auth' };
const names = ['ChangePassword', 'PasswordNeverExpires', 'HOTPKeyDisplay'];
function fixture(initial: Record<string, unknown>) {
  const state = {
    user: { ...initial },
    writes: 0,
    reads: 0,
    afterWrite: undefined as Record<string, unknown> | undefined,
  };
  const records = new Map<string, CommandResult>();
  // Only persistence and transport are substituted; review, projection, validation and readback are real.
  const journal = {
    instance: 'policy-fixture',
    count: async () => records.size,
    save: async (record: CommandResult) => {
      records.set(record.id, structuredClone(record));
    },
    read: async (_owner: string, id: string) => structuredClone(records.get(id)!),
  } as unknown as CommandJournal;
  const reservations = {
    withTarget: async (_target: unknown, _run: unknown, action: () => Promise<unknown>) => action(),
  } as unknown as TargetReservations;
  const client = new IrisClient('http://fixture.invalid', async (_url, options) => {
    if (options?.method === 'GET') {
      state.reads++;
      return Response.json({ result: state.user });
    }
    state.writes++;
    const body = JSON.parse(String(options?.body));
    state.user = state.afterWrite ?? { ...state.user, ...(body.User ?? body) };
    return Response.json({ result: {} });
  });
  return { service: new CommandService(journal, client, reservations), state, records };
}
function operation(body: Record<string, unknown>, Password?: string) {
  return {
    path: '/v2/security/user',
    method: 'POST' as const,
    query: { name: 'policy-fixture-user' },
    body: { User: body, ...(Password === undefined ? {} : { Password }) },
  };
}

test('real command preparation and fresh readback verify all three account policies in both directions', async () => {
  for (const value of [true, false]) {
    const proposed = Object.fromEntries(names.map((name) => [name, value]));
    const { service, state } = fixture(Object.fromEntries(names.map((name) => [name, !value])));
    const review = await service.review(actor, operation(proposed));
    assert.equal(state.writes, 0);
    assert.deepEqual(review.proposed, proposed);
    const result = await service.execute(actor, review.id, review.confirmation);
    assert.equal(result.status, 'verified');
    assert.deepEqual(result.fields, names);
    assert.deepEqual(result.writeOnlyFields, []);
    assert.equal(state.writes, 1);
    assert.equal(state.reads, 3, 'review, pre-dispatch revalidation and post-write readback');
  }
});

test('a policy changed after review conflicts before dispatch', async () => {
  for (const name of names) {
    const { service, state } = fixture({ [name]: false });
    const review = await service.review(actor, operation({ [name]: true }));
    state.user[name] = true;
    const result = await service.execute(actor, review.id, review.confirmation);
    assert.equal(result.status, 'conflict');
    assert.equal(state.writes, 0);
  }
});

test('missing, different and malformed policy readbacks stay uncertain and reconciliation never resends', async () => {
  for (const name of names) {
    for (const value of [undefined, false, 'true', 1, null, [], { value: true }]) {
      const { service, state } = fixture({ [name]: false });
      const review = await service.review(actor, operation({ [name]: true }));
      state.afterWrite = value === undefined ? {} : { [name]: value };
      const result = await service.execute(actor, review.id, review.confirmation);
      assert.equal(result.status, 'uncertain');
      state.user = { [name]: true };
      assert.equal((await service.reconcile(actor, review.id)).status, 'verified');
      assert.equal(state.writes, 1);
    }
  }
});

test('malformed submitted policy values and similarly named fields remain masked and write-only', async () => {
  for (const name of names) {
    for (const value of ['true', 0, 1, null, [], [false], { value: true }]) {
      const { service } = fixture({ [name]: false });
      const review = await service.review(actor, operation({ [name]: value }));
      assert.deepEqual(review.fields, []);
      assert.deepEqual(review.writeOnlyFields, [name]);
      assert.equal(review.proposed[name], '[redacted]');
    }
    assert.equal(protectedField(name.toLowerCase(), true), true);
  }
});

test('real secrets stay write-only alongside a verifiable policy and never enter persisted evidence', async () => {
  const { service, state, records } = fixture({
    ChangePassword: false,
    Password: 'old-secret-fixture',
  });
  const review = await service.review(
    actor,
    operation({ ChangePassword: true }, 'new-secret-fixture'),
  );
  const result = await service.execute(actor, review.id, review.confirmation);
  assert.equal(result.status, 'verified');
  assert.deepEqual(result.fields, ['ChangePassword']);
  assert.deepEqual(result.writeOnlyFields, ['Password']);
  assert.match(result.message, /Write-only fields were acknowledged but cannot be compared/);
  assert.equal(state.writes, 1);
  assert.doesNotMatch(
    JSON.stringify([...records.values()]),
    /old-secret-fixture|new-secret-fixture|fixture-auth/,
  );
  for (const key of ['Password', 'ClientSecret', 'HOTPKey', 'access_token']) {
    assert.equal(protectedField(key, { ChangePassword: true }), true);
    assert.equal(protectedField(key, [{ HOTPKeyDisplay: false }]), true);
    assert.equal(protectedField(key, false), true);
  }
  assert.equal(
    protectedField('Configuration', { PasswordNeverExpires: false, Password: 'secret' }),
    true,
  );
});
