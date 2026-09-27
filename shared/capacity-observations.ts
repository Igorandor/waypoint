export type CapacityReading = {
  scope?: string;
  platform?: string;
  sampledAt?: number;
  uptimeSeconds?: number;
  memory?: { total?: number; available?: number };
  disk?: { total?: number; used?: number; free?: number; path?: string };
  cpu?: { totalTicks?: number; idleTicks?: number; logicalCount?: number; loadAverage?: number[] };
  notice?: string;
};
export type CapacitySample = {
  id: string;
  requestedAt: string;
  receivedAt: string;
  durationMs: number;
  data?: CapacityReading;
  error?: string;
  note?: string;
};
export type Measurement = { value?: number; unit: string; reason?: string };
export type CapacityPoint = {
  id: string;
  at: string;
  memoryUsed: Measurement;
  memoryAvailable: Measurement;
  diskUsed: Measurement;
  diskFree: Measurement;
  cpuBusy: Measurement;
  normalizedLoad: Measurement;
  uptime: Measurement;
};
export function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function available(total: unknown, free: unknown, label: string): Measurement {
  if (!finite(total) || !finite(free) || total <= 0 || free < 0 || free > total)
    return {
      unit: 'bytes',
      reason: label + ' total and available values are missing or inconsistent.',
    };
  return { value: free, unit: 'bytes' };
}
function utilization(total: unknown, free: unknown, label: string): Measurement {
  const result = available(total, free, label);
  if (result.value === undefined || !finite(total)) return { ...result, unit: '%' };
  return { value: 100 * (1 - result.value / total), unit: '%' };
}
export function cpuInterval(
  previous: CapacitySample | undefined,
  current: CapacitySample,
): Measurement {
  const unavailable = (reason: string): Measurement => ({ unit: '%', reason });
  const a = previous?.data,
    b = current.data;
  if (!a || !b) return unavailable('Two consecutive successful samples are required.');
  if (
    a.scope !== b.scope ||
    a.platform !== b.platform ||
    a.cpu?.logicalCount !== b.cpu?.logicalCount
  )
    return unavailable('The host scope or CPU topology changed between samples.');
  if (!finite(a.sampledAt) || !finite(b.sampledAt) || b.sampledAt <= a.sampledAt)
    return unavailable('Native sample times did not increase.');
  if (b.sampledAt - a.sampledAt > 600) return unavailable('The sample gap exceeds ten minutes.');
  if (finite(a.uptimeSeconds) && finite(b.uptimeSeconds) && b.uptimeSeconds < a.uptimeSeconds)
    return unavailable('Host uptime moved backwards; counters may have reset.');
  const at = a.cpu?.totalTicks,
    bt = b.cpu?.totalTicks,
    ai = a.cpu?.idleTicks,
    bi = b.cpu?.idleTicks;
  if (!finite(at) || !finite(bt) || !finite(ai) || !finite(bi))
    return unavailable('Native CPU counters are unavailable.');
  const total = bt - at,
    idle = bi - ai;
  if (total <= 0 || idle < 0 || idle > total)
    return unavailable('CPU counters reset or returned inconsistent deltas.');
  return { value: 100 * (1 - idle / total), unit: '%' };
}
export function capacityPoint(sample: CapacitySample, previous?: CapacitySample): CapacityPoint {
  const data = sample.data;
  const load = data?.cpu?.loadAverage?.[0],
    cpus = data?.cpu?.logicalCount;
  return {
    id: sample.id,
    at: sample.receivedAt,
    memoryUsed: utilization(data?.memory?.total, data?.memory?.available, 'Memory'),
    memoryAvailable: available(data?.memory?.total, data?.memory?.available, 'Memory'),
    diskUsed: utilization(data?.disk?.total, data?.disk?.free, 'Disk'),
    diskFree: available(data?.disk?.total, data?.disk?.free, 'Disk'),
    cpuBusy: cpuInterval(previous, sample),
    normalizedLoad:
      finite(load) && load >= 0 && finite(cpus) && cpus > 0
        ? { value: load / cpus, unit: 'load/CPU' }
        : { unit: 'load/CPU', reason: 'Native load average and logical CPU count are required.' },
    uptime:
      finite(data?.uptimeSeconds) && data.uptimeSeconds >= 0
        ? { value: data.uptimeSeconds, unit: 'seconds' }
        : { unit: 'seconds', reason: 'Native uptime is unavailable.' },
  };
}
export type CapacityMetric =
  | 'memoryUsed'
  | 'diskUsed'
  | 'cpuBusy'
  | 'memoryAvailable'
  | 'diskFree'
  | 'normalizedLoad'
  | 'uptime';
