import { pageContent } from '../../editor/src/schema.mjs';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdtempSync,
  symlinkSync,
  rmSync,
  existsSync,
  renameSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { SqliteStore } from '../src/sqlite-store.ts';
import {
  SpaceService,
  CoreClient,
  parseCommand,
  commandSchema,
  catalogue,
  stable,
} from '../../core/src/index.ts';
import { qualifiedEngine } from '../../editor/src/engine.mjs';
const here = dirname(fileURLToPath(import.meta.url)),
  root = join(here, '../../..');
const body = (text = 'initial', title = 'Page') =>
  pageContent(title, text, { title: 'title', body: 'b' });
const create = (spaceId, over = {}) => ({
  apiVersion: 1,
  spaceId,
  method: 'page.create',
  pageId: 'p',
  operationId: 'create',
  kind: 'note',
  content: body(),
  properties: {},
  ...over,
});
const update = (spaceId, head, over = {}) => ({
  apiVersion: 1,
  spaceId,
  method: 'page.update',
  pageId: 'p',
  operationId: 'edit',
  expectedHead: head,
  patch: { content: body('initial', 'Edited') },
  ...over,
});
function setup(t, hooks = {}) {
  const v = SqliteStore.createDisposable(hooks),
    s = new SpaceService(v, qualifiedEngine),
    principal = { spaceId: v.spaceId, scopes: ['read', 'write'] };
  t.after(() => {
    try {
      v.close();
    } catch {}
    rmSync(v.directory, { recursive: true, force: true });
  });
  return {
    v,
    s,
    principal,
    run: (c) => s.execute(c, principal),
    client: new CoreClient((c) => s.execute(c, principal)),
  };
}
async function seeded(t, hooks) {
  const x = setup(t, hooks);
  const r = await x.run(create(x.v.spaceId));
  assert.equal(r.ok, true);
  return { ...x, head: r.value.head };
}
const ok = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
};
const code = (r, c) => {
  assert.equal(r.ok, false);
  assert.equal(r.error.code, c);
};
function read(x, extra = {}) {
  return x.run({
    apiVersion: 1,
    spaceId: x.v.spaceId,
    method: 'page.read',
    pageId: 'p',
    ...extra,
  });
}
async function processRun(args, input, service, principal) {
  const p = spawn(process.execPath, args, {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });
  let out = '',
    err = '';
  p.stdout.on('data', (c) => (out += c));
  p.stderr.on('data', (c) => (err += c));
  if (service)
    p.on('message', async (m) => {
      const reply = await service.execute(m.command, principal);
      p.send({ id: m.id, reply });
    });
  p.stdin.end(input);
  const [exit, signal] = await once(p, 'exit');
  return { out, err, exit, signal };
}
test('catalogue generates strict schemas and inferred commands from the same fields', () => {
  assert.equal(commandSchema.oneOf.length, 13);
  assert.deepEqual(
    Object.keys(catalogue).filter((k) => k.startsWith('page.')),
    ['page.list', 'page.create', 'page.read', 'page.update']
  );
  const c = create('s');
  assert.equal(parseCommand(c).method, 'page.create');
  for (const v of [
    { ...c, principal: 'admin' },
    { ...c, apiVersion: 2 },
    { ...c, spaceId: 'bad/path' },
    { ...c, content: { ...c.content, extra: 1 } },
    { ...c, properties: { x: { type: 'number', value: 'wrong' } } },
  ])
    assert.throws(() => parseCommand(v), /INVALID_REQUEST/);
  let nested = {};
  for (let i = 0; i < 34; i++) nested = { nested };
  assert.throws(
    () => parseCommand({ ...c, content: { ...c.content, value: nested } }),
    /INVALID_REQUEST/
  );
  assert.throws(
    () =>
      parseCommand(
        JSON.parse(
          JSON.stringify(c).replace(
            '"properties":{}',
            '"properties":{"__proto__":{"type":"text","value":"x"}}'
          )
        )
      ),
    /INVALID_REQUEST/
  );
});
test('real Y root persists once; note and task share the same page operations', async (t) => {
  const x = await seeded(t);
  const task = ok(
    await x.run(
      create(x.v.spaceId, {
        pageId: 'task',
        operationId: 'task',
        kind: 'task',
        content: body('task body'),
        properties: { due: { type: 'date', value: '2026-11-15' } },
      })
    )
  );
  const p = ok(await read(x));
  assert.equal(p.kind, 'note');
  assert.equal(p.title, 'Page');
  const tp = ok(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      method: 'page.read',
      pageId: 'task',
    })
  );
  assert.equal(tp.content.value.content[1].content[0].text, 'task body');
  ok(
    await x.run(
      update(x.v.spaceId, task.head, {
        pageId: 'task',
        operationId: 'task-edit',
        patch: { content: body('task body', 'Task page') },
      })
    )
  );
  const db = new DatabaseSync(join(x.v.directory, 'space.sqlite'), {
    readOnly: true,
  });
  t.after(() => db.close());
  // Same connection holds exclusive lock; inspecting via another connection is intentionally refused.
  assert.throws(() => db.prepare('SELECT * FROM roots').all(), /locked/);
  const r = x.v.load('p');
  assert.ok(Buffer.from(r.bytes).includes(Buffer.from('clutter-page-y-v2')));
  assert.equal(x.v.load('p').head, x.head);
});
test('one running writer and durable identity survive service restart', async (t) => {
  const x = await seeded(t);
  assert.throws(
    () => new SpaceService(x.v, qualifiedEngine),
    /SERVICE_ALREADY_BOUND/
  );
  assert.throws(() => SqliteStore.reopenDisposable(x.v.directory), /locked/);
  const { directory, spaceId } = x.v;
  x.v.close();
  const next = SqliteStore.reopenDisposable(directory);
  t.after(() => next.close());
  assert.equal(next.spaceId, spaceId);
  const s = new SpaceService(next, qualifiedEngine);
  assert.equal(ok(await s.execute(create(spaceId), x.principal)).sequence, 1);
});
test('all adapters receive the same conflict/outcome semantics; operation IDs are immutable', async (t) => {
  const x = await seeded(t);
  const c = update(x.v.spaceId, x.head);
  const receipt = ok(await x.run(c));
  assert.deepEqual(ok(await x.client.execute(c)), receipt);
  code(
    await x.run({ ...c, patch: { content: body('initial', 'different') } }),
    'OPERATION_ID_REUSED'
  );
  code(await x.run({ ...c, operationId: 'stale' }), 'CONFLICT');
  assert.equal(ok(await read(x)).title, 'Edited');
});
test('permission checks precede receipt lookup and cannot be supplied in a command', async (t) => {
  const x = await seeded(t);
  const c = create(x.v.spaceId);
  code(await x.s.execute(c, { ...x.principal, scopes: ['read'] }), 'FORBIDDEN');
  code(
    await x.s.execute(c, { spaceId: 'other', scopes: ['read', 'write'] }),
    'FORBIDDEN'
  );
  code(await x.run({ ...c, scopes: ['read', 'write'] }), 'INVALID_REQUEST');
});
test('queued request is snapshotted; later caller mutation cannot change admitted writes', async (t) => {
  const x = setup(t),
    c = create(x.v.spaceId);
  const p = x.run(c);
  c.content.value.content[0].content[0].text = 'mutated';
  ok(await p);
  assert.equal(ok(await read(x)).title, 'Page');
});
test('unknown fields/schema/content refuse without overwriting the current root', async (t) => {
  const x = await seeded(t);
  const invalids = [
    { ...body(), schemaVersion: 999 },
    { ...body(), value: { type: 'doc', content: [{ type: 'unknown' }] } },
    { ...body(), value: { ...body().value, unknown: true } },
    {
      ...body(),
      value: {
        type: 'doc',
        content: [
          {
            type: 'task_slot',
            attrs: { taskId: 'foreign', blockId: 'slot-foreign' },
          },
        ],
      },
    },
  ];
  for (const [i, b] of invalids.entries()) {
    const r = await x.run(
      update(x.v.spaceId, x.head, {
        operationId: 'bad' + i,
        patch: { content: b },
      })
    );
    assert.equal(r.ok, false);
  }
  assert.equal(ok(await read(x)).head, x.head);
  code(
    await x.run(
      update(x.v.spaceId, x.head, {
        patch: { properties: { due: { type: 'date', value: '2026-02-30' } } },
      })
    ),
    'INVALID_CONTENT'
  );
});
test('after-COMMIT fault freezes unrelated writes until exact operation resolves', async (t) => {
  let lose = false;
  const x = await seeded(t, {
    afterCommit: () => {
      if (lose) {
        lose = false;
        throw Error('lost commit');
      }
    },
  });
  lose = true;
  const c = update(x.v.spaceId, x.head);
  code(await x.run(c), 'OUTCOME_UNKNOWN');
  code(
    await x.run(create(x.v.spaceId, { pageId: 'q', operationId: 'other' })),
    'UNRESOLVED_OPERATION'
  );
  const r = ok(await x.run(c));
  assert.equal(r.sequence, 2);
  ok(await x.run(create(x.v.spaceId, { pageId: 'q', operationId: 'other' })));
});
test('pre-COMMIT fault rolls back root/head/outcome and exact retry succeeds', async (t) => {
  let fail = false;
  const x = await seeded(t, {
    beforeCommit: () => {
      if (fail) throw Error('failed');
    },
  });
  fail = true;
  const c = update(x.v.spaceId, x.head);
  code(await x.run(c), 'INTERNAL_ERROR');
  assert.equal(ok(await read(x)).head, x.head);
  fail = false;
  assert.equal(ok(await x.run(c)).sequence, 2);
});
test('disposable restrictions refuse arbitrary directories, symlink aliases and missing stores', async (t) => {
  const p = mkdtempSync(join(tmpdir(), 'not-clutter-'));
  t.after(() => rmSync(p, { recursive: true, force: true }));
  assert.throws(() => SqliteStore.reopenDisposable(p));
  const x = await seeded(t);
  x.v.close();
  const link = join(p, 'alias');
  symlinkSync(x.v.directory, link);
  assert.throws(() => SqliteStore.reopenDisposable(link), /NOT_DISPOSABLE/);
  const db = join(x.v.directory, 'space.sqlite');
  renameSync(db, db + '.bak');
  assert.throws(() => SqliteStore.reopenDisposable(x.v.directory));
  assert.equal(existsSync(db), false);
});
test('unknown store version, identity mismatch and corrupt roots are refused without repair', async (t) => {
  for (const change of [
    (db) => db.exec('PRAGMA user_version=999'),
    (db) => db.exec("UPDATE identity SET space_id='other'"),
    (db) => db.exec("UPDATE roots SET payload=x'00'"),
  ]) {
    const x = await seeded(t);
    x.v.close();
    const file = join(x.v.directory, 'space.sqlite'),
      db = new DatabaseSync(file);
    change(db);
    db.close();
    const before = readFileSync(file);
    assert.throws(() => SqliteStore.reopenDisposable(x.v.directory));
    assert.deepEqual(readFileSync(file), before);
  }
});
test('real CLI and MCP processes use the same running Core and exact receipt', async (t) => {
  const x = setup(t),
    entry = join(
      root,
      'packages/desktop-runtime/test/fixtures/stdio-entry.mjs'
    ),
    c = create(x.v.spaceId);
  const cli = await processRun(
    [entry, 'cli'],
    JSON.stringify(c),
    x.s,
    x.principal
  );
  assert.equal(cli.exit, 0, cli.err);
  const receipt = ok(JSON.parse(cli.out));
  const messages = [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        clientInfo: { name: 'test', version: '1' },
        capabilities: {},
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'clutter_command', arguments: c },
    },
  ];
  const mcp = await processRun(
    [entry, 'mcp'],
    messages.map(JSON.stringify).join('\n') + '\n',
    x.s,
    x.principal
  );
  assert.equal(mcp.exit, 0, mcp.err);
  const replies = mcp.out.trim().split('\n').map(JSON.parse);
  assert.deepEqual(replies[1].result.tools[0].inputSchema, commandSchema);
  assert.deepEqual(ok(JSON.parse(replies[2].result.content[0].text)), receipt);
  assert.deepEqual(ok(await x.client.execute(c)), receipt);
  assert.equal(ok(await read(x)).sequence, 1);
  const help = await processRun(
    [entry, 'cli', '--help-json'],
    '',
    x.s,
    x.principal
  );
  assert.deepEqual(JSON.parse(help.out).commands, Object.keys(catalogue));
});
test('real process death before/after COMMIT yields old/new complete state, exact retry once', async (t) => {
  for (const phase of ['beforeCommit', 'afterCommit']) {
    const x = await seeded(t),
      c = update(x.v.spaceId, x.head);
    x.v.close();
    const result = await processRun(
      [join(here, 'crash-worker.mjs'), x.v.directory, phase, JSON.stringify(c)],
      ''
    );
    assert.equal(result.signal, 'SIGKILL', result.err);
    const v = SqliteStore.reopenDisposable(x.v.directory),
      s = new SpaceService(v, qualifiedEngine);
    t.after(() => v.close());
    const run = (c) => s.execute(c, x.principal);
    const p = ok(
      await run({
        apiVersion: 1,
        spaceId: v.spaceId,
        method: 'page.read',
        pageId: 'p',
      })
    );
    assert.equal(p.title, phase === 'beforeCommit' ? 'Page' : 'Edited');
    assert.equal(ok(await run(c)).sequence, 2);
    assert.equal(ok(await run(c)).sequence, 2);
  }
});
test('module boundary: Core imports no platform/SQL/DOM code and legacy app is removed', () => {
  function files(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory()
        ? [
            'node_modules',
            'target',
            'dist',
            'out',
            'artifacts',
            'coverage',
            '.git',
          ].includes(d.name)
          ? []
          : files(join(dir, d.name))
        : [join(dir, d.name)]
    );
  }
  const src = join(root, 'packages/core/src');
  const seen = new Set();
  function portable(file) {
    if (seen.has(file)) return;
    seen.add(file);
    assert.ok(file.startsWith(src));
    assert.doesNotMatch(file, /sqlite-vault|stdio|mcp-framing/);
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /from ['"]node:|\bdocument\.|\bwindow\./);
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS
    );
    for (const node of ast.statements)
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const spec = node.moduleSpecifier.text;
        assert.ok(spec.startsWith('.'), spec);
        portable(resolve(dirname(file), spec));
      }
  }
  portable(join(src, 'index.ts'));
  for (const file of files(src).filter((p) => p.endsWith('.ts'))) {
    const s = readFileSync(file, 'utf8');
    assert.equal(s.includes('docs/foundation/experiments'), false);
    if (
      !file.endsWith('sqlite-store.ts') &&
      !file.endsWith('stdio.ts') &&
      !file.endsWith('mcp-framing.ts')
    )
      assert.doesNotMatch(s, /from ['"]node:|\bdocument\.|\bwindow\./, file);
  }
  for (const retired of ['apps/app', 'packages/foundation-runtime']) {
    const directory = join(root, retired);
    if (existsSync(directory))
      assert.equal(
        files(directory).some(
          (p) =>
            /\.(ts|tsx|js|jsx|mjs|mts|rs|swift)$/.test(p) ||
            p.endsWith('/package.json')
        ),
        false
      );
  }
});

