import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const compiled = build({
  entryPoints: [fileURLToPath(new URL('../src/procedures/ProcedurePlanner.tsx', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['react', 'react/jsx-runtime'],
  plugins: [
    {
      name: 'isolated-inventory',
      setup(builder) {
        builder.onResolve({ filter: /^\.\.\/api$/ }, () => ({
          path: 'fixture-inventory',
          external: true,
        }));
      },
    },
  ],
});

async function fixture() {
  const calls: Array<{
    path: string;
    query: unknown;
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }> = [];
  const slots = new Map<number, any>();
  let cursor = 0,
    dirty = true;
  let effects: Array<() => void> = [];
  const created: unknown[] = [];
  const hooks = {
    useState(initial: any) {
      const index = cursor++;
      if (!slots.has(index)) slots.set(index, typeof initial === 'function' ? initial() : initial);
      return [
        slots.get(index),
        (value: any) => {
          slots.set(index, typeof value === 'function' ? value(slots.get(index)) : value);
          dirty = true;
        },
      ];
    },
    useEffect(effect: () => void | (() => void), dependencies: unknown[]) {
      const index = cursor++,
        previous = slots.get(index);
      if (
        !previous ||
        dependencies.some((value, offset) => !Object.is(value, previous.dependencies[offset]))
      ) {
        effects.push(() => {
          previous?.cleanup?.();
          slots.set(index, { dependencies, cleanup: effect() });
        });
      }
    },
  };
  const module = { exports: {} as any };
  const iris = (path: string, query: unknown) =>
    new Promise((resolve, reject) => calls.push({ path, query, resolve, reject }));
  new Function('require', 'module', 'exports', (await compiled).outputFiles[0].text)(
    (name: string) =>
      name === 'react' ? hooks : name === 'fixture-inventory' ? { iris } : require(name),
    module,
    module.exports,
  );
  let tree: any;
  const render = () => {
    for (let pass = 0; pass < 20; pass++) {
      dirty = false;
      cursor = 0;
      effects = [];
      tree = module.exports.ProcedurePlanner({
        onCreate: (body: unknown) => created.push(body),
        onCancel: () => {},
      });
      for (const effect of effects) effect();
      if (!dirty) return tree;
    }
    throw new Error('Controlled hook state did not settle.');
  };
  function nodes(node: any): any[] {
    return Array.isArray(node)
      ? node.flatMap(nodes)
      : node && typeof node === 'object'
        ? [node, ...nodes(node.props?.children)]
        : [];
  }
  function text(node: any): string {
    return Array.isArray(node)
      ? node.map(text).join('')
      : typeof node === 'string'
        ? node
        : node?.props
          ? text(node.props.children)
          : '';
  }
  const all = () => nodes(render());
  const button = (label: string) =>
    all().find((node) => node.type === 'button' && text(node) === label);
  const workflow = (purpose: string) => {
    all()
      .find((node) => node.type === 'select')
      .props.onChange({ target: { value: purpose } });
    render();
  };
  const target = () =>
    all().find((node) => node.type === 'select' && node.props.children?.[0]?.props?.value === '');
  const settle = async () => {
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    render();
  };
  render();
  return { calls, created, all, button, workflow, target, settle };
}

for (const [from, to, fails] of [
  ['application', 'capacity', false],
  ['task', 'shift', true],
] as const) {
  test(`leaving pending ${from} inventory enables ${to} preview and ignores its late ${fails ? 'error' : 'success'}`, async () => {
    const f = await fixture();
    f.workflow(from);
    assert.equal(f.calls.length, 1);
    assert.equal(f.button('Preview steps').props.disabled, true);
    f.workflow(to);
    assert.equal(f.button('Preview steps').props.disabled, false);
    f.button('Preview steps').props.onClick();
    assert.ok(f.button('Open in procedure editor'));
    assert.equal(f.created.length, 0);
    if (fails) f.calls[0].reject(new Error('Late inventory failure must not affect the new plan.'));
    else f.calls[0].resolve({ data: [{ Name: '/old-application' }] });
    await f.settle();
    assert.equal(f.button('Preview steps').props.disabled, false);
    assert.ok(f.button('Open in procedure editor'));
    assert.equal(
      f.all().some((node) => node.props?.error),
      false,
    );
    assert.equal(f.calls.length, 1);
    assert.equal(f.created.length, 0);
    f.button('Open in procedure editor').props.onClick();
    assert.equal(f.created.length, 1);
    assert.equal(
      (f.created[0] as any).title,
      to === 'capacity' ? 'Capacity readiness' : 'Operator handover observations',
    );
  });
}

test('switching application inventory to task inventory keeps only the current request in control', async () => {
  const f = await fixture();
  f.workflow('application');
  f.workflow('task');
  assert.deepEqual(
    f.calls.map((call) => call.path),
    ['/v2/web-apps', '/v2/tasks'],
  );
  assert.equal(f.target().props.disabled, true);
  f.calls[0].resolve({ data: [{ Name: '/old-application' }] });
  await f.settle();
  assert.equal(f.target().props.disabled, true);
  assert.equal(f.button('Preview steps').props.disabled, true);
  assert.equal(
    f.all().some((node) => node.type === 'option' && node.props.value === '/old-application'),
    false,
  );
  f.calls[1].resolve({ data: [{ Id: 7, Name: 'Current task' }] });
  await f.settle();
  assert.equal(f.target().props.disabled, false);
  assert.equal(f.button('Preview steps').props.disabled, true);
  f.target().props.onChange({ target: { value: '7' } });
  assert.equal(f.button('Preview steps').props.disabled, false);
  f.button('Preview steps').props.onClick();
  assert.ok(f.button('Open in procedure editor'));
  assert.equal(f.created.length, 0);
});
