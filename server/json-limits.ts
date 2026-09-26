/** Walk one depth layer at a time; reject before constructing an oversized next layer. */
export function boundedJson(root: unknown, maxDepth: number, maxNodes: number) {
  let layer: unknown[] = [root],
    count = 0;
  for (let depth = 0; layer.length; depth++) {
    if (depth > maxDepth) return false;
    const children: unknown[] = [];
    for (const value of layer) {
      if (++count > maxNodes) return false;
      if (value && typeof value === 'object')
        for (const child of Object.values(value)) {
          if (count + children.length >= maxNodes) return false;
          children.push(child);
        }
    }
    layer = children;
  }
  return true;
}
