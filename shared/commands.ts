/** Native targets for Waypoint's choose → prepare → review → execute workflow. */
export type Target = {
  id: string;
  area: string;
  title: string;
  list: string;
  record: string;
  identity: string;
  parameter: string;
  scope?: string;
  opaque?: boolean;
  readOnly?: boolean;
};
const target = (
  id: string,
  area: string,
  title: string,
  list: string,
  record: string,
  identity = 'Name',
  parameter = 'name',
  extra: Partial<Target> = {},
): Target => ({
  id,
  area,
  title,
  list: '/v2/' + list,
  record: '/v2/' + record,
  identity,
  parameter,
  ...extra,
});
export const targets: Target[] = [
  target('apps', 'apps', 'Application routes', 'web-apps', 'web-app'),
  target('users', 'permissions', 'User accounts', 'security/users', 'security/user'),
  target('roles', 'permissions', 'Role grants', 'security/roles', 'security/role'),
  target(
    'resources',
    'permissions',
    'Resource permissions',
    'security/resources',
    'security/resource',
  ),
  target(
    'collections',
    'security',
    'Wallet collections',
    'wallet/collections',
    'wallet/collection',
  ),
  target(
    'secrets',
    'security',
    'Wallet entries',
    'wallet/secrets',
    'wallet/secret',
    'Name',
    'name',
    { scope: 'collection', opaque: true },
  ),
  target(
    'certificates',
    'security',
    'Certificate credentials',
    'security/x509-credentials',
    'security/x509-credential',
    'Alias',
    'alias',
  ),
  target(
    'tls',
    'security',
    'TLS connections',
    'security/ssl-configurations',
    'security/ssl-configuration',
  ),
  target(
    'oauthServers',
    'security',
    'Authorization servers',
    'security/oauth2/client/server-definitions',
    'security/oauth2/client/server-definition',
    'ID',
    'serverId',
  ),
  target(
    'oauthClients',
    'security',
    'OAuth applications',
    'security/oauth2/client/client-configurations',
    'security/oauth2/client/client-configuration',
    'ApplicationName',
    'applicationName',
    { scope: 'serverId' },
  ),
  target('tasks', 'tasks', 'Scheduled work', 'tasks', 'task', 'Id', 'id'),
  target('processes', 'system', 'Running processes', 'processes', 'process', 'Pid', 'id', {
    readOnly: true,
  }),
  target('devices', 'system', 'Device definitions', 'devices', 'device'),
  target('databases', 'system', 'Database storage', 'databases', 'database', 'Name', 'name', {
    readOnly: true,
  }),
];
