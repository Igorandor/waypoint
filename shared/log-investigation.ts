export type LogSource = 'messages' | 'alerts';
export type LogObservation = {
  source: LogSource;
  lines: string[];
  bytes?: number;
  bounded?: boolean;
  notice?: string;
};
export type LogLine = {
  index: number;
  text: string;
  timestamp?: string;
  date?: string;
  pid?: string;
  signal: 'error' | 'warning' | 'information' | 'unclassified';
};
export type LogFilter = {
  text: string;
  exclude: string;
  signal: string;
  pid: string;
  from: string;
  to: string;
  caseSensitive: boolean;
};
export type LogBookmark = { id: string; index: number; text: string; note: string };
export type LogCapture = {
  id: string;
  capturedAt: string;
  observation: LogObservation;
  bookmarks: LogBookmark[];
};
export function validateLogObservation(value: unknown, expected: LogSource): LogObservation {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('The log response is not an object.');
  const object = value as Record<string, unknown>;
  if (
    object.source !== expected ||
    !Array.isArray(object.lines) ||
    object.lines.length > 500 ||
    object.lines.some((line) => typeof line !== 'string')
  )
    throw new Error('The log response does not match the requested bounded source.');
  return {
    source: expected,
    lines: object.lines as string[],
    bytes:
      typeof object.bytes === 'number' && Number.isFinite(object.bytes) ? object.bytes : undefined,
    bounded: object.bounded === true,
    notice: typeof object.notice === 'string' ? object.notice : undefined,
  };
}
function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
function timestamp(text: string) {
  // Recognize only explicit ISO or native month/day/year timestamps; do not guess timezones.
  const iso = /\b(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\b/.exec(text);
  const native = iso
    ? null
    : /^\s*(\d{2})\/(\d{2})\/(\d{4}|\d{2})[ -](\d{2}):(\d{2}):(\d{2})(?:[.:](\d+))?\b/.exec(text);
  const match = iso ?? native;
  if (!match) return;
  const year = iso ? +match[1] : match[3].length === 2 ? 2000 + +match[3] : +match[3];
  const month = iso ? +match[2] : +match[1],
    day = iso ? +match[3] : +match[2];
  if (!validDate(year, month, day) || +match[4] > 23 || +match[5] > 59 || +match[6] > 59) return;
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return {
    timestamp:
      date + ' ' + match[4] + ':' + match[5] + ':' + match[6] + (match[7] ? '.' + match[7] : ''),
    date,
  };
}
export function parseLogLines(observation: LogObservation): LogLine[] {
  return observation.lines.map((text, index) => {
    const moment = timestamp(text);
    const nativePid =
      /^\s*\d{2}\/\d{2}\/(?:\d{4}|\d{2})[ -]\d{2}:\d{2}:\d{2}(?:[.:]\d+)?\s+\((\d+)\)/.exec(
        text,
      )?.[1];
    const pid = nativePid ?? /(?:\bpid\s*[=:]\s*|\bprocess\s+)(\d+)\b/i.exec(text)?.[1];
    // Text signals aid filtering; native severity is not inferred from undocumented numeric fields.
    const signal = /\b(?:error|fatal|panic|failed|failure)\b/i.test(text)
      ? 'error'
      : /\b(?:warning|warn)\b/i.test(text)
        ? 'warning'
        : /\b(?:information|info|started|completed|success)\b/i.test(text)
          ? 'information'
          : 'unclassified';
    return { index, text, ...moment, pid, signal };
  });
}
export function filterLogLines(lines: LogLine[], filter: LogFilter) {
  const fold = (value: string) => (filter.caseSensitive ? value : value.toLowerCase());
  const include = fold(filter.text),
    exclude = fold(filter.exclude);
  return lines.filter((line) => {
    const text = fold(line.text);
    return (
      (!include || text.includes(include)) &&
      (!exclude || !text.includes(exclude)) &&
      (filter.signal === 'all' || line.signal === filter.signal) &&
      (!filter.pid || line.pid === filter.pid) &&
      (!filter.from || (line.date !== undefined && line.date >= filter.from)) &&
      (!filter.to || (line.date !== undefined && line.date <= filter.to))
    );
  });
}
export function logContext(lines: LogLine[], index: number, radius: number) {
  const bounded = Math.max(0, Math.min(10, Math.floor(radius)));
  return lines.slice(Math.max(0, index - bounded), Math.min(lines.length, index + bounded + 1));
}
export function logStatistics(lines: LogLine[]) {
  const stamps = lines.flatMap((line) => (line.timestamp ? [line.timestamp] : [])).sort();
  const counts = { error: 0, warning: 0, information: 0, unclassified: 0 };
  const processes = new Map<string, number>();
  for (const line of lines) {
    counts[line.signal]++;
    if (line.pid) processes.set(line.pid, (processes.get(line.pid) ?? 0) + 1);
  }
  return {
    total: lines.length,
    counts,
    firstTimestamp: stamps[0],
    lastTimestamp: stamps.at(-1),
    withoutTimestamp: lines.length - stamps.length,
    processes: [...processes].sort((a, b) => b[1] - a[1]).map(([pid, count]) => ({ pid, count })),
  };
}
export function commonLogMessages(lines: LogLine[]) {
  const groups = new Map<string, { message: string; count: number; indices: number[] }>();
  for (const line of lines) {
    const message = line.text
      .replace(/^\s*\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?\s*/, '')
      .replace(/^\s*\d{2}\/\d{2}\/\d{2,4}[ -]\d{2}:\d{2}:\d{2}(?:[.:]\d+)?\s*/, '')
      .trim();
    const existing = groups.get(message);
    if (existing) {
      existing.count++;
      existing.indices.push(line.index);
    } else groups.set(message, { message, count: 1, indices: [line.index] });
  }
  return [...groups.values()]
    .filter((group) => group.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}
export function captureOverlap(previous: LogCapture, current: LogCapture) {
  if (previous.observation.source !== current.observation.source)
    return {
      overlap: 0,
      newLines: [] as string[],
      reliable: false,
      reason: 'Different log sources cannot be compared.',
    };
  const a = previous.observation.lines,
    b = current.observation.lines;
  if (
    previous.observation.bytes !== undefined &&
    current.observation.bytes !== undefined &&
    current.observation.bytes < previous.observation.bytes
  )
    return {
      overlap: 0,
      newLines: [] as string[],
      reliable: false,
      reason: 'The native file became smaller. It may have rotated or been truncated.',
    };
  for (let size = Math.min(a.length, b.length); size > 0; size--) {
    if (a.slice(-size).every((line, index) => line === b[index]))
      return {
        overlap: size,
        newLines: b.slice(size),
        reliable: true,
        reason:
          'Exact suffix/prefix overlap within the loaded tail. Repeated identical messages may make alignment ambiguous.',
      };
  }
  return {
    overlap: 0,
    newLines: [] as string[],
    reliable: false,
    reason:
      'No exact overlap was found. Intervening lines or rotation may lie outside the bounded window.',
  };
}
export function exportLogCapture(capture: LogCapture, filter: LogFilter, visible: LogLine[]) {
  return {
    format: 'waypoint-log-investigation-1',
    exportedAt: new Date().toISOString(),
    captureId: capture.id,
    capturedAt: capture.capturedAt,
    source: capture.observation.source,
    fileBytes: capture.observation.bytes,
    bounded: capture.observation.bounded,
    filter,
    visibleLines: visible,
    bookmarks: capture.bookmarks,
    notice:
      'Filtered captured tail only. Signal labels are text heuristics, timestamps have no inferred timezone, and omitted lines are not evidence of absence.',
  };
}