test('malformed mutation replies remain unknown and malformed read replies are unavailable', async (t) => {
  const x = await seeded(t);
  for (const value of [
    null,
    { ok: true, value: {} },
    {
      ok: true,
      value: { pageId: 'p', head: x.head, sequence: 2, operationId: 'wrong' },
    },
  ]) {
    const client = new CoreClient(async () => value);
    code(await client.execute(update(x.v.spaceId, x.head)), 'OUTCOME_UNKNOWN');
  }
  const client = new CoreClient(async () => ({
    ok: true,
    value: { ...ok(await read(x)), content: { format: 'other' } },
  }));
  code(
    await client.execute({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      method: 'page.read',
      pageId: 'p',
    }),
    'TRANSPORT_UNAVAILABLE'
  );
});
test('MCP requires initialization and rejects malformed, oversized and truncated frames', async (t) => {
  const x = setup(t),
    entry = join(
      root,
      'packages/desktop-runtime/test/fixtures/stdio-entry.mjs'
    );
  const input = [
    '{bad}',
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    '{',
  ].join('\n');
  const result = await processRun([entry, 'mcp'], input, x.s, x.principal);
  const r = result.out.trim().split('\n').map(JSON.parse);
  assert.deepEqual(
    r.map((v) => v.error.code),
    [-32700, -32000, -32700]
  );
  const large = await processRun(
    [entry, 'mcp'],
    ' '.repeat(1048577),
    x.s,
    x.principal
  );
  assert.equal(large.exit, 1);
  assert.match(large.err, /FRAME_LIMIT/);
});

