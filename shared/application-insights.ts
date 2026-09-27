import type { ProcedureBody } from './procedure.js';

export type ApplicationRecord = Record<string, unknown>;
export type ApplicationSource = {
  path: string;
  query: Record<string, string>;
  observedAt: string;
  outcome: 'read' | 'denied' | 'missing' | 'failed' | 'not-needed';
  data?: ApplicationRecord;
  explanation?: string;
};
export type ApplicationDossier = {
  application: string;
  capturedAt: string;
  configuration: ApplicationSource;
  namespace: ApplicationSource;
  entryResource: ApplicationSource;
};
export type FieldGroup = 'routing' | 'identity' | 'session' | 'content';
export type ApplicationField = {
  key: string;
  label: string;
  group: FieldGroup;
  consequence: string;
  set?: boolean;
};
export const applicationFields: ApplicationField[] = [
  {
    key: 'Enabled',
    label: 'Enabled',
    group: 'routing',
    consequence: 'Disabling the route interrupts new application requests.',
  },
  {
    key: 'NameSpace',
    label: 'Execution namespace',
    group: 'routing',
    consequence: 'Changes where application classes and globals are resolved.',
  },
  {
    key: 'DispatchClass',
    label: 'Dispatch class',
    group: 'routing',
    consequence: 'Controls dispatch for requests handled by this route.',
  },
  {
    key: 'IsNameSpaceDefault',
    label: 'Namespace default',
    group: 'routing',
    consequence: 'Affects native lookup of the namespace default application.',
  },
  {
    key: 'RedirectEmptyPath',
    label: 'Empty-path redirect',
    group: 'routing',
    consequence: 'Changes routing of requests to the application root.',
  },
  {
    key: 'AutheEnabled',
    label: 'Authentication bitmap',
    group: 'identity',
    consequence: 'Changes the native authentication mechanisms available to clients.',
  },
  {
    key: 'Resource',
    label: 'Entry resource',
    group: 'identity',
    consequence: 'Changes the resource checked at application entry.',
  },
  {
    key: 'MatchRoles',
    label: 'Application role mappings',
    group: 'identity',
    consequence: 'Can assign additional roles while application code runs.',
  },
  {
    key: 'JWTAuthEnabled',
    label: 'JWT authentication',
    group: 'identity',
    consequence: 'Changes bearer-token authentication for REST requests.',
  },
  {
    key: 'JWTAccessTokenTimeout',
    label: 'JWT access lifetime',
    group: 'identity',
    consequence: 'Changes the configured lifetime of access tokens.',
  },
  {
    key: 'JWTRefreshTokenTimeout',
    label: 'JWT refresh lifetime',
    group: 'identity',
    consequence: 'Changes the configured lifetime of refresh tokens.',
  },
  {
    key: 'TwoFactorEnabled',
    label: 'Two-factor requirement',
    group: 'identity',
    consequence: 'Changes the password authentication challenge flow.',
  },
  {
    key: 'UseCookies',
    label: 'Session cookie mode',
    group: 'session',
    consequence: 'Changes native CSP session transport behavior.',
  },
  {
    key: 'CookiePath',
    label: 'Session cookie path',
    group: 'session',
    consequence: 'Changes which paths receive the native session cookie.',
  },
  {
    key: 'SessionScope',
    label: 'Session SameSite policy',
    group: 'session',
    consequence: 'Changes cross-site delivery of the native session cookie.',
  },
  {
    key: 'UserCookieScope',
    label: 'User-cookie SameSite default',
    group: 'session',
    consequence: 'Changes the default scope used by application-created cookies.',
  },
  {
    key: 'CSRFToken',
    label: 'Native login CSRF check',
    group: 'session',
    consequence: 'Changes native login-token validation; it does not audit custom handlers.',
  },
  {
    key: 'Timeout',
    label: 'Session timeout',
    group: 'session',
    consequence: 'Changes the default native session lifetime in seconds.',
  },
  {
    key: 'GroupById',
    label: 'Authentication group',
    group: 'session',
    consequence: 'May synchronize authentication with other applications in this group.',
  },
  {
    key: 'CorsAllowlist',
    label: 'CORS origins',
    group: 'session',
    consequence: 'Changes the browser origins considered for CORS responses.',
    set: true,
  },
  {
    key: 'CorsCredentialsAllowed',
    label: 'CORS credentials',
    group: 'session',
    consequence: 'Changes whether credentialed CORS responses are allowed.',
  },
  {
    key: 'CorsHeadersList',
    label: 'CORS headers',
    group: 'session',
    consequence: 'Changes the configured CORS header list.',
    set: true,
  },
  {
    key: 'CSPZENEnabled',
    label: 'CSP/Zen handling',
    group: 'content',
    consequence: 'Changes page execution on this route.',
  },
  {
    key: 'InbndWebServicesEnabled',
    label: 'Inbound web services',
    group: 'content',
    consequence: 'Changes inbound web-service handling.',
  },
  {
    key: 'ServeFiles',
    label: 'Static file policy',
    group: 'content',
    consequence: 'Changes how native static files are exposed.',
  },
  {
    key: 'Path',
    label: 'Server content directory',
    group: 'content',
    consequence: 'Changes the server directory mapped to this application.',
  },
  {
    key: 'Recurse',
    label: 'Subdirectory access',
    group: 'content',
    consequence: 'Changes whether nested server directories are reachable.',
  },
  {
    key: 'AutoCompile',
    label: 'Automatic CSP compilation',
    group: 'content',
    consequence: 'Changes runtime recompilation behavior.',
  },
  {
    key: 'WSGIAppName',
    label: 'Python application',
    group: 'content',
    consequence: 'Changes the Python application module.',
  },
  {
    key: 'WSGIAppLocation',
    label: 'Python directory',
    group: 'content',
    consequence: 'Changes where the Python application is loaded.',
  },
  {
    key: 'WSGICallable',
    label: 'Python callable',
    group: 'content',
    consequence: 'Changes the callable for a configured Python application.',
  },
  {
    key: 'WSGIDebug',
    label: 'Python debug mode',
    group: 'content',
    consequence: 'Changes debug behavior of the configured Python handler.',
  },
  {
    key: 'TraceEnabled',
    label: 'Native tracing',
    group: 'content',
    consequence: 'Changes native tracing for supported application types.',
  },
];
export const fieldGroupLabels: Record<FieldGroup, string> = {
  routing: 'Routing and execution',
  identity: 'Identity and roles',
  session: 'Sessions and browser clients',
  content: 'Content and diagnostics',
};
export function appString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
export function validApplicationName(value: string) {
  return value.startsWith('/') && value.length <= 256 && !/[\x00-\x1f\x7f?#\\]/.test(value);
}
export function isApplicationRecord(value: unknown): value is ApplicationRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
export function applicationHandler(value: ApplicationRecord): string {
  if (appString(value.DispatchClass)) return 'Dispatch: ' + value.DispatchClass;
  if (appString(value.WSGIAppName) || appString(value.WSGIAppLocation))
    return 'Python: ' + (appString(value.WSGIAppName) || 'module not supplied');
  const enabled = [
    value.CSPZENEnabled === true ? 'CSP/Zen' : '',
    value.InbndWebServicesEnabled === true ? 'Web services' : '',
    typeof value.ServeFiles === 'string' && value.ServeFiles !== 'Never' ? 'Static content' : '',
  ].filter(Boolean);
  return enabled.join(' · ') || 'No handler identified in the returned fields';
}
const mechanisms = [
  { bit: 2, name: 'Kerberos API' },
  { bit: 5, name: 'Password' },
  { bit: 6, name: 'Unauthenticated' },
  { bit: 11, name: 'LDAP' },
  { bit: 13, name: 'Delegated' },
  { bit: 14, name: 'Login token' },
  { bit: 20, name: 'Two-factor SMS' },
  { bit: 21, name: 'Two-factor password' },
];
export function authenticationInventory(bitmap: unknown) {
  if (typeof bitmap !== 'number' || !Number.isSafeInteger(bitmap) || bitmap < 0)
    return { valid: false, enabled: [] as string[], unknown: undefined as number | undefined };
  let remaining = bitmap;
  const enabled: string[] = [];
  for (const item of mechanisms) {
    const value = 2 ** item.bit;
    if (Math.floor(bitmap / value) % 2 === 1) {
      enabled.push(item.name);
      remaining -= value;
    }
  }
  return { valid: true, enabled, unknown: remaining };
}
export type RoleMapping = {
  trigger: string;
  grants: string[];
  malformed: boolean;
};
export function applicationRoleMappings(value: unknown): RoleMapping[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [{ trigger: '', grants: [], malformed: true }];
  return value.slice(0, 200).map((entry) => {
    if (!isApplicationRecord(entry)) return { trigger: '', grants: [], malformed: true };
    return {
      trigger: appString(entry.MatchRole),
      grants: Array.isArray(entry.TargetRoles)
        ? entry.TargetRoles.filter((role): role is string => typeof role === 'string')
        : [],
      malformed:
        typeof entry.MatchRole !== 'string' ||
        !Array.isArray(entry.TargetRoles) ||
        entry.TargetRoles.some((role) => typeof role !== 'string'),
    };
  });
}
export type ReadinessItem = {
  id: string;
  title: string;
  category: FieldGroup | 'evidence';
  status: 'observed' | 'review' | 'unavailable';
  detail: string;
  fields: string[];
};
export function applicationReadiness(dossier: ApplicationDossier): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  const add = (
    id: string,
    title: string,
    category: ReadinessItem['category'],
    status: ReadinessItem['status'],
    detail: string,
    fields: string[],
  ) => items.push({ id, title, category, status, detail, fields });
  const config = dossier.configuration.data;
  if (dossier.configuration.outcome !== 'read' || !config) {
    add(
      'configuration',
      'Application configuration unavailable',
      'evidence',
      'unavailable',
      dossier.configuration.explanation || 'Read the native target before preparing maintenance.',
      [],
    );
    return items;
  }
  add(
    'enabled',
    'Native enabled state',
    'routing',
    typeof config.Enabled === 'boolean' ? 'observed' : 'unavailable',
    config.Enabled === true
      ? 'The route is configured as enabled. Endpoint behavior has not been tested.'
      : config.Enabled === false
        ? 'The route is configured as disabled. Record this baseline before maintenance.'
        : 'IRIS did not supply an enabled flag.',
    ['Enabled'],
  );
  const ns = appString(config.NameSpace);
  add(
    'namespace',
    'Execution namespace',
    'routing',
    ns && dossier.namespace.outcome === 'read'
      ? 'observed'
      : dossier.namespace.outcome === 'missing'
        ? 'review'
        : 'unavailable',
    ns
      ? dossier.namespace.outcome === 'read'
        ? 'Namespace ' + ns + ' was read through the native API.'
        : 'Namespace ' +
          ns +
          ' could not be verified: ' +
          (dossier.namespace.explanation || dossier.namespace.outcome)
      : 'No execution namespace was returned.',
    ['NameSpace'],
  );
  const auth = authenticationInventory(config.AutheEnabled);
  add(
    'authentication',
    'Authentication mechanisms',
    'identity',
    !auth.valid
      ? 'unavailable'
      : auth.enabled.includes('Unauthenticated') || auth.unknown
        ? 'review'
        : 'observed',
    !auth.valid
      ? 'The authentication bitmap is unavailable or invalid.'
      : (auth.enabled.join(', ') || 'No documented bitmap mechanism enabled') +
          (auth.unknown ? '; unrecognized flag value ' + auth.unknown : '') +
          '. Review JWT and application code separately.',
    ['AutheEnabled', 'JWTAuthEnabled'],
  );
  const resource = appString(config.Resource);
  add(
    'entry',
    'Application entry resource',
    'identity',
    typeof config.Resource !== 'string'
      ? 'unavailable'
      : !resource
        ? 'review'
        : dossier.entryResource.outcome === 'read'
          ? 'observed'
          : dossier.entryResource.outcome === 'missing'
            ? 'review'
            : 'unavailable',
    typeof config.Resource !== 'string'
      ? 'The native entry resource field was not returned.'
      : resource
        ? 'Configured resource: ' +
          resource +
          '. ' +
          (dossier.entryResource.outcome === 'read'
            ? 'Public grants: ' +
              (appString(dossier.entryResource.data?.PublicPermission) || 'none returned') +
              '.'
            : 'Its definition could not be verified.')
        : 'No native entry resource is configured. Review the application’s own authorization before changing access.',
    ['Resource'],
  );
  const mappings = applicationRoleMappings(config.MatchRoles);
  const broad = mappings.some((mapping) => mapping.grants.includes('%All'));
  const malformed =
    !Array.isArray(config.MatchRoles) || mappings.some((mapping) => mapping.malformed);
  add(
    'roles',
    'Roles assigned by the application',
    'identity',
    malformed
      ? 'unavailable'
      : broad || mappings.some((mapping) => !mapping.trigger && mapping.grants.length)
        ? 'review'
        : 'observed',
    malformed
      ? 'One or more role mappings could not be interpreted.'
      : broad
        ? 'A mapping grants %All. Confirm why this application needs that authority.'
        : mappings.some((mapping) => !mapping.trigger && mapping.grants.length)
          ? 'At least one mapping grants roles without a matching-role prerequisite.'
          : mappings.length + ' conditional role mappings were returned.',
    ['MatchRoles'],
  );
  const cors = config.CorsAllowlist;
  if (Array.isArray(cors)) {
    const wildcard = cors.includes('*');
    add(
      'cors',
      'Browser origin policy',
      'session',
      wildcard ? 'review' : 'observed',
      wildcard
        ? config.CorsCredentialsAllowed === true
          ? 'Wildcard origins and credentialed CORS are both configured. Check the actual gateway and handler behavior.'
          : 'A wildcard origin is configured. Confirm that unrestricted browser origins are intended.'
        : cors.length + ' configured origins. These entries were not contacted.',
      ['CorsAllowlist', 'CorsCredentialsAllowed'],
    );
  } else
    add(
      'cors',
      'Browser origin policy',
      'session',
      'unavailable',
      'No interpretable origin list was returned.',
      ['CorsAllowlist'],
    );
  if (config.UseCookies !== 'Never') {
    const path = appString(config.CookiePath);
    add(
      'cookie',
      'Session cookie boundary',
      'session',
      path === '/' || config.SessionScope === 'None' ? 'review' : path ? 'observed' : 'unavailable',
      'Cookie path: ' +
        (path || 'not returned') +
        '; SameSite: ' +
        (appString(config.SessionScope) || 'not returned') +
        '. TLS and cookie flags must be checked at the deployed gateway.',
      ['UseCookies', 'CookiePath', 'SessionScope'],
    );
    add(
      'login',
      'Native login CSRF behavior',
      'session',
      typeof config.CSRFToken !== 'boolean'
        ? 'unavailable'
        : config.CSRFToken
          ? 'observed'
          : 'review',
      config.CSRFToken === true
        ? 'Native login token validation is configured. This does not establish protection inside a custom REST handler.'
        : 'Native login token validation is disabled or unavailable. Confirm whether the application uses the native login flow.',
      ['CSRFToken', 'LoginPage'],
    );
  }
  const staticPolicy = appString(config.ServeFiles);
  if (staticPolicy && staticPolicy !== 'Never')
    add(
      'static',
      'Static content exposure',
      'content',
      staticPolicy.startsWith('Always') ? 'review' : 'observed',
      'Native policy: ' +
        staticPolicy +
        '. Directory: ' +
        (appString(config.Path) || 'not returned') +
        '. Directory contents were not read.',
      ['ServeFiles', 'Path', 'Recurse'],
    );
  if (config.AutoCompile === true || config.WSGIDebug === true)
    add(
      'development',
      'Runtime development settings',
      'content',
      'review',
      [
        config.AutoCompile === true ? 'Automatic CSP compilation is enabled.' : '',
        config.WSGIDebug === true ? 'Python debug mode is enabled.' : '',
      ]
        .filter(Boolean)
        .join(' '),
      ['AutoCompile', 'WSGIDebug'],
    );
  if (config.JWTAuthEnabled === true) {
    const access = config.JWTAccessTokenTimeout;
    const refresh = config.JWTRefreshTokenTimeout;
    const valid = [access, refresh].every(
      (n) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0,
    );
    add(
      'jwt',
      'JWT token lifetimes',
      'identity',
      valid ? 'observed' : 'unavailable',
      valid
        ? 'Access: ' +
            access +
            ' seconds; refresh: ' +
            refresh +
            ' seconds. Validate the application’s revocation and renewal behavior separately.'
        : 'JWT is enabled but positive token lifetimes could not be established.',
      ['JWTAuthEnabled', 'JWTAccessTokenTimeout', 'JWTRefreshTokenTimeout'],
    );
  }
  return items;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (isApplicationRecord(value))
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + stable(value[key]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'undefined';
}
function comparable(field: ApplicationField, value: unknown) {
  if (field.set && Array.isArray(value) && value.every((item) => typeof item === 'string'))
    return stable([...new Set(value)].sort());
  return stable(value);
}
export type ApplicationDifference = ApplicationField & {
  before?: unknown;
  after?: unknown;
  status: 'same' | 'changed' | 'newly-returned' | 'no-longer-returned' | 'unavailable';
};
export function compareApplicationDossiers(
  before: ApplicationDossier,
  after: ApplicationDossier,
): { comparable: boolean; reason: string; fields: ApplicationDifference[] } {
  if (before.application !== after.application)
    return {
      comparable: false,
      reason: 'Select the same exact application path for both observations.',
      fields: [],
    };
  if (
    before.configuration.outcome !== 'read' ||
    after.configuration.outcome !== 'read' ||
    !before.configuration.data ||
    !after.configuration.data
  )
    return {
      comparable: false,
      reason: 'Both native application configurations must be available.',
      fields: [],
    };
  const previous = before.configuration.data;
  const current = after.configuration.data;
  return {
    comparable: true,
    reason:
      'Selected configuration fields only. Missing fields are not proof of deletion; captures are separate observations.',
    fields: applicationFields.map((field) => {
      const hasBefore = Object.hasOwn(previous, field.key);
      const hasAfter = Object.hasOwn(current, field.key);
      return {
        ...field,
        before: previous[field.key],
        after: current[field.key],
        status:
          !hasBefore && !hasAfter
            ? 'unavailable'
            : !hasBefore
              ? 'newly-returned'
              : !hasAfter
                ? 'no-longer-returned'
                : comparable(field, previous[field.key]) === comparable(field, current[field.key])
                  ? 'same'
                  : 'changed',
      };
    }),
  };
}
export type MaintenanceCheck = {
  id: string;
  title: string;
  detail: string;
  source: 'native' | 'operator';
};
export function maintenanceChecks(dossier: ApplicationDossier): MaintenanceCheck[] {
  const config = dossier.configuration.data ?? {};
  const checks: MaintenanceCheck[] = [
    {
      id: 'identity',
      title: 'Confirm the instance and exact application path',
      detail:
        dossier.application + ' · namespace ' + (appString(config.NameSpace) || 'unavailable'),
      source: 'native',
    },
    {
      id: 'state',
      title: 'Record the enabled state before the window',
      detail:
        typeof config.Enabled === 'boolean'
          ? (config.Enabled ? 'Enabled' : 'Disabled') + ' at ' + dossier.configuration.observedAt
          : 'The native enabled state is unavailable.',
      source: 'native',
    },
    {
      id: 'owner',
      title: 'Identify the restoration owner',
      detail: 'The account opening a maintenance window retains its restoration obligation.',
      source: 'operator',
    },
    {
      id: 'clients',
      title: 'Account for application clients and active work',
      detail:
        'Configuration does not show whether clients can retry safely or whether in-flight work has drained.',
      source: 'operator',
    },
    {
      id: 'verification',
      title: 'Choose an application-specific verification step',
      detail: 'After restoration, verify a meaningful request through the deployed gateway.',
      source: 'operator',
    },
  ];
  if (appString(config.GroupById))
    checks.push({
      id: 'group',
      title: 'Review applications sharing authentication',
      detail: 'Authentication group: ' + config.GroupById,
      source: 'native',
    });
  if (config.JWTAuthEnabled === true || config.UseCookies !== 'Never')
    checks.push({
      id: 'sessions',
      title: 'Review session or token continuity',
      detail:
        'Confirm whether clients need to reconnect, renew tokens or sign in after maintenance.',
      source: 'operator',
    });
  if (config.ServeFiles !== 'Never' && appString(config.ServeFiles))
    checks.push({
      id: 'cache',
      title: 'Account for static content and caches',
      detail: 'Confirm how stale content is invalidated outside this portal.',
      source: 'operator',
    });
  return checks;
}
export function applicationReviewProcedure(dossier: ApplicationDossier): ProcedureBody {
  if (!validApplicationName(dossier.application)) throw new Error('Invalid application path.');
  return {
    title: ('Application readiness: ' + dossier.application).slice(0, 100),
    description:
      'Review the current application configuration and record operational prerequisites before a maintenance window.',
    expectedOutcome:
      'A traceable operator decision and native configuration evidence. This procedure does not change the application.',
    tags: ['application', 'maintenance'],
    steps: [
      {
        id: 'identity',
        kind: 'observation',
        title: 'Identify the instance',
        instruction: 'Confirm the intended server and account.',
        source: 'identity',
        target: '',
      },
      {
        id: 'application',
        kind: 'observation',
        title: 'Capture application configuration',
        instruction: 'Inspect routing, authentication and the current enabled state.',
        source: 'application',
        target: dossier.application,
      },
      {
        id: 'evidence',
        kind: 'assertion',
        title: 'Require application evidence',
        instruction: 'A missing or denied observation cannot satisfy this check.',
        check: 'capture-present',
        sourceStepId: 'application',
        expected: true,
      },
      {
        id: 'readiness',
        kind: 'checklist',
        title: 'Record maintenance prerequisites',
        instruction:
          'Review each item with the responsible operator. Use a separate maintenance window for the actual change.',
        items: maintenanceChecks(dossier).map((item) => ({
          id: item.id,
          text: item.title,
          required: true,
        })),
        requireNote: true,
        reference: '',
      },
    ],
  };
}
export function relatedApplications(
  name: string,
  configuration: ApplicationRecord,
  inventory: ApplicationRecord[],
) {
  const base = name.replace(/\/+$/, '').toLowerCase();
  const group = appString(configuration.GroupById);
  const namespace = appString(configuration.NameSpace);
  return inventory.flatMap((row) => {
    const other = appString(row.Name);
    if (!other || other === name) return [];
    const canonical = other.replace(/\/+$/, '').toLowerCase();
    const reasons: string[] = [];
    if (canonical === base) reasons.push('Equivalent path spelling');
    else if (canonical.startsWith(base + '/')) reasons.push('Nested route');
    else if (base.startsWith(canonical + '/')) reasons.push('Parent route');
    if (namespace && row.NameSpace === namespace) reasons.push('Same namespace');
    if (group && row.GroupById === group) reasons.push('Same authentication group');
    return reasons.length
      ? [
          {
            name: other,
            reasons,
            enabled: typeof row.Enabled === 'boolean' ? row.Enabled : undefined,
          },
        ]
      : [];
  });
}
