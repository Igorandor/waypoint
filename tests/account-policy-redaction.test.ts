import test from 'node:test';
import assert from 'node:assert/strict';
import { credentialValues, redact } from '../shared/redaction';
import { IrisClient } from '../server/upstream';

const policyNames = ['ChangePassword', 'PasswordNeverExpires', 'HOTPKeyDisplay'];

test('account policy booleans remain readable in native result objects and inventory arrays', () => {
  for (const value of [true, false]) {
    const policies = Object.fromEntries(policyNames.map((name) => [name, value]));
    const input = { result: { User: policies, inventory: [{ ...policies }] } };
    assert.deepEqual(redact(input), input);
  }
});

test('account policy exceptions require exact names and primitive boolean values', () => {
  for (const value of [
    'true',
    'false',
    'private-value',
    0,
    1,
    null,
    [],
    [false],
    { enabled: true },
  ]) {
    for (const name of policyNames)
      assert.deepEqual(redact({ [name]: value }), { [name]: '[redacted]' });
  }
  for (const name of policyNames) {
    for (const alias of [name.toLowerCase(), name.toUpperCase(), `_${name}`, `${name}Secret`]) {
      assert.deepEqual(redact({ [alias]: false }), { [alias]: '[redacted]' });
    }
  }
});

test('policy booleans cannot reopen protected branches or weaken credential echo collection', () => {
  for (const name of [
    'Password',
    'access_token',
    'PrivateKey',
    'HOTPKey',
    'ClientSecret',
    'Secrets',
  ]) {
    const branch = { ChangePassword: true, PasswordNeverExpires: false, HOTPKeyDisplay: true };
    assert.deepEqual(redact({ [name]: branch }), { [name]: '[redacted]' });
    assert.deepEqual(redact({ [name]: [branch] }), { [name]: '[redacted]' });
    assert.deepEqual(redact({ [name]: false }), { [name]: '[redacted]' });
  }
  const input = { ChangePassword: 'echo-fixture', Password: { HOTPKeyDisplay: 'nested-fixture' } };
  assert.deepEqual(credentialValues(input), ['echo-fixture', 'nested-fixture']);
  assert.deepEqual(redact({ message: 'echo-fixture nested-fixture' }, credentialValues(input)), {
    message: '[redacted] [redacted]',
  });
});

test('native user read preserves account policy booleans while redacting secret fields', async () => {
  const client = new IrisClient('http://iris', async (_url, init) => {
    assert.equal(init?.method, 'GET');
    assert.equal(init?.body, undefined);
    return Response.json({
      result: {
        Name: 'fixture-account',
        ChangePassword: true,
        PasswordNeverExpires: false,
        HOTPKeyDisplay: true,
        Password: 'private-password',
        HOTPKey: 'private-key',
        Secrets: { ChangePassword: true },
      },
    });
  });
  const result = await client.request('fixture-auth', {
    path: '/v2/security/user',
    method: 'GET',
    query: { name: 'fixture-account' },
  });
  assert.deepEqual(result.data, {
    Name: 'fixture-account',
    ChangePassword: true,
    PasswordNeverExpires: false,
    HOTPKeyDisplay: true,
    Password: '[redacted]',
    HOTPKey: '[redacted]',
    Secrets: '[redacted]',
  });
});