export const metricTitles: Record<CapacityMetric, string> = {
  memoryUsed: 'Memory used',
  diskUsed: 'Disk used',
  cpuBusy: 'CPU busy interval',
  memoryAvailable: 'Available memory',
  diskFree: 'Free disk',
  normalizedLoad: 'One-minute load / logical CPU',
  uptime: 'Host uptime',
};
export function seriesStatistics(points: CapacityPoint[], metric: CapacityMetric) {
  const values = points.flatMap((point) =>
    point[metric].value === undefined ? [] : [point[metric].value!],
  );
  const sorted = [...values].sort((a, b) => a - b);
  return {
    measured: values.length,
    missing: points.length - values.length,
    minimum: sorted[0],
    maximum: sorted.at(-1),
    average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined,
    median: sorted.length
      ? sorted.length % 2
        ? sorted[Math.floor(sorted.length / 2)]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : undefined,
    latest: points.at(-1)?.[metric].value,
  };
}
export type CapacityThresholds = { memoryUsed: number; diskUsed: number; cpuBusy: number };
export type ThresholdFinding = {
  metric: keyof CapacityThresholds;
  value: number;
  threshold: number;
  at: string;
  consecutive: number;
};
export function thresholdFindings(
  points: CapacityPoint[],
  limits: CapacityThresholds,
): ThresholdFinding[] {
  const result: ThresholdFinding[] = [];
  for (const metric of ['memoryUsed', 'diskUsed', 'cpuBusy'] as const) {
    const latest = points.at(-1)?.[metric].value;
    const limit = limits[metric];
    if (latest === undefined || latest < limit) continue;
    let consecutive = 0;
    for (let index = points.length - 1; index >= 0; index--) {
      const value = points[index][metric].value;
      if (value === undefined || value < limit) break;
      consecutive++;
    }
    result.push({ metric, value: latest, threshold: limit, at: points.at(-1)!.at, consecutive });
  }
  return result;
}
export function formatMeasurement(measurement: Measurement, digits = 1) {
  if (measurement.value === undefined) return 'Unavailable';
  if (measurement.unit === 'bytes') {
    const value = measurement.value;
    if (value >= 1024 ** 3) return (value / 1024 ** 3).toFixed(digits) + ' GiB';
    if (value >= 1024 ** 2) return (value / 1024 ** 2).toFixed(digits) + ' MiB';
    return value.toLocaleString() + ' bytes';
  }
  if (measurement.unit === 'seconds') {
    const days = Math.floor(measurement.value / 86400),
      hours = Math.floor((measurement.value % 86400) / 3600);
    return `${days} days ${hours} hr`;
  }
  return (
    measurement.value.toFixed(digits) + (measurement.unit === '%' ? '%' : ' ' + measurement.unit)
  );
}
export type SampleDifference = {
  metric: CapacityMetric;
  before: Measurement;
  after: Measurement;
  delta?: number;
  meaning: string;
};
export function compareCapacitySamples(
  before: CapacitySample,
  after: CapacitySample,
): SampleDifference[] {
  const a = capacityPoint(before),
    b = capacityPoint(after, before);
  const comparable =
    before.data?.scope === after.data?.scope && before.data?.platform === after.data?.platform;
  return (['memoryUsed', 'diskUsed', 'memoryAvailable', 'diskFree', 'uptime'] as const).map(
    (metric) => {
      const av = a[metric],
        bv = b[metric];
      const sameFilesystem =
        (metric !== 'diskUsed' && metric !== 'diskFree') ||
        before.data?.disk?.path === after.data?.disk?.path;
      const sameTotal =
        (metric !== 'memoryUsed' && metric !== 'memoryAvailable') ||
        before.data?.memory?.total === after.data?.memory?.total;
      const delta =
        comparable &&
        sameFilesystem &&
        sameTotal &&
        av.value !== undefined &&
        bv.value !== undefined
          ? bv.value - av.value
          : undefined;
      return {
        metric,
        before: av,
        after: bv,
        delta,
        meaning:
          delta === undefined
            ? 'The observations are unavailable or do not describe the same scope.'
            : metric === 'uptime' && delta < 0
              ? 'Host uptime decreased; check for a restart.'
              : metric.endsWith('Used')
                ? 'Difference in percentage points. A change is not by itself an incident.'
                : 'Difference between recorded values; intervening changes are not reconstructed.',
      };
    },
  );
}
export function exportCapacitySession(samples: CapacitySample[], thresholds: CapacityThresholds) {
  return {
    format: 'waypoint-capacity-session-1',
    exportedAt: new Date().toISOString(),
    thresholds,
    notice:
      'Browser-session observations only. CPU percentages use consecutive native counter deltas. Missing intervals are not interpolated. Host-visible resources may differ from container limits.',
    samples: structuredClone(samples),
    derived: samples.map((sample, index) => capacityPoint(sample, samples[index - 1])),
  };
}
