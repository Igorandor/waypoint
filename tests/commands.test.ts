import test from 'node:test';
import assert from 'node:assert/strict';
import { changedKeys, candidateValue, newCommandBody } from '../shared/command-draft';
import { targets } from '../shared/commands';
import { bodySchema, parameters, resolveSchema, spec } from '../shared/schema';
import { validateOperation } from '../server/upstream';
test('Waypoint changes compare only selected fields, including nested replacements', () => {
  const before = { Description: 'old', Settings: { mode: 'safe' }, SuspendOnError: true };
  assert.deepEqual(
    changedKeys(before, { Description: 'new' }, { ...before, SuspendOnError: false }),
    [],
  );
  assert.deepEqual(
    changedKeys(before, { Description: 'new' }, { ...before, Description: 'external' }),
    ['Description'],
  );
  assert.deepEqual(
    changedKeys(before, { Settings: {} }, { ...before, Settings: { mode: 'external' } }),
    ['Settings'],
  );
});
test('native values seed independent command drafts without retaining aliases or masked credentials', () => {
  const old = { list: ['existing'] };
  const draft = candidateValue({ type: 'object' }, old);
  draft.list.push('new');
  assert.deepEqual(old, { list: ['existing'] });
  assert.equal(candidateValue({ type: 'string' }, '[redacted]'), '');
  assert.equal(candidateValue({ type: 'boolean' }, true), true);
});
test('every Waypoint target has a valid read and applicable write contract', () => {
  for (const target of targets) {
    const query = Object.fromEntries(
      parameters(target.list)
        .filter((p) => p.required)
        .map((p) => [p.name, 'fixture']),
    );
    assert.doesNotThrow(() => validateOperation({ path: target.list, method: 'GET', query }));
    assert.ok(spec.paths[target.record]);
    if (!target.opaque) assert.ok(spec.paths[target.record].get);
    if (!target.readOnly)
      assert.ok(spec.paths[target.record].put || spec.paths[target.record].post);
  }
});
test('on-demand task drafts contain every native field with matching scalar types', () => {
  const draft = newCommandBody('tasks', 'FixtureOperator'),
    schema = bodySchema('/v2/task', 'POST');
  for (const [name, raw] of Object.entries(schema.properties ?? {})) {
    const field = resolveSchema(raw);
    assert.ok(Object.hasOwn(draft, name), name);
    if (field.type === 'boolean') assert.equal(typeof draft[name], 'boolean', name);
    if (field.type === 'array') assert.ok(Array.isArray(draft[name]), name);
  }
  assert.equal(draft.RunAsUser, 'FixtureOperator');
  assert.equal(draft.TimePeriod, 'On Demand');
  assert.equal(draft.SuspendOnError, true);
});
