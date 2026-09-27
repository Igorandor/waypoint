import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readBoundedJson } from '../server/bounded-file';
test('bounded journal reader parses exact-limit JSON and rejects oversized files before allocation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'waypoint-bounded-'));
  try {
    const filename = join(directory, 'record.json');
    await writeFile(filename, '{"a":1}');
    assert.deepEqual(await readBoundedJson(filename, 7), { a: 1 });
    await assert.rejects(() => readBoundedJson(filename, 6), /budget/);
    await assert.rejects(() => readBoundedJson(directory, 100), /regular/);
  } finally {
    assert.ok(
      resolve(directory).startsWith(resolve(tmpdir()) + '\\waypoint-bounded-') ||
        resolve(directory).startsWith(resolve(tmpdir()) + '/waypoint-bounded-'),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
