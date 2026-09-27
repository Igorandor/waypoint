import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptCommandReview,
  submitCommandCandidate,
  type Candidate,
} from '../src/commands/Operations';
import type { CommandResult } from '../shared/command-result';

function reviewed(before: Record<string, unknown>, id = 'first-review'): CommandResult {
  return {
    format: 1,
    id,
    owner: 'operator',
    instance: 'fixture',
    createdAt: '2026-09-27T10:00:00.000Z',
    updatedAt: '2026-09-27T10:00:00.000Z',
    expiresAt: '2026-09-27T10:10:00.000Z',
    status: 'reviewed',
    operation: { path: '/v2/task', method: 'PUT', query: { id: '7' } },
    title: 'Update task',
    target: '7',
    confirmation: '7',
    before,
    proposed: { Description: 'Operator draft' },
    fields: ['Description'],
    writeOnlyFields: [],
    read: { path: '/v2/task', query: { id: '7' }, mode: 'fields' },
    message: 'Review the proposed change before confirming.',
    events: [],
  };
}

function draft(): Candidate {
  const base = { Description: 'Original', SuspendOnError: false };
  return {
    title: 'Update selected fields',
    path: '/v2/task',
    method: 'PUT',
    query: { id: '7' },
    body: { Description: 'Operator draft' },
    base,
    stage: 'review',
    confirm: '7',
    identity: '7',
    destructive: false,
    review: reviewed(base),
  };
}

test('failed preflight preserves fields and target but invalidates review without sending or reading a receipt', async () => {
  for (const reason of ['HTTP 403: permission revoked', 'GET connection lost']) {
    let writes = 0;
    let receipts = 0;
    const candidate = draft();
    const result = await submitCommandCandidate(candidate, {
      readCurrent: async () => {
        throw new Error(reason);
      },
      execute: async () => {
        writes++;
        return candidate.review!;
      },
      readReceipt: async () => {
        receipts++;
        return candidate.review!;
      },
    });
    assert.equal(result.sent, false);
    if (result.sent) throw new Error('Unexpected dispatch');
    assert.deepEqual(result.draft.body, { Description: 'Operator draft' });
    assert.deepEqual(result.draft.query, { id: '7' });
    assert.equal(result.draft.identity, '7');
    assert.equal(result.draft.stage, 'prepare');
    assert.equal(result.draft.review, undefined);
    assert.equal(result.draft.confirm, '');
    assert.match(result.error, /No command was sent/);
    assert.match(result.error, /draft is preserved/);
    assert.equal(writes, 0);
    assert.equal(receipts, 0);
    assert.equal(candidate.stage, 'review');
  }
});

test('same-field conflict retains draft and a manual fresh review replaces the obsolete baseline', async () => {
  const candidate = draft();
  const current = { Description: 'Concurrent change', SuspendOnError: true };
  const dispatched: Array<{ id: string; confirmation: string }> = [];
  let receiptReads = 0;
  const transport = {
    readCurrent: async () => current,
    execute: async (id: string, confirmation: string) => {
      dispatched.push({ id, confirmation });
      return { ...reviewed(current, id), status: 'verified' as const };
    },
    readReceipt: async () => {
      receiptReads++;
      return reviewed(current);
    },
  };
  const conflict = await submitCommandCandidate(candidate, transport);
  assert.equal(conflict.sent, false);
  if (conflict.sent) throw new Error('Unexpected dispatch');
  assert.match(conflict.error, /Native state changed: Description/);
  assert.equal(dispatched.length, 0);
  assert.equal(receiptReads, 0);
  await assert.rejects(submitCommandCandidate(conflict.draft, transport), /Review this command/);
  const fresh = acceptCommandReview(conflict.draft, reviewed(current, 'second-review'));
  assert.deepEqual(fresh.base, current);
  assert.deepEqual(fresh.body, { Description: 'Operator draft' });
  const completed = await submitCommandCandidate(fresh, transport);
  assert.equal(completed.sent, true);
  assert.deepEqual(dispatched, [{ id: 'second-review', confirmation: '7' }]);
  assert.equal(receiptReads, 0);
});

test('fresh review acknowledges changes since initial inspection without resetting proposed values', async () => {
  const candidate = draft();
  const newer = { Description: 'Changed before review', SuspendOnError: true };
  const accepted = acceptCommandReview(candidate, reviewed(newer));
  assert.deepEqual(accepted.base, newer);
  assert.deepEqual(accepted.body, candidate.body);
  assert.equal(accepted.confirm, '');
  const result = await submitCommandCandidate(accepted, {
    readCurrent: async () => ({ ...newer, SuspendOnError: false }),
    execute: async () => ({ ...accepted.review!, status: 'verified' }),
    readReceipt: async () => {
      throw new Error('Must not read a receipt for a successful response.');
    },
  });
  assert.equal(result.sent, true);
});

test('deletion conflicts compare every inspected field and require confirmation after another review', async () => {
  const candidate = { ...draft(), method: 'DELETE' as const, body: {}, destructive: true };
  const result = await submitCommandCandidate(candidate, {
    readCurrent: async () => ({ ...candidate.base, SuspendOnError: true }),
    execute: async () => {
      throw new Error('No delete should be sent');
    },
    readReceipt: async () => {
      throw new Error('No receipt should be read');
    },
  });
  assert.equal(result.sent, false);
  if (result.sent) throw new Error('Unexpected dispatch');
  assert.match(result.error, /SuspendOnError/);
  const next = acceptCommandReview(
    result.draft,
    reviewed({ Description: 'Original', SuspendOnError: true }),
  );
  assert.equal(next.confirm, '');
  assert.equal(next.destructive, true);
});

test('lost execution response consults the existing receipt once and never preserves a replayable draft', async () => {
  const candidate = draft();
  for (const receiptAvailable of [true, false]) {
    let writes = 0;
    let receiptReads = 0;
    const result = await submitCommandCandidate(candidate, {
      readCurrent: async () => candidate.base!,
      execute: async () => {
        writes++;
        throw new Error('Execution response lost');
      },
      readReceipt: async () => {
        receiptReads++;
        if (!receiptAvailable) throw new Error('Receipt unavailable');
        return { ...candidate.review!, status: 'verified' };
      },
    });
    assert.equal(result.sent, true);
    if (!result.sent) throw new Error('Expected one execution attempt');
    assert.equal(result.receipt.status, receiptAvailable ? 'verified' : 'uncertain');
    assert.equal(Object.hasOwn(result, 'draft'), false);
    assert.equal(writes, 1);
    assert.equal(receiptReads, 1);
  }
});

test('commands with no readable baseline still dispatch once and retain uncertainty on transport loss', async () => {
  const candidate = { ...draft(), base: undefined };
  let reads = 0;
  let writes = 0;
  const result = await submitCommandCandidate(candidate, {
    readCurrent: async () => {
      reads++;
      return {};
    },
    execute: async () => {
      writes++;
      throw new Error('Lost response');
    },
    readReceipt: async () => {
      throw new Error('Unavailable');
    },
  });
  assert.equal(result.sent, true);
  assert.equal(reads, 0);
  assert.equal(writes, 1);
});
