/** Interpretation of the pinned SysAdmin task contract; never a replacement scheduler. */
export type NativeObject = Record<string, unknown>;
export type TaskFinding = {
  id: string;
  severity: 'attention' | 'information' | 'unknown';
  title: string;
  detail: string;
  fields: string[];
};
export type NativeMoment = {
  raw: string;
  sortable: string;
  wallMilliseconds: number;
  date: string;
  time: string;
};
export function nativeMoment(value: unknown): NativeMoment | undefined {
  if (typeof value !== 'string') return;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return;
  const [, year, month, day, hour, minute, second = '00'] = match;
  const milliseconds = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  const check = new Date(milliseconds);
  if (
    check.getUTCFullYear() !== +year ||
    check.getUTCMonth() !== +month - 1 ||
    check.getUTCDate() !== +day ||
    +hour > 23 ||
    +minute > 59 ||
    +second > 59
  )
    return;
  return {
    raw: value,
    sortable: `${year}-${month}-${day} ${hour}:${minute}:${second}`,
    wallMilliseconds: milliseconds,
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}:${second}`,
  };
}
export function wallDuration(start: unknown, end: unknown) {
  const a = nativeMoment(start),
    b = nativeMoment(end);
  if (!a || !b) return;
  const seconds = (b.wallMilliseconds - a.wallMilliseconds) / 1000;
  if (seconds < 0 || seconds > 366 * 86400) return;
  return seconds;
}
export function durationLabel(seconds: number | undefined) {
  if (seconds === undefined) return 'Not available';
  if (seconds === 0) return '<1 sec';
  if (seconds < 60) return `${seconds.toFixed(0)} sec`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${Math.floor(seconds % 60)} sec`;
  return `${Math.floor(seconds / 3600)} hr ${Math.floor((seconds % 3600) / 60)} min`;
}
export function nativeText(value: unknown, fallback = 'Not reported') {
  return typeof value === 'string' && value.trim()
    ? value
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : fallback;
}
function integer(value: unknown, minimum: number, maximum: number) {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^\d+$/.test(text)) return;
  const parsed = Number(text);
  if (Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum) return parsed;
}
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function clock(value: unknown) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
    ? value
    : undefined;
}
export type ScheduleExplanation = {
  period: string;
  daily: string;
  limits: string[];
  warnings: string[];
  conditional: boolean;
};
export function explainSchedule(task: NativeObject): ScheduleExplanation {
  const result: ScheduleExplanation = {
    period: 'Schedule not recognized',
    daily: '',
    limits: [],
    warnings: [],
    conditional: false,
  };
  const period = task.TimePeriod;
  if (period === 'On Demand') {
    result.period = 'Runs only when requested';
    result.conditional = true;
  } else if (period === 'Run After') {
    result.conditional = true;
    result.period = 'Runs after its predecessor completes';
    if (typeof task.RunAfterGUID === 'string' && task.RunAfterGUID)
      result.limits.push('Predecessor GUID: ' + task.RunAfterGUID);
    else result.warnings.push('The predecessor GUID is missing.');
  } else if (period === 'Daily') {
    const every = integer(task.TimePeriodEvery, 1, 7);
    result.period = every
      ? `Every ${every === 1 ? 'day' : every + ' days'}`
      : 'Daily schedule with an unrecognized interval';
    if (!every) result.warnings.push('A daily interval must be between 1 and 7 days.');
  } else if (period === 'Weekly') {
    const every = integer(task.TimePeriodEvery, 1, 5);
    const days = typeof task.TimePeriodDay === 'string' ? task.TimePeriodDay : '';
    if (/^[1-7]+$/.test(days) && new Set(days).size === days.length && every)
      result.period = `Every ${every === 1 ? 'week' : every + ' weeks'} on ${[...days].map((day) => dayNames[+day - 1]).join(', ')}`;
    else result.warnings.push('The weekly interval or selected days cannot be interpreted.');
  } else if (period === 'Monthly') {
    const every = integer(task.TimePeriodEvery, 1, 12);
    const day = integer(task.TimePeriodDay, 1, 31);
    if (every && day)
      result.period = `Every ${every === 1 ? 'month' : every + ' months'}, ${day === 31 ? 'on its last day' : 'on day ' + day}`;
    else result.warnings.push('The monthly interval or day cannot be interpreted.');
    if (day && day > 28 && day < 31)
      result.limits.push(
        'Some months do not contain this calendar day. Consult native scheduling behavior.',
      );
  } else if (period === 'Monthly Special') {
    const every = integer(task.TimePeriodEvery, 1, 12);
    const match =
      typeof task.TimePeriodDay === 'string' ? /^([1-5])\^([1-7])$/.exec(task.TimePeriodDay) : null;
    if (every && match)
      result.period = `Every ${every === 1 ? 'month' : every + ' months'}, ${['first', 'second', 'third', 'fourth', 'last'][+match[1] - 1]} ${dayNames[+match[2] - 1]}`;
    else result.warnings.push('The monthly weekday selection cannot be interpreted.');
  } else result.warnings.push('The native time period is missing or unsupported.');
  if (!result.conditional) {
    const start = clock(task.DailyStartTime);
    if (task.DailyFrequency === 'Once')
      result.daily = start ? 'Once at ' + start : 'Once; start time not recognized';
    else if (task.DailyFrequency === 'Several') {
      const interval = integer(task.DailyIncrement, 1, 1440);
      const unit =
        task.DailyFrequencyTime === 'Minutes'
          ? 'minutes'
          : task.DailyFrequencyTime === 'Hourly'
            ? 'hours'
            : undefined;
      const end = clock(task.DailyEndTime);
      if (interval && unit && start && end) {
        result.daily = `Every ${interval} ${unit}, from ${start} through ${end}`;
        if (start > end)
          result.warnings.push(
            'The daily end precedes the start. Verify the intended scheduling window in IRIS.',
          );
      } else result.warnings.push('The within-day frequency is incomplete or unrecognized.');
    } else result.warnings.push('The daily frequency is missing or unsupported.');
  }
  if (typeof task.StartDate === 'string' && task.StartDate)
    result.limits.push('First scheduling date: ' + task.StartDate);
  if (typeof task.EndDate === 'string' && task.EndDate)
    result.limits.push('Last scheduling date: ' + task.EndDate);
  if (task.MirrorStatus)
    result.limits.push(
      'Mirror eligibility: ' +
        nativeText(task.MirrorStatus) +
        ' (only when this instance is a mirror member)',
    );
  if (task.RescheduleOnStart === true)
    result.limits.push('Pending work is rescheduled at system startup.');
  result.limits.push(
    'Times are native instance wall time. The API does not include a UTC offset; Waypoint does not predict the next run.',
  );
  return result;
}
export type TaskExecutionState = 'running' | 'success' | 'failure' | 'unknown';
export function taskExecutionState(info: NativeObject | undefined): TaskExecutionState {
  if (!info) return 'unknown';
  if (String(info.Status) === '-1') return 'running';
  if (['-2', '-3', '-4', '-5'].includes(String(info.Status))) return 'failure';
  if (String(info.Status) === '1' && nativeMoment(info.LastFinished)) return 'success';
  if (typeof info.Error === 'string' && info.Error.trim() && info.Error !== 'Success')
    return 'failure';
  return 'unknown';
}
export type HistoryOutcome = 'success' | 'error' | 'running' | 'unknown';
export function historyOutcome(row: NativeObject): HistoryOutcome {
  if (typeof row.ErrNumber === 'number' && row.ErrNumber !== 0) return 'error';
  if (['-2', '-3', '-4', '-5'].includes(String(row.Status))) return 'error';
  if (String(row.Status) === '-1' && !row.Completed) return 'running';
  if (nativeMoment(row.Completed) && (String(row.Status) === '1' || row.Result === 'Success'))
    return 'success';
  return 'unknown';
}
export type HistoryRow = {
  key: string;
  source: NativeObject;
  outcome: HistoryOutcome;
  started?: NativeMoment;
  completed?: NativeMoment;
  duration?: number;
};
export function normalizeTaskHistory(value: unknown, taskId?: string): HistoryRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is NativeObject => !!row && typeof row === 'object' && !Array.isArray(row))
    .filter((row) => !taskId || String(row.TaskId) === String(Number(taskId)))
    .map((row, index) => ({
      key: `${row.TaskId ?? ''}:${row.LogDatetime ?? ''}:${row.Pid ?? ''}:${index}`,
      source: row,
      outcome: historyOutcome(row),
      started: nativeMoment(row.LastStart),
      completed: nativeMoment(row.Completed),
      duration: wallDuration(row.LastStart, row.Completed),
    }))
    .sort((a, b) => (b.started?.sortable ?? '').localeCompare(a.started?.sortable ?? ''));
}
export function historyStatistics(rows: HistoryRow[]) {
  const durations = rows
    .flatMap((row) => (row.duration === undefined ? [] : [row.duration]))
    .sort((a, b) => a - b);
  const median = durations.length
    ? durations.length % 2
      ? durations[Math.floor(durations.length / 2)]
      : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2
    : undefined;
  return {
    total: rows.length,
    successes: rows.filter((row) => row.outcome === 'success').length,
    errors: rows.filter((row) => row.outcome === 'error').length,
    running: rows.filter((row) => row.outcome === 'running').length,
    unknown: rows.filter((row) => row.outcome === 'unknown').length,
    medianDuration: median,
    maximumDuration: durations.at(-1),
    measuredDurations: durations.length,
  };
}
export function taskReadiness(
  task: NativeObject | undefined,
  info: NativeObject | undefined,
  history: HistoryRow[] | undefined,
): TaskFinding[] {
  const findings: TaskFinding[] = [];
  const add = (
    id: string,
    severity: TaskFinding['severity'],
    title: string,
    detail: string,
    fields: string[] = [],
  ) => findings.push({ id, severity, title, detail, fields });
  if (!task) {
    add(
      'configuration',
      'unknown',
      'Configuration unavailable',
      'The task definition could not be read. Do not infer its execution settings.',
    );
    return findings;
  }
  if (!task.TaskClass || !task.NameSpace)
    add(
      'entry',
      'attention',
      'Execution target is incomplete',
      'The task class or namespace is not present in the returned configuration.',
      ['TaskClass', 'NameSpace'],
    );
  if (!task.RunAsUser)
    add(
      'identity',
      'unknown',
      'Run-as identity not reported',
      'Check the native execution identity before requesting a run.',
      ['RunAsUser'],
    );
  if (task.SuspendOnError === false)
    add(
      'continue-errors',
      'information',
      'Scheduling continues after a task error',
      'This task does not automatically suspend when its task method returns an error.',
      ['SuspendOnError'],
    );
  if (task.SuspendTerminated === false)
    add(
      'restart',
      'information',
      'Interrupted work can be rescheduled',
      'A shutdown-interrupted task is not configured to suspend automatically.',
      ['SuspendTerminated'],
    );
  if (task.Expires === true)
    add(
      'expiration',
      'information',
      'Pending work can expire',
      'An expired request can be skipped. Inspect expiration offsets and notification recipients.',
      ['ExpiresDays', 'ExpiresHours', 'ExpiresMinutes', 'EmailOnExpiration'],
    );
  if (task.EmailOutput === true && !task.OutputFilename)
    add(
      'output',
      'attention',
      'Email output has no reported output file',
      'Check the configured output destination and completion recipients.',
      ['EmailOutput', 'OutputFilename', 'OutputDirectory'],
    );
  if (!Array.isArray(task.EmailOnError) || !task.EmailOnError.length)
    add(
      'error-routing',
      'information',
      'No email recipients for task errors',
      'Agree how this task’s failures will be noticed. This finding does not imply that other monitoring is absent.',
      ['EmailOnError'],
    );
  const schedule = explainSchedule(task);
  schedule.warnings.forEach((warning, index) =>
    add('schedule-' + index, 'attention', 'Review schedule fields', warning, [
      'TimePeriod',
      'DailyFrequency',
    ]),
  );
  if (!info)
    add(
      'state',
      'unknown',
      'Live execution state unavailable',
      'The task definition is not evidence that the task is idle or scheduled.',
    );
  else {
    const state = taskExecutionState(info);
    if (state === 'running')
      add(
        'running',
        'attention',
        'Task is currently running',
        'Suspending scheduling does not stop the already running process. Avoid requesting another run until its result is understood.',
        ['Status', 'LastStarted'],
      );
    if (state === 'failure')
      add(
        'failed',
        'attention',
        'Last reported execution needs investigation',
        nativeText(info.Error, 'Inspect the native task status and recent history.'),
        ['Status', 'Error'],
      );
    if (state === 'unknown')
      add(
        'last-result',
        'unknown',
        'Last result cannot be classified',
        'Missing or custom status values do not establish success.',
        ['Status', 'LastFinished'],
      );
    if (info.Suspended === true)
      add(
        'suspended',
        'attention',
        'Task scheduling is suspended',
        'Check whether an active maintenance window owns this suspension before resuming.',
        ['Suspended'],
      );
    else if (info.Suspended !== false)
      add(
        'suspension',
        'unknown',
        'Scheduling state not reported',
        'The native response did not contain a boolean Suspended field.',
        ['Suspended'],
      );
    if (!info.NextScheduled && !schedule.conditional && info.Suspended === false)
      add(
        'next',
        'attention',
        'No next execution reported',
        'Check scheduling boundaries, predecessor conditions and native task manager state.',
        ['NextScheduled'],
      );
  }
  if (history === undefined)
    add(
      'history',
      'unknown',
      'History unavailable',
      'Read access to configuration does not imply access to execution history.',
    );
  else {
    const stats = historyStatistics(history);
    if (!stats.total)
      add(
        'history-empty',
        'information',
        'No history in this result',
        'The bounded native response contains no matching task executions. This does not prove the task has never run.',
      );
    if (stats.errors)
      add(
        'history-errors',
        'attention',
        `${stats.errors} error entries in the loaded history`,
        'Inspect each entry and its result. The loaded sample is not the complete retention period.',
        ['ErrNumber', 'Status', 'Result'],
      );
    if (stats.unknown)
      add(
        'history-unknown',
        'unknown',
        `${stats.unknown} unclassified history entries`,
        'Custom native status/result values are shown without guessing their outcome.',
        ['Status', 'Result'],
      );
  }
  return findings;
}
