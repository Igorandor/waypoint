/** Retain at most 16 KiB of serialized text, independent of native response size. */
export function consolePreview(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const notice = '[Console preview truncated; inspect the original response for full output.]';
  const output: string[] = [];
  let budget = 16384 - Buffer.byteLength(JSON.stringify([notice]));
  for (let i = 0; i < input.length; i++) {
    if (i >= 100 || budget < 3) {
      output.push(notice);
      break;
    }
    const line = typeof input[i] === 'string' ? input[i] : (JSON.stringify(input[i]) ?? '');
    const points: string[] = [];
    budget -= 3;
    let complete = true;
    for (const point of line) {
      const bytes = Buffer.byteLength(JSON.stringify(point)) - 2;
      if (bytes > budget) {
        complete = false;
        break;
      }
      budget -= bytes;
      points.push(point);
    }
    output.push(points.join(''));
    if (!complete) {
      output.push(notice);
      break;
    }
  }
  return output;
}
