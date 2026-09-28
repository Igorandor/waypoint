import { validateStoredCommand } from '../../server/command-validation';
const at = '2026-09-28T12:00:00Z';
export const commandA = {
  format: 1,
  id: '88888888-8888-4888-8888-888888888888',
  owner: 'Synthetic operator',
  instance: 'synthetic-only',
  createdAt: at,
  updatedAt: at,
  expiresAt: at,
  status: 'uncertain',
  operation: { path: '/v2/web-apps', method: 'PUT', query: { application: '/synthetic-a' } },
  title: 'Synthetic command A',
  target: '/synthetic-a',
  confirmation: '/synthetic-a',
  before: { Enabled: true },
  proposed: { Enabled: false },
  fields: ['Enabled'],
  writeOnlyFields: [],
  read: { path: '/v2/web-apps', query: { application: '/synthetic-a' }, mode: 'fields' },
  message: 'Protected message A',
  events: [],
};
export const commandB = {
  ...commandA,
  id: '99999999-9999-4999-8999-999999999999',
  title: 'Synthetic command B',
  target: '/synthetic-b',
  message: 'Protected message B',
};
validateStoredCommand(commandA);
validateStoredCommand(commandB);
export const summary = ({
  id,
  title,
  target,
  status,
  createdAt,
  updatedAt,
  message,
  operation,
}) => ({ id, title, target, status, createdAt, updatedAt, message, operation });
