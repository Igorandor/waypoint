import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';

/** Read through one bounded descriptor; reject links and non-regular journal entries. */
export async function readBoundedJson(filename: string, maximum: number): Promise<unknown> {
  const before = await lstat(filename);
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error('Journal entry is not a regular file.');
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
  const handle = await open(filename, flags);
  try {
    const metadata = await handle.stat();
    if (
      !metadata.isFile() ||
      metadata.size > maximum ||
      metadata.ino !== before.ino ||
      (process.platform !== 'win32' && metadata.dev !== before.dev)
    )
      throw new Error('Journal entry changed identity or exceeds its storage budget.');
    const buffer = Buffer.alloc(Math.min(maximum + 1, Math.max(1, metadata.size + 1)));
    let offset = 0;
    while (offset < buffer.length) {
      const result = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    const extra = Buffer.alloc(1);
    const overflow = await handle.read(extra, 0, 1, offset);
    if (offset > maximum || overflow.bytesRead || offset > metadata.size)
      throw new Error('Journal entry grew while it was read.');
    return JSON.parse(buffer.subarray(0, offset).toString('utf8'));
  } finally {
    await handle.close();
  }
}
