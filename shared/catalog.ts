// Compatibility surface for the native installation probes; the application uses commands.ts.
import { targets } from './commands';
export type Entity = {
  id: string;
  list: string;
  detail: string;
  key: string;
  param: string;
  columns: string[];
  fields: string[];
  readonly?: boolean;
  noDetail?: boolean;
};
export const entities: Record<string, Entity> = Object.fromEntries(
  targets.map((t) => [
    t.id,
    {
      id: t.id,
      list: t.list,
      detail: t.record,
      key: t.identity,
      param: t.parameter,
      columns: [t.identity],
      fields: [],
      readonly: t.readOnly,
      noDetail: t.opaque,
    },
  ]),
);
export const label = (key: string) =>
  key === 'NameSpace' ? 'Namespace' : key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
