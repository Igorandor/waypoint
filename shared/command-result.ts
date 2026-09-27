export type CommandOutcome =
  | 'reviewed'
  | 'dispatching'
  | 'verified'
  | 'acknowledged'
  | 'uncertain'
  | 'rejected'
  | 'conflict'
  | 'expired';
export type ProcessIdentity = { pid: string; started: string; job: string; user: string };
export type CommandRead = {
  path: string;
  query: Record<string, string>;
  mode:
    'fields' | 'absence' | 'task-state' | 'process-state' | 'process-absence' | 'acknowledgement';
};
export type CommandResult = {
  format: 1;
  id: string;
  owner: string;
  instance: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  status: CommandOutcome;
  operation: { path: string; method: 'POST' | 'PUT' | 'DELETE'; query: Record<string, string> };
  title: string;
  target: string;
  confirmation: string;
  before: Record<string, unknown> | null;
  proposed: Record<string, unknown>;
  fields: string[];
  writeOnlyFields: string[];
  nativeIdentity?: ProcessIdentity;
  read: CommandRead;
  requestedState?: boolean;
  dispatchAt?: string;
  responseStatus?: number;
  response?: unknown;
  asyncId?: string;
  observed?: unknown;
  observedAt?: string;
  message: string;
  events: Array<{ at: string; status: CommandOutcome; message: string }>;
};
export const outcomeLabels: Record<CommandOutcome, string> = {
  reviewed: 'Ready for confirmation',
  dispatching: 'Request in progress',
  verified: 'Observed result matches',
  acknowledged: 'Accepted; limited verification',
  uncertain: 'Result needs checking',
  rejected: 'Request rejected',
  conflict: 'Target changed',
  expired: 'Review expired',
};
export function settledCommand(status: CommandOutcome) {
  return ['verified', 'acknowledged', 'rejected', 'conflict', 'expired'].includes(status);
}
