import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applicationHandler,
  applicationReadiness,
  applicationReviewProcedure,
  applicationRoleMappings,
  authenticationInventory,
  compareApplicationDossiers,
  maintenanceChecks,
  relatedApplications,
  validApplicationName,
  type ApplicationDossier,
  type ApplicationRecord,
  type ApplicationSource,
} from '../shared/application-insights.js';
import { procedureBodySchema } from '../shared/procedure.js';

function dossier(data: ApplicationRecord = {}): ApplicationDossier {
  const source = (path: string, data: ApplicationRecord): ApplicationSource => ({
    path,
    query: {},
    data,
    outcome: 'read',
    observedAt: '2026-09-27T01:00:00Z',
  });
  return {
    application: '/services/orders',
    capturedAt: '2026-09-27T01:00:00Z',
    configuration: source('/v2/web-app', {
      Enabled: true,
      NameSpace: 'APP',
      AutheEnabled: 32,
      Resource: 'OrdersUse',
      MatchRoles: [],
      CorsAllowlist: [],
      ...data,
    }),
    namespace: source('/v2/namespace', { Globals: 'APPDATA', Routines: 'APPCODE' }),
    entryResource: source('/v2/security/resource', { PublicPermission: '' }),
  };
}
test('authentication flags retain high bits and refuse invalid numeric representations', () => {
  const flags = authenticationInventory(32 + 64 + 2 ** 40);
  assert.deepEqual(flags.enabled, ['Password', 'Unauthenticated']);
  assert.equal(flags.unknown, 2 ** 40);
  for (const value of [-1, 3.5, NaN, Infinity, '32', Number.MAX_SAFE_INTEGER + 1])
    assert.equal(authenticationInventory(value).valid, false);
});
test('default WSGI callable alone does not classify a route as Python', () => {
  assert.match(
    applicationHandler({ DispatchClass: 'Orders.Rest', WSGICallable: 'app' }),
    /^Dispatch:/,
  );
  assert.doesNotMatch(applicationHandler({ WSGICallable: 'app', CSPZENEnabled: true }), /Python/);
  assert.match(applicationHandler({ WSGIAppName: 'orders', WSGICallable: 'app' }), /^Python:/);
});
test('denied configuration is unavailable and cannot yield reassuring readiness checks', () => {
  const denied = dossier();
  denied.configuration = {
    ...denied.configuration,
    outcome: 'denied',
    data: undefined,
    explanation: 'No native security privilege.',
  };
  const results = applicationReadiness(denied);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'unavailable');
  assert.match(results[0].detail, /privilege/);
});
test('missing namespace differs from denied namespace in readiness', () => {
  const missing = dossier();
  missing.namespace.outcome = 'missing';
  missing.namespace.data = undefined;
  assert.equal(
    applicationReadiness(missing).find((row) => row.id === 'namespace')?.status,
    'review',
  );
  missing.namespace.outcome = 'denied';
  assert.equal(
    applicationReadiness(missing).find((row) => row.id === 'namespace')?.status,
    'unavailable',
  );
});
test('application role mapping review preserves malformed and unconditional grants', () => {
  assert.equal(applicationRoleMappings({}).at(0)?.malformed, true);
  assert.equal(
    applicationRoleMappings([{ MatchRole: 'Ops', TargetRoles: ['Read', 42] }])[0].malformed,
    true,
  );
  const value = dossier({ MatchRoles: [{ MatchRole: '', TargetRoles: ['%All'] }] });
  const finding = applicationReadiness(value).find((row) => row.id === 'roles');
  assert.equal(finding?.status, 'review');
  assert.match(finding!.detail, /%All/);
});
test('comparison normalizes only declared set fields and preserves role mapping order', () => {
  const first = dossier({
    CorsAllowlist: ['https://a.example', 'https://b.example'],
    MatchRoles: [
      { MatchRole: 'A', TargetRoles: ['X'] },
      { MatchRole: 'B', TargetRoles: ['Y'] },
    ],
  });
  const next = structuredClone(first);
  next.configuration.data!.CorsAllowlist = ['https://b.example', 'https://a.example'];
  next.configuration.data!.MatchRoles = [
    ...(first.configuration.data!.MatchRoles as unknown[]),
  ].reverse();
  const result = compareApplicationDossiers(first, next);
  assert.equal(result.fields.find((row) => row.key === 'CorsAllowlist')?.status, 'same');
  assert.equal(result.fields.find((row) => row.key === 'MatchRoles')?.status, 'changed');
});
test('missing and unreadable fields do not masquerade as deletions', () => {
  const first = dossier({ DispatchClass: 'Orders.Rest' });
  const next = structuredClone(first);
  delete next.configuration.data!.DispatchClass;
  assert.equal(
    compareApplicationDossiers(first, next).fields.find((row) => row.key === 'DispatchClass')
      ?.status,
    'no-longer-returned',
  );
  next.configuration.outcome = 'denied';
  assert.equal(compareApplicationDossiers(first, next).comparable, false);
  assert.deepEqual(compareApplicationDossiers(first, next).fields, []);
});
test('different applications cannot be compared accidentally', () => {
  const first = dossier();
  const next = dossier();
  next.application = '/services/orders-admin';
  assert.equal(compareApplicationDossiers(first, next).comparable, false);
});
test('omitted access fields remain unavailable rather than implying no grants', () => {
  const value = dossier();
  delete value.configuration.data!.Resource;
  delete value.configuration.data!.MatchRoles;
  const results = applicationReadiness(value);
  assert.equal(results.find((row) => row.id === 'entry')?.status, 'unavailable');
  assert.equal(results.find((row) => row.id === 'roles')?.status, 'unavailable');
});
test('application path relationships use boundaries and show inventory facts only', () => {
  const rows = relatedApplications('/services/orders', {}, [
    { Name: '/services/orders/archive' },
    { Name: '/services/order' },
    { Name: '/services' },
    { Name: '/services/orders-old' },
  ]);
  assert.deepEqual(
    rows.map((row) => row.name),
    ['/services/orders/archive', '/services'],
  );
  assert.deepEqual(rows[0].reasons, ['Nested route']);
});
test('readiness procedure is schema-valid, read-only and keeps every prerequisite required', () => {
  const value = dossier({ GroupById: 'Staff', JWTAuthEnabled: true, ServeFiles: 'Always' });
  const plan = applicationReviewProcedure(value);
  assert.equal(procedureBodySchema.safeParse(plan).success, true);
  assert.equal(plan.steps.length, 4);
  const checklist = plan.steps.find((step) => step.kind === 'checklist');
  assert.ok(checklist?.kind === 'checklist');
  assert.equal(checklist.items.length, maintenanceChecks(value).length);
  assert.ok(checklist.items.every((item) => item.required));
  assert.equal(checklist.requireNote, true);
  assert.equal(plan.steps.filter((step) => step.kind === 'observation').length, 2);
});
test('application names reject URL queries, fragments and control characters', () => {
  assert.equal(validApplicationName('/services/orders'), true);
  for (const name of [
    'https://example.test/a',
    '/a?token=b',
    '/a#x',
    '/a\\x',
    '/a\n',
    '/' + 'a'.repeat(256),
  ])
    assert.equal(validApplicationName(name), false);
});
test('CORS and cookie review describes configuration without claiming endpoint vulnerability', () => {
  const value = dossier({
    CorsAllowlist: ['*'],
    CorsCredentialsAllowed: true,
    CookiePath: '/',
    SessionScope: 'None',
    UseCookies: 'Always',
  });
  const result = applicationReadiness(value);
  assert.equal(result.find((row) => row.id === 'cors')?.status, 'review');
  assert.match(result.find((row) => row.id === 'cors')!.detail, /actual gateway/);
  assert.equal(result.find((row) => row.id === 'cookie')?.status, 'review');
  assert.match(result.find((row) => row.id === 'cookie')!.detail, /deployed gateway/);
});
