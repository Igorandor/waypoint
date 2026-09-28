import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRuns } from '../shared/run-records';
import { validateStoredRun } from '../server/run-validation';
import { collectionComparisonPair } from './fixtures/comparison-collection';

test('shifted bounded windows retain limits without asserting native deletion or actual truncation', () => {
  const { before, after } = collectionComparisonPair();
  validateStoredRun(before);
  validateStoredRun(after);
  const original = structuredClone({ before, after });
  const source = compareRuns(before, after).sources[0];
  assert.deepEqual(source.beforeCollection, { requestedRowLimit: 100 });
  assert.deepEqual(source.afterCollection, { requestedRowLimit: 100 });
  assert.match(source.beforeCollectionNotice!, /Requested row limit: 100/);
  assert.match(source.afterCollectionNotice!, /does not establish that all source records/);
  assert.match(source.note, /does not establish native object creation or deletion/);
  assert.equal(source.truncated, false);
  assert.deepEqual(
    source.changes.map((change) => change.change),
    ['removed', 'removed', 'added', 'added'],
  );
  assert.equal(source.unchanged, 198);
  source.beforeCollection!.requestedRowLimit = 9;
  assert.deepEqual({ before, after }, original);
});
test('different and unrecorded limits remain side-specific without guessed historical numbers', () => {
  const different = collectionComparisonPair('different-limits');
  let source = compareRuns(different.before, different.after).sources[0];
  assert.equal(source.beforeCollection?.requestedRowLimit, 100);
  assert.equal(source.afterCollection?.requestedRowLimit, 50);
  assert.match(source.afterCollectionNotice!, /Requested row limit: 50/);
  const legacy = collectionComparisonPair('legacy');
  validateStoredRun(legacy.before);
  source = compareRuns(legacy.before, legacy.after).sources[0];
  assert.equal(source.beforeCollection, undefined);
  assert.match(source.beforeCollectionNotice!, /limit was not recorded/);
  assert.doesNotMatch(source.beforeCollectionNotice!, /100|50/);
  assert.equal(source.afterCollection?.requestedRowLimit, 100);
});
test('matching recorded windows retain collection boundaries even with no differences', () => {
  const { before, after } = collectionComparisonPair('identical');
  const result = compareRuns(before, after);
  assert.equal(result.totals.changed, 0);
  assert.equal(result.sources[0].changes.length, 0);
  assert.ok(result.sources[0].beforeCollectionNotice && result.sources[0].afterCollectionNotice);
  const exported = JSON.parse(JSON.stringify(result));
  assert.equal(exported.sources[0].beforeCollection.requestedRowLimit, 100);
});
test('failed or absent sources preserve their existing semantics and no unperformed collection claim', () => {
  const failed = collectionComparisonPair('failed');
  failed.after.steps[0].collection = { requestedRowLimit: 100 };
  const failedSource = compareRuns(failed.before, failed.after).sources[0];
  assert.equal(failedSource.state, 'unavailable');
  assert.equal(failedSource.changes.length, 0);
  assert.equal(failedSource.afterCollectionNotice, undefined);
  assert.equal(failedSource.afterCollection, undefined);
  failed.after.steps[0].status = 'pending';
  assert.equal(compareRuns(failed.before, failed.after).sources[0].afterCollection, undefined);
  const missing = collectionComparisonPair('missing');
  const missingSource = compareRuns(missing.before, missing.after).sources[0];
  assert.equal(missingSource.state, 'missing-after');
  assert.equal(missingSource.afterCollectionNotice, undefined);
  assert.equal(missingSource.changes.length, 0);
  assert.match(missingSource.note, /absence is not evidence/);
});
