import { spec } from '../shared/schema.js';
import type { CommandResult } from '../shared/command-result.js';
import { readbackContract } from './command-readback.js';
import { ApiError } from './upstream.js';

/** The pinned contract describes an OR group for each endpoint; unknown forms fail closed. */
export function nativePrivilegeAlternatives(path: string, method: string): string[] {
  const summary = spec.paths[path]?.[method.toLowerCase()]?.summary;
  if (typeof summary !== 'string') return [];
  const expression = /^\((%Admin_[A-Za-z0-9_]+:U(?: or %Admin_[A-Za-z0-9_]+:U)*)\)/.exec(
    summary,
  )?.[1];
  return expression
    ? expression.split(' or ').map((value) => value.slice('%Admin_'.length, -2))
    : [];
}
export function requireCommandPrivileges(
  record: Pick<CommandResult, 'operation'> & Partial<Pick<CommandResult, 'read'>>,
  privileges: Record<string, { use?: boolean }> | undefined,
) {
  const operation = record.operation;
  const read = record.read ?? readbackContract(operation).read;
  const groups = [nativePrivilegeAlternatives(operation.path, operation.method)];
  // Stored before/after evidence can need a stronger privilege than the mutation itself.
  if (read.mode !== 'acknowledgement') groups.push(nativePrivilegeAlternatives(read.path, 'GET'));
  if (
    groups.some((group) => !group.length || !group.some((name) => privileges?.[name]?.use === true))
  )
    throw new ApiError(
      403,
      'Current native privileges for the command and its recorded evidence are required.',
    );
}
