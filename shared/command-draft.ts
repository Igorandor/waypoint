import { bodySchema, resolveSchema, type Schema } from './schema';
import { taskDefaults } from './task-defaults';
export function emptyValue(input: Schema): any {
  const schema = resolveSchema(input);
  if (schema.default !== undefined) return structuredClone(schema.default);
  switch (schema.type) {
    case 'array':
      return [];
    case 'object':
      return {};
    case 'boolean':
      return false;
    case 'number':
    case 'integer':
      return 0;
    default:
      return schema.properties ? {} : '';
  }
}
export function newCommandBody(id: string, operator: string): Record<string, any> {
  switch (id) {
    case 'tasks':
      return taskDefaults(operator);
    case 'users':
      return { User: { Enabled: true, ChangePassword: true, Roles: [] }, Password: '' };
    case 'apps':
      return { NameSpace: 'USER', Enabled: true, AutheEnabled: 32 };
    case 'roles':
      return { Description: '', Resources: [], GrantedRoles: [] };
    case 'resources':
      return { Description: '', PublicPermission: '' };
    case 'collections':
      return { EditResource: '%Admin_Wallet:USE', UseResource: '%Admin_Wallet:USE' };
    case 'secrets':
      return {
        Type: '%Wallet.KeyValue',
        WalletSecretConfig: { RequireTLS: true, AllowedHosts: [], Usage: ['HTTP'], Secret: {} },
      };
    case 'certificates':
      return { Alias: '', CertificateFile: '', OwnerList: [], PeerNames: [] };
    case 'tls':
      return { Enabled: true, Type: 0, VerifyPeer: 1, CAFile: '%OSCertificateStore' };
    case 'oauthServers':
      return { IssuerEndpoint: '', SSLConfiguration: '', Metadata: {} };
    case 'oauthClients':
      return {
        OAuth2ServerDefinition: '',
        Enabled: false,
        ClientType: 'confidential',
        SSLConfiguration: '',
        RedirectionEndpoint: '',
        DefaultScope: 'openid',
      };
    case 'devices':
      return { Type: 'OTH', SubType: 'M/UX', PhysicalDevice: '', Description: '' };
    default:
      return {};
  }
}
/** Compare only the fields the operator deliberately added to an update command. */
export function changedKeys(
  base: Record<string, any>,
  patch: Record<string, any>,
  fresh: Record<string, any>,
): string[] {
  return Object.keys(patch).filter(
    (key) => JSON.stringify(base[key]) !== JSON.stringify(fresh[key]),
  );
}
export function candidateValue(input: Schema, previous: unknown): any {
  return previous !== undefined && !JSON.stringify(previous).includes('[redacted]')
    ? structuredClone(previous)
    : emptyValue(input);
}
export function updateAllowed(path: string) {
  return !!bodySchema(path, 'PUT').properties;
}