test('SpaceStore port atomically guards and commits several page roots in one Space sequence', async (t) => {
  let fail = false;
  const x = await seeded(t, {
    beforeCommit: () => {
      if (fail) throw Error('multi failure');
    },
  });
  ok(await x.run(create(x.v.spaceId, { pageId: 'q', operationId: 'q' })));
  const p = x.v.load('p'),
    q = x.v.load('q');
  const changes = [
    {
      root: qualifiedEngine.update(p, {
        ...qualifiedEngine.project(p),
        content: body('initial', 'P new'),
      }),
      expectedHead: p.head,
    },
    {
      root: qualifiedEngine.update(q, {
        ...qualifiedEngine.project(q),
        content: body('initial', 'Q new'),
      }),
      expectedHead: q.head,
    },
  ];
  const command = update(x.v.spaceId, p.head, {
    operationId: 'multi',
    patch: { content: body('initial', 'P new') },
  });
  await assert.rejects(
    x.v.commit(command, [
      changes[0],
      { ...changes[1], expectedHead: '0'.repeat(64) },
    ]),
    /CONFLICT/
  );
  assert.equal(x.v.load('p').head, p.head);
  assert.equal(x.v.load('q').head, q.head);
  fail = true;
  await assert.rejects(x.v.commit(command, changes), /multi failure/);
  assert.equal(x.v.load('p').head, p.head);
  assert.equal(x.v.load('q').head, q.head);
  fail = false;
  const receipt = await x.v.commit(command, changes);
  assert.equal(receipt.sequence, 3);
  assert.deepEqual(Object.keys(receipt.changedHeads), ['p', 'q']);
  assert.equal(x.v.load('p').sequence, 3);
  assert.equal(x.v.load('q').sequence, 3);
  assert.equal(x.v.load('q', 2).head, q.head);
  x.v.close();
  const reopened = SqliteStore.reopenDisposable(x.v.directory);
  t.after(() => reopened.close());
  assert.deepEqual(
    reopened.outcome(command),
    JSON.parse(JSON.stringify(receipt))
  );
  assert.equal(reopened.load('p').head, changes[0].root.head);
  assert.equal(reopened.load('q').head, changes[1].root.head);
});

