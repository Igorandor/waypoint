import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimeConfiguration } from '../server/runtime-config';
test('existing deployment requires coherent HTTPS origin and secure cookies', () => {
  const config = runtimeConfiguration({
    IRIS_URL: 'https://iris.example.test:52773',
    PUBLIC_ORIGIN: 'https://waypoint.example.test',
    IRIS_INSTANCE_ID: 'production-1',
  });
  assert.equal(config.secure, true);
  assert.equal(config.instanceId, 'production-1');
  assert.throws(
    () => runtimeConfiguration({ PUBLIC_ORIGIN: 'https://example.test', COOKIE_SECURE: 'false' }),
    /HTTPS/,
  );
  assert.throws(() => runtimeConfiguration({ PUBLIC_ORIGIN: 'http://example.test' }), /HTTPS/);
  assert.throws(
    () => runtimeConfiguration({ IRIS_URL: 'https://user:password@example.test' }),
    /without credentials/,
  );
  assert.throws(
    () => runtimeConfiguration({ IRIS_URL: 'https://example.test/api/admin' }),
    /without credentials/,
  );
  assert.throws(() => runtimeConfiguration({ COOKIE_SECURE: 'yes' }), /true or false/);
  assert.throws(() => runtimeConfiguration({ IRIS_INSTANCE_ID: '../another' }), /stable/);
  assert.throws(() => runtimeConfiguration({ PORT: '3e3' }), /TCP/);
  assert.equal(runtimeConfiguration({ IRIS_INSTANCE_ID: 'relay-local' }).instanceId, 'relay-local');
});
