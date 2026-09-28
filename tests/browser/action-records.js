import { commandA } from './history-records';
import { validateStoredCommand } from '../../server/command-validation';
export const actionTarget = '/synthetic-a';
export const actionReview = {
  ...commandA,
  status: 'reviewed',
  title: 'Synthetic deletion',
  target: actionTarget,
  confirmation: actionTarget,
  operation: { path: '/v2/web-app', method: 'DELETE', query: { name: actionTarget } },
  before: { Name: actionTarget, Enabled: true, Description: 'Protected before evidence' },
  proposed: {},
  fields: [],
  read: { path: '/v2/web-app', query: { name: actionTarget }, mode: 'absence' },
  message: 'Protected reviewed record',
};
validateStoredCommand(actionReview);
export const actionCandidate = {
  path: '/v2/web-app',
  method: 'DELETE',
  query: { name: actionTarget },
};
