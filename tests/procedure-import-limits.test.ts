import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { transformSync } from 'esbuild';
import supertest from 'supertest';
import { procedureBodySchema, type ProcedureBody } from '../shared/procedure';
import {
  parseProcedureImportText,
  procedureBodyFitsRequest,
  PROCEDURE_BODY_BYTES,
  PROCEDURE_IMPORT_REQUEST_BYTES,
  PROCEDURE_IMPORT_TEXT_BYTES,
} from '../shared/procedure-import';
import { createApp } from '../server/app';
import { IrisClient } from '../server/upstream';
import { RunEngine } from '../server/run-engine';
import { RunStore } from '../server/run-store';
import { ProcedureStore } from '../server/procedure-store';
import { RequestError } from '../src/api';

const basic: ProcedureBody = {
  title: 'Import boundary',
  description: '',
  expectedOutcome: '',
  tags: [],
  steps: [
    {
      id: 'health',
      kind: 'observation',
      title: 'Health',
      instruction: '',
      source: 'health',
      target: '',
    },
  ],
};
const pack = (body: ProcedureBody) => ({ format: 'waypoint-procedure-1', body });
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
function boundaryBody(maximum = PROCEDURE_BODY_BYTES, escaped = false): ProcedureBody {
  const body: ProcedureBody = {
    ...basic,
    tags: Array.from({ length: 8 }, (_, index) => 'tag' + index),
    steps: Array.from({ length: 30 }, (_, index) => ({
      id: 'check' + index,
      kind: 'checklist',
      title: 'Readiness',
      instruction: '',
      items: Array.from({ length: 12 }, (_, item) => ({
        id: 'item' + item,
        text: (escaped ? '\u0001' : '界').repeat(100),
        required: true,
      })),
      requireNote: true,
      reference: '',
    })),
  };
  let remaining = maximum - size(body);
  assert.ok(remaining >= 0);
  for (const step of body.steps) {
    const count = Math.min(2000, Math.floor(remaining / 3));
    step.instruction = '界'.repeat(count);
    remaining -= count * 3;
    const ascii = Math.min(2000 - count, remaining);
    step.instruction += 'a'.repeat(ascii);
    remaining -= ascii;
  }
  assert.equal(remaining, 0);
  assert.equal(size(body), maximum);
  return procedureBodySchema.parse(body);
}
async function directory(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'waypoint-import-limit-'));
  t.after(async () => {
    const actual = await realpath(root),
      temporary = await realpath(tmpdir());
    assert.equal(dirname(actual), temporary);
    assert.ok(basename(actual).startsWith('waypoint-import-limit-'));
    await rm(actual, { recursive: true, force: false });
  });
  return root;
}

function defaultExpansionBody() {
  const input = boundaryBody() as any;
  for (const step of input.steps) delete step.reference;
  const padding = PROCEDURE_BODY_BYTES - size(input);
  input.steps.find((step: any) => step.instruction.length + padding <= 2000).instruction +=
    'a'.repeat(padding);
  assert.equal(size(input), PROCEDURE_BODY_BYTES);
  assert.equal(size(procedureBodySchema.parse(input)), PROCEDURE_BODY_BYTES + 450);
  return input;
}

test('schema-shaped formatting bound covers exact-body Unicode and escaped own exports', () => {
  assert.equal(PROCEDURE_IMPORT_REQUEST_BYTES - PROCEDURE_BODY_BYTES, 41);
  assert.equal(PROCEDURE_IMPORT_TEXT_BYTES, 288123);
  for (const escaped of [false, true]) {
    const body = boundaryBody(PROCEDURE_BODY_BYTES, escaped),
      text = JSON.stringify(pack(body), null, 2);
    assert.ok(text.length <= PROCEDURE_IMPORT_TEXT_BYTES);
    assert.ok(Buffer.byteLength(text) <= PROCEDURE_IMPORT_TEXT_BYTES);
    assert.equal(Buffer.byteLength(text) - size(pack(body)), 25938);
    assert.deepEqual(parseProcedureImportText(text).body, body);
    assert.equal(size(parseProcedureImportText(text)), PROCEDURE_IMPORT_REQUEST_BYTES);
  }
  const multilingual = {
    ...basic,
    steps: Array.from({ length: 17 }, (_, index) => ({
      ...basic.steps[0],
      id: 'read' + index,
      instruction: '界'.repeat(2000),
    })),
  };
  assert.ok(size(multilingual) > 100000);
  assert.deepEqual(
    parseProcedureImportText(JSON.stringify(pack(multilingual), null, 2)).body,
    multilingual,
  );
});

