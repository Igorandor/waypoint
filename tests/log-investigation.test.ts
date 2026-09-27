import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLogLines,
  commonLogMessages,
  filterLogLines,
  logContext,
  captureOverlap,
  validateLogObservation,
  type LogCapture,
} from '../shared/log-investigation';
test('log investigation treats search as literal text and keeps unknown continuation lines', () => {
  const lines = parseLogLines({
    source: 'messages',
    lines: [
      '2026-09-27 12:00:00 pid=42 ERROR [query.*]',
      'continuation',
      '2026-09-27 12:01:00 pid=43 success',
    ],
  });
  assert.equal(lines[0].pid, '42');
  assert.equal(lines[1].signal, 'unclassified');
  const filter = {
    text: '[query.*]',
    exclude: '',
    signal: 'all',
    pid: '',
    from: '',
    to: '',
    caseSensitive: false,
  };
  assert.equal(filterLogLines(lines, filter).length, 1);
  assert.equal(logContext(lines, 0, 1).length, 2);
  assert.equal(filterLogLines(lines, { ...filter, text: '', from: '2026-09-27' }).length, 2);
});
test('capture comparison rejects missing overlap and shrinking files without inventing new lines', () => {
  const capture = (lines: string[], bytes: number): LogCapture => ({
    id: 'test',
    capturedAt: '2026-09-27T00:00:00Z',
    bookmarks: [],
    observation: { source: 'messages', lines, bytes, bounded: true },
  });
  const a = capture(['a', 'b', 'c'], 100),
    b = capture(['b', 'c', 'd'], 110);
  assert.deepEqual(captureOverlap(a, b).newLines, ['d']);
  assert.equal(captureOverlap(a, capture(['x'], 120)).reliable, false);
  assert.equal(captureOverlap(a, capture(['c', 'd'], 50)).reliable, false);
});
test('native source validation and calendar parsing reject incompatible evidence', () => {
  assert.throws(() => validateLogObservation({ source: 'alerts', lines: [] }, 'messages'));
  assert.throws(() => validateLogObservation({ source: 'messages', lines: [{}] }, 'messages'));
  const lines = parseLogLines({
    source: 'messages',
    lines: ['2026-02-30 12:00:00 invalid', '09/27/2026-12:00:00 good'],
  });
  assert.equal(lines[0].timestamp, undefined);
  assert.equal(lines[1].date, '2026-09-27');
});
test('real native log prefixes retain millisecond precision and parenthesized process identity', () => {
  const lines = parseLogLines({
    source: 'messages',
    lines: [
      '09/26/26-19:20:26:830 (485) 0 [Database.MountedRW] Mounted database USER',
      '09/26/2026-19:20:26.831 (486) 9 [Native.Event] Message',
      '09/26/26-19:20:27:123 (487) 2 warning: high usage',
    ],
  });
  assert.equal(lines[0].timestamp, '2026-09-26 19:20:26.830');
  assert.equal(lines[0].pid, '485');
  assert.equal(lines[0].signal, 'unclassified');
  assert.equal(lines[1].timestamp, '2026-09-26 19:20:26.831');
  assert.equal(lines[1].pid, '486');
  assert.equal(lines[1].signal, 'unclassified');
  assert.equal(lines[2].signal, 'warning');
});
test('repeated messages normalize native colon and decimal milliseconds while retaining process identity', () => {
  const lines = parseLogLines({
    source: 'messages',
    lines: [
      '09/26/26-19:20:26:830 (485) 0 [Database.MountedRW] Mounted database USER',
      '09/26/26-19:20:27:831 (485) 0 [Database.MountedRW] Mounted database USER',
      '09/26/26-19:20:28.832 (485) 0 [Database.MountedRW] Mounted database USER',
      '09/26/26-19:20:29:833 (486) 0 [Database.MountedRW] Mounted database USER',
    ],
  });
  const groups = commonLogMessages(lines);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[0].message, '(485) 0 [Database.MountedRW] Mounted database USER');
});
