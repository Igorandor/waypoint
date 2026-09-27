import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  explainSchedule,
  durationLabel,
  nativeMoment,
  wallDuration,
  normalizeTaskHistory,
  historyStatistics,
  taskReadiness,
  taskExecutionState,
} from '../shared/task-insights';
test('native wall timestamps validate calendar values without inventing a timezone', () => {
  assert.equal(durationLabel(0), '<1 sec');
  assert.equal(nativeMoment('2026-02-30 12:00:00'), undefined);
  assert.equal(nativeMoment('2026-09-27T12:00:00Z'), undefined);
  assert.equal(nativeMoment('2026-09-27 12:00')?.sortable, '2026-09-27 12:00:00');
  assert.equal(wallDuration('2026-09-27 12:00', '2026-09-27 12:02'), 120);
  assert.equal(wallDuration('2026-09-27 12:02', '2026-09-27 12:00'), undefined);
});
test('task schedule interpretation follows the pinned native enum and last-day semantics', () => {
  const monthly = explainSchedule({
    TimePeriod: 'Monthly',
    TimePeriodEvery: '2',
    TimePeriodDay: '31',
    DailyFrequency: 'Once',
    DailyStartTime: '03:00',
  });
  assert.match(monthly.period, /last day/);
  assert.match(monthly.period, /2 months/);
  const weekly = explainSchedule({
    TimePeriod: 'Weekly',
    TimePeriodEvery: '1',
    TimePeriodDay: '23456',
    DailyFrequency: 'Once',
    DailyStartTime: '03:00',
  });
  assert.match(weekly.period, /Monday, Tuesday, Wednesday, Thursday, Friday/);
  assert.equal(explainSchedule({ TimePeriod: 'Run After' }).conditional, true);
  assert.equal(explainSchedule({ TimePeriod: 'On Demand' }).warnings.length, 0);
  assert.ok(
    explainSchedule({
      TimePeriod: 'Monthly Special',
      TimePeriodEvery: '1',
      TimePeriodDay: '5^7',
    }).period.includes('last Saturday'),
  );
});
test('history preserves unknown custom status and scopes statistics to loaded task rows', () => {
  const rows = normalizeTaskHistory(
    [
      {
        TaskId: 1,
        LastStart: '2026-09-27 12:00:00',
        Completed: '2026-09-27 12:01:00',
        Status: '1',
      },
      { TaskId: 1, Status: 'CUSTOM' },
      { TaskId: 2, ErrNumber: 42 },
    ],
    '1',
  );
  assert.equal(rows.length, 2);
  assert.equal(historyStatistics(rows).successes, 1);
  assert.equal(historyStatistics(rows).unknown, 1);
  assert.equal(historyStatistics(rows).medianDuration, 60);
  assert.equal(taskExecutionState({ Status: '1' }), 'unknown');
  assert.equal(taskExecutionState({ Status: '-1' }), 'running');
});
test('unavailable task sources stay unknown and suspended scheduling never means stopped execution', () => {
  const findings = taskReadiness(
    { TaskClass: 'Custom.Task', NameSpace: 'USER', TimePeriod: 'On Demand' },
    { Suspended: true, Status: '-1' },
    undefined,
  );
  assert.ok(findings.some((item) => item.id === 'history' && item.severity === 'unknown'));
  assert.ok(findings.some((item) => item.id === 'running'));
  assert.ok(findings.some((item) => item.id === 'suspended'));
});