test('oversized raw text and canonical bodies remain bounded before import transport', () => {
  assert.throws(
    () => parseProcedureImportText(' '.repeat(PROCEDURE_IMPORT_TEXT_BYTES + 1)),
    /including formatting/,
  );
  assert.throws(
    () => parseProcedureImportText('界'.repeat(Math.floor(PROCEDURE_IMPORT_TEXT_BYTES / 3) + 1)),
    /including formatting/,
  );
  const body = boundaryBody(PROCEDURE_BODY_BYTES + 1);
  assert.equal(procedureBodyFitsRequest(body), false);
  assert.throws(() => parseProcedureImportText(JSON.stringify(pack(body))), /256 KiB/);
});

test('procedure import uses the exact 41-byte parser allowance; ordinary requests keep 256 KiB', async (t) => {
  const root = await directory(t);
  let infoReads = 0;
  const client = new IrisClient('http://synthetic.invalid', async (url, init) => {
    assert.equal(init?.method, 'GET');
    assert.ok(String(url).endsWith('/info'));
    infoReads++;
    return Response.json({
      result: { apiVersion: 2, username: 'Importer', privileges: { Operate: { use: true } } },
    });
  });
  const engine = new RunEngine(new RunStore(root), client, 'synthetic');
  const app = createApp({ irisUrl: 'http://synthetic.invalid', runEngine: engine, client });
  const agent = supertest.agent(app);
  await supertest(app).post('/api/procedures/import').send(pack(basic)).expect(401);
  const login = await agent
    .post('/api/login')
    .send({ username: 'Importer', password: 'synthetic' })
    .expect(200);
  await agent.post('/api/procedures/import').send(pack(basic)).expect(403);
  const body = boundaryBody(),
    text = JSON.stringify(body);
  const original = await agent
    .post('/api/procedures')
    .set('X-CSRF-Token', login.body.csrf)
    .set('Content-Type', 'application/json')
    .send(text)
    .expect(201);
  const imported = await agent
    .post('/api/procedures/import')
    .set('X-CSRF-Token', login.body.csrf)
    .send(parseProcedureImportText(JSON.stringify(pack(original.body.versions[0].body), null, 2)))
    .expect(201);
  assert.notEqual(imported.body.id, original.body.id);
  assert.equal(imported.body.owner, 'Importer');
  assert.deepEqual(imported.body.versions[0].body, body);
  const priorReads = infoReads;
  await agent
    .post('/api/procedures')
    .set('X-CSRF-Token', login.body.csrf)
    .set('Content-Type', 'application/json')
    .send(text + ' ')
    .expect(413);
  await agent
    .post('/api/procedures/import')
    .set('X-CSRF-Token', login.body.csrf)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(pack(body)) + ' ')
    .expect(413);
  await agent
    .post('/api/procedures/import/')
    .set('X-CSRF-Token', login.body.csrf)
    .send(pack(body))
    .expect(413);
  assert.equal(
    infoReads,
    priorReads,
    'oversized payloads are stopped before upstream privilege reads',
  );
  await agent
    .post('/api/procedures')
    .set('X-CSRF-Token', login.body.csrf)
    .send(defaultExpansionBody())
    .expect(413);
});

test('authoring defaults cannot store an oversized body or alter an existing version', async (t) => {
  const root = await directory(t),
    library = new ProcedureStore(root, 'synthetic');
  const original = await library.create('Importer', basic);
  const scope = (await readdir(join(root, 'procedures')))[0];
  const filename = join(root, 'procedures', scope, original.id + '.json');
  const before = await readFile(filename),
    input = defaultExpansionBody();
  await assert.rejects(() => library.create('Importer', input), { status: 413 });
  await assert.rejects(() => library.revise('Importer', original.id, 1, input, 'Too large'), {
    status: 413,
  });
  assert.deepEqual(await readFile(filename), before);
  assert.deepEqual(await library.read('Importer', original.id), original);
  assert.equal((await library.list('Importer')).length, 1);
  const legacy = structuredClone(original);
  legacy.versions[0].body = procedureBodySchema.parse(input);
  await writeFile(filename, JSON.stringify(legacy));
  const legacyBytes = await readFile(filename);
  assert.deepEqual(
    await library.read('Importer', original.id),
    legacy,
    'the new write bound does not deny or rewrite a pre-existing schema-valid record',
  );
  assert.deepEqual(await readFile(filename), legacyBytes);
});

