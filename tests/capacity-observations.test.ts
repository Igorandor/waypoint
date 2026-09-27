import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  capacityPoint,
  cpuInterval,
  thresholdFindings,
  compareCapacitySamples,
  type CapacitySample,
} from '../shared/capacity-observations';
const sample = (time: number, total: number, idle: number): CapacitySample => ({
  id: String(time),
  requestedAt: '2026-09-27T00:00:00Z',
  receivedAt: '2026-09-27T00:00:01Z',
  durationMs: 20,
  data: {
    scope: 'host',
    platform: 'Linux',
    sampledAt: time,
    uptimeSeconds: time,
    memory: { total: 100, available: 20 },
    disk: { total: 100, free: 30, path: '/iris' },
    cpu: { totalTicks: total, idleTicks: idle, logicalCount: 4, loadAverage: [2] },
  },
});
test('CPU percentages use native delta and reject gaps, resets and topology changes', () => {
  const a = sample(100, 1000, 500),
    b = sample(130, 1200, 550);
  assert.equal(cpuInterval(a, b).value, 75);
  assert.equal(cpuInterval(undefined, b).value, undefined);
  assert.equal(cpuInterval(a, sample(100, 1200, 550)).value, undefined);
  assert.equal(cpuInterval(a, sample(800, 1200, 550)).value, undefined);
  assert.equal(cpuInterval(a, sample(130, 900, 550)).value, undefined);
  b.data!.cpu!.logicalCount = 8;
  assert.equal(cpuInterval(a, b).value, undefined);
});
test('missing samples break threshold streaks and are not zero-valued measurements', () => {
  const a = sample(100, 1000, 500),
    b = { ...sample(130, 1100, 550), data: undefined, error: 'denied' },
    c = sample(160, 1200, 600);
  const points = [capacityPoint(a), capacityPoint(b, a), capacityPoint(c, b)];
  assert.equal(points[1].memoryUsed.value, undefined);
  assert.equal(points[2].cpuBusy.value, undefined);
  assert.equal(
    thresholdFindings(points, { memoryUsed: 75, diskUsed: 90, cpuBusy: 90 })[0].consecutive,
    1,
  );
});
test('headroom comparisons refuse changed filesystem or memory scope', () => {
  const a = sample(100, 1000, 500),
    b = sample(130, 1200, 550);
  b.data!.disk!.path = '/other';
  b.data!.memory!.total = 200;
  const changes = compareCapacitySamples(a, b);
  assert.equal(changes.find((row) => row.metric === 'diskFree')?.delta, undefined);
  assert.equal(changes.find((row) => row.metric === 'memoryAvailable')?.delta, undefined);
});
