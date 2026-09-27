import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nativePrivilegeAlternatives,
  requireCommandPrivileges,
} from '../server/command-authorization';
import type { CommandResult } from '../shared/command-result';
const record = (
  path: string,
  method: 'PUT' | 'POST' | 'DELETE' = 'PUT',
): Pick<CommandResult, 'operation'> => ({
  operation: {
    path,
    method,
    query: { name: 'fixture', id: '1', serverId: '1', clientName: 'fixture' },
  },
});
test('command sources use the pinned endpoint privileges, not broad path-family guesses', () => {
  for (const [path, privilege] of [
    ['/v2/device', 'Manage'],
    ['/v2/wallet/collection', 'Wallet'],
    ['/v2/security/oauth2/client/server-definition', 'OAuth2_Client'],
    ['/v2/security/oauth2/client/client-configuration', 'OAuth2_Client'],
    ['/v2/security/oauth2/resource-server', 'Secure'],
    ['/v2/web-app', 'Secure'],
  ]) {
    assert.deepEqual(nativePrivilegeAlternatives(path, 'PUT'), [privilege]);
    assert.doesNotThrow(() =>
      requireCommandPrivileges(record(path), { [privilege]: { use: true } }),
    );
    assert.throws(() => requireCommandPrivileges(record(path), { Operate: { use: true } }), {
      status: 403,
    });
    const wrong = privilege === 'Secure' ? 'Wallet' : 'Secure';
    assert.throws(() => requireCommandPrivileges(record(path), { [wrong]: { use: true } }), {
      status: 403,
    });
  }
});
test('task commands preserve distinct mutation and evidence privileges', () => {
  assert.doesNotThrow(() => requireCommandPrivileges(record('/v2/task'), { Task: { use: true } }));
  assert.doesNotThrow(() =>
    requireCommandPrivileges(record('/v2/task/run', 'POST'), { Task: { use: true } }),
  );
  assert.throws(
    () => requireCommandPrivileges(record('/v2/task/run', 'POST'), { Operate: { use: true } }),
    { status: 403 },
  );
  assert.throws(
    () => requireCommandPrivileges(record('/v2/task/suspend', 'POST'), { Task: { use: true } }),
    { status: 403 },
  );
  assert.doesNotThrow(() =>
    requireCommandPrivileges(record('/v2/task/suspend', 'POST'), {
      Task: { use: true },
      Operate: { use: true },
    }),
  );
});
test('missing or unknown contract privilege declarations fail closed', () => {
  assert.deepEqual(nativePrivilegeAlternatives('/unknown', 'PUT'), []);
  assert.deepEqual(nativePrivilegeAlternatives('/login', 'POST'), []);
});