test('3A one structured write contract rejects scalar titles and old schema; semantic title projection is derived', async (t) => {
  const x = await seeded(t),
    content = body('kept', 'Title ');
  content.value.content[0].content.push(
    { type: 'note_reference', attrs: { pageId: 'another', label: 'Other' } },
    { type: 'date', attrs: { value: '2026-11-17' } },
    {
      type: 'text',
      text: ' link',
      marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
    }
  );
  const accepted = ok(
    await x.run(update(x.v.spaceId, x.head, { patch: { content } }))
  );
  const page = ok(await read(x));
  assert.equal(page.title, 'Title @Other2026-11-17 link');
  code(
    await x.run(
      update(x.v.spaceId, accepted.head, {
        operationId: 'scalar',
        patch: { title: 'duplicate owner' },
      })
    ),
    'INVALID_REQUEST'
  );
  code(
    await x.run({
      ...create(x.v.spaceId, { pageId: 'old', operationId: 'old' }),
      title: 'old',
      body: {
        format: 'clutter.pm-json',
        schemaVersion: 1,
        value: { type: 'doc' },
      },
    }),
    'INVALID_REQUEST'
  );
  for (const [i, mutate] of [
    (c) => (c.value.content[1].attrs.parentId = 'missing'),
    (c) => (c.value.content[1].attrs.indent = -1),
    (c) => (c.value.content[1].attrs.blockId = 'title'),
    (c) => (c.value.content[0].attrs.extra = true),
    (c) =>
      (c.value.content[0].content[0].marks = [
        { type: 'link', attrs: { href: 'javascript:evil()' } },
      ]),
    (c) =>
      c.value.content[0].content.push({
        type: 'unknown',
        text: 'silently discarded',
      }),
    (c) => (c.value.content[0].content[0].text = 'line\nbreak'),
  ].entries()) {
    const bad = structuredClone(content);
    mutate(bad);
    const result = await x.run(
      update(x.v.spaceId, accepted.head, {
        operationId: 'invalid-doc-' + i,
        patch: { content: bad },
      })
    );
    assert.equal(result.ok, false, 'invalid structured document refused');
  }
  assert.equal(ok(await read(x)).head, accepted.head);
});

test('61 heading levels and leaf separator fields validate before any root is committed', async (t) => {
  const x = await seeded(t);
  for (const [i, mutate] of [
    (c) => {
      c.value.content[1].type = 'heading';
      c.value.content[1].attrs.level = 7;
    },
    (c) => {
      c.value.content[1].type = 'heading';
      c.value.content[1].attrs.level = '1';
    },
    (c) => {
      c.value.content[1].type = 'separator';
    },
    (c) => {
      c.value.content[1].attrs.extra = 'unknown';
    },
  ].entries()) {
    const content = body();
    mutate(content);
    const r = await x.run(
      update(x.v.spaceId, x.head, {
        operationId: 'invalid-block-' + i,
        patch: { content },
      })
    );
    assert.equal(r.ok, false);
    assert.equal(ok(await read(x)).head, x.head);
  }
});
