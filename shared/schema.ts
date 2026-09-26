import contract from './iris-contract.json';
export type RecordData = Record<string, any>;
export type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
  enum?: unknown[];
  description?: string;
  $ref?: string;
  allOf?: Schema[];
  readOnly?: boolean;
  writeOnly?: boolean;
  default?: any;
  example?: unknown;
  additionalProperties?: boolean | Schema;
};
export const spec = contract as unknown as {
  paths: Record<string, RecordData>;
  components: { schemas: Record<string, Schema>; parameters: Record<string, RecordData> };
};
const own = <T>(table: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined;
export function resolveSchema(input: Schema = {}, ancestry: readonly string[] = []): Schema {
  const { $ref, allOf, ...local } = input;
  if ($ref) {
    const key = $ref.split('/').at(-1)!;
    if (ancestry.includes(key)) return local;
    return { ...resolveSchema(own(spec.components.schemas, key), [...ancestry, key]), ...local };
  }
  if (!allOf) return local;
  return allOf.reduce<Schema>((merged, part) => {
    const next = resolveSchema(part, ancestry);
    return {
      ...merged,
      ...next,
      properties: { ...merged.properties, ...next.properties },
      required: [...new Set([...(merged.required ?? []), ...(next.required ?? [])])],
    };
  }, local);
}
export const bodySchema = (path: string, method: string): Schema =>
  resolveSchema(
    spec.paths[path]?.[method.toLowerCase()]?.requestBody?.content?.['application/json']?.schema,
  );
export function parameters(path: string, method = 'get'): RecordData[] {
  return [
    ...(spec.paths[path]?.parameters ?? []),
    ...(spec.paths[path]?.[method.toLowerCase()]?.parameters ?? []),
  ].flatMap((p) =>
    p.$ref ? [own(spec.components.parameters, p.$ref.split('/').at(-1)!)].filter(Boolean) : [p],
  );
}
export const readablePaths = Object.keys(spec.paths)
  .filter(
    (path) =>
      spec.paths[path].get &&
      (!/\/(?:secret|secrets|password|initial-access-token|search-password)$/.test(path) ||
        path === '/v2/wallet/secrets') &&
      !/^\/(login|logout|refresh|revoke)$/.test(path),
  )
  .map((path) => ({ path, summary: String(spec.paths[path].get.summary ?? path) }));
export const plainDescription = (input = '') =>
  input
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