test('actual import callback preserves pasted text and selection for rejected definitions and server failures', async () => {
  const source = await readFile(
    new URL('../src/procedures/ProcedureLibrary.tsx', import.meta.url),
    'utf8',
  );
  const extract = (start: string, end: string) => {
    const first = source.indexOf(start),
      last = source.indexOf(end, first);
    assert.ok(first >= 0 && last > first);
    return source.slice(first, last);
  };
  const code = transformSync(
    extract('  async function perform(', '  function show(') +
      '\n' +
      extract('  async function importDefinition(', '  const visible ='),
    { loader: 'ts', target: 'es2022' },
  ).code;
  const invoke = new Function(
    'importText',
    'parseProcedureImportText',
    'request',
    'show',
    'setImportText',
    'setImporting',
    'readList',
    'setBusy',
    'setError',
    'RequestError',
    'const selected = undefined; const returning = false; const actionPending = { current: false }; const unverified = new Set(); const actionFailure = { current: "" }; const setErrorValue = setError;\n' +
      code +
      '\nreturn importDefinition();',
  );
  const invalid = [
    '{broken',
    JSON.stringify({ ...pack(basic), format: 'unsupported' }),
    JSON.stringify({ ...pack(basic), owner: 'other' }),
    JSON.stringify(pack({ ...basic, command: 'run code' } as any)),
    JSON.stringify(
      pack({ ...basic, steps: [{ ...basic.steps[0], source: 'https://example.invalid' }] } as any),
    ),
    JSON.stringify(pack({ ...basic, steps: [{ ...basic.steps[0], code: 'execute' }] } as any)),
    JSON.stringify(
      pack({
        ...basic,
        steps: [
          {
            id: 'check',
            kind: 'checklist',
            title: 'Check',
            instruction: '',
            items: [{ id: 'one', text: 'Check', required: true }],
            requireNote: true,
            reference: 'javascript:alert(1)',
          },
        ],
      }),
    ),
    JSON.stringify(
      pack({
        ...basic,
        steps: [
          {
            id: 'check',
            kind: 'checklist',
            title: 'Check',
            instruction: '',
            items: [{ id: 'one', text: 'Check', required: true, code: 'execute' }],
            requireNote: true,
            reference: '',
          },
        ],
      } as any),
    ),
    JSON.stringify(
      pack({
        ...basic,
        steps: [
          basic.steps[0],
          {
            id: 'assert',
            kind: 'assertion',
            title: 'Assert',
            instruction: '',
            check: 'execute',
            sourceStepId: 'health',
            expected: true,
          },
        ],
      } as any),
    ),
    ' '.repeat(PROCEDURE_IMPORT_TEXT_BYTES + 1),
  ];
  for (const [index, text] of [...invalid, JSON.stringify(pack(basic))].entries()) {
    let requests = 0,
      error = '',
      retained = text,
      selected = 'old',
      open = true,
      busy = false;
    await invoke(
      text,
      parseProcedureImportText,
      async () => {
        requests++;
        throw new Error('Synthetic server rejection');
      },
      () => {
        selected = 'new';
      },
      (value: string) => {
        retained = value;
      },
      (value: boolean) => {
        open = value;
      },
      async () => assert.fail('No failed import refreshes the list'),
      (value: boolean) => {
        busy = value;
      },
      (value: string) => {
        error = value;
      },
      RequestError,
    );
    assert.equal(requests, index === invalid.length ? 1 : 0);
    assert.ok(error);
    assert.equal(retained, text);
    assert.equal(selected, 'old');
    assert.equal(open, true);
    assert.equal(busy, false);
  }
});

test('import validation identifies every nested JSON location without dropping the underlying message', () => {
  const invalid = structuredClone(basic) as any;
  invalid.steps = [
    {
      id: 'first',
      kind: 'checklist',
      title: 'First',
      instruction: '',
      items: [{ id: 'check', text: 42, required: false }],
      requireNote: false,
      reference: 'http://example.com/first',
    },
    {
      id: 'second',
      kind: 'checklist',
      title: 'Second',
      instruction: '',
      items: [{ id: 'check', text: 'Review', required: false }],
      requireNote: false,
      reference: 'javascript:void(0)',
    },
  ];
  assert.throws(
    () => parseProcedureImportText(JSON.stringify(pack(invalid))),
    (error: Error) => {
      assert.match(
        error.message,
        /\$\.body\.steps\[0\]\.items\[0\]\.text: Invalid input: expected string, received number/,
      );
      assert.match(error.message, /\$\.body\.steps\[0\]\.reference: References must be HTTPS/);
      assert.match(error.message, /\$\.body\.steps\[1\]\.reference: References must be HTTPS/);
      return true;
    },
  );
});

test('import validation distinguishes envelope, body and nested unknown fields', () => {
  for (const [value, path] of [
    [{ ...pack(basic), owner: 'other' }, '$'],
    [pack({ ...basic, command: 'unsupported' } as any), '$.body'],
    [
      pack({ ...basic, steps: [{ ...basic.steps[0], extra: 'unsupported' }] } as any),
      '$.body.steps[0]',
    ],
  ] as const) {
    assert.throws(
      () => parseProcedureImportText(JSON.stringify(value)),
      (error: Error) => {
        assert.ok(error.message.startsWith(path + ': Unrecognized key:'));
        return true;
      },
    );
  }
  assert.throws(
    () => parseProcedureImportText('{broken'),
    /Paste a valid Waypoint procedure JSON document/,
  );
});
