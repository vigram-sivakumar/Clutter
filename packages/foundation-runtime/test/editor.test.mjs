import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import test, { afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import {
  CoreClient,
  SpaceService,
  EditorSession,
  toBase64,
  fromBase64,
} from '../src/index.ts';
import { SqliteVault } from '../src/adapters/sqlite-vault.ts';
import { qualifiedEngine } from '../src/editor/engine.mjs';
const domErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => domErrors.push(e.message));
afterEach(() => {
  assert.deepEqual(
    domErrors.splice(0),
    [],
    'No uncaught DOM event errors allowed'
  );
});
after(() => dom.window.close());
const dom = new JSDOM('<!doctype html><body></body>', {
  pretendToBeVisual: true,
  virtualConsole,
  url: 'https://clutter.test/',
});
for (const name of [
  'window',
  'document',
  'navigator',
  'Node',
  'HTMLElement',
  'MutationObserver',
  'getComputedStyle',
  'DOMParser',
])
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value:
      name === 'getComputedStyle'
        ? dom.window.getComputedStyle.bind(dom.window)
        : dom.window[name],
  });
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(
  dom.window
);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(
  dom.window
);
const { createQualifiedReplica } =
  await import('../src/editor/qualified-replica.mjs');
const { TextSelection } = await import('prosemirror-state');
const Y = await import('yjs');
const { decode } = await import('../src/editor/page-codec.mjs');
const ok = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
};
const code = (r, c) => {
  assert.equal(r.ok, false);
  assert.equal(r.error.code, c);
};
function body(text = 'Alpha beta') {
  return {
    format: 'clutter.i1.pm-json',
    schemaVersion: 1,
    value: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'paragraph-1' },
          content: [{ type: 'text', text }],
        },
      ],
    },
  };
}
function setup(t, hooks = {}) {
  const v = SqliteVault.createDisposable(hooks);
  let ids = 0;
  const state = {
    v,
    s: new SpaceService(v, qualifiedEngine, {
      newGrant: () => `grant-${++ids}`,
    }),
    sessions: [],
    next: () => `id-${++ids}`,
  };
  state.principal = (peer = 'desktop') => ({
    spaceId: v.spaceId,
    peerId: peer,
    scopes: ['read', 'write'],
  });
  state.run = (c, peer) => state.s.execute(c, state.principal(peer));
  state.client = (peer = 'desktop', transport, watch = true) =>
    new CoreClient(
      transport ?? ((c) => state.run(c, peer)),
      watch ? (listener) => state.s.subscribe(listener) : undefined
    );
  state.read = () =>
    state.run({
      apiVersion: 1,
      spaceId: v.spaceId,
      pageId: 'p',
      method: 'page.read',
    });
  state.open = async (contextId, client = state.client(), pageId = 'p') => {
    const a = await EditorSession.open({
      client,
      spaceId: v.spaceId,
      pageId,
      contextId,
      nextId: state.next,
      createReplica: (c, onLocal) =>
        createQualifiedReplica(c, onLocal, state.next, {
          handleScrollToSelection: () => true,
        }),
    });
    state.sessions.push(a);
    return a;
  };
  state.mount = (a) => {
    const target = document.createElement('section');
    document.body.append(target);
    return a.mount(target);
  };
  state.restart = () => {
    state.v.close();
    state.v = SqliteVault.reopenDisposable(v.directory, hooks);
    state.s = new SpaceService(state.v, qualifiedEngine, {
      newGrant: () => `grant-${++ids}`,
    });
  };
  t.after(async () => {
    for (const a of state.sessions) {
      try {
        await a.settle();
        a.destroy();
      } catch {}
    }
    try {
      state.v.close();
    } catch {}
    rmSync(v.directory, { recursive: true, force: true });
    document.body.replaceChildren();
  });
  return state;
}
async function seeded(t, hooks = {}) {
  const x = setup(t, hooks);
  ok(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      method: 'page.create',
      operationId: 'create',
      kind: 'note',
      title: 'Page',
      body: body(),
      properties: {},
    })
  );
  return x;
}
const insert = (view, text, pos = 1) =>
  view.dispatch(view.state.tr.insertText(text, pos));
const text = (view) => view.state.doc.textContent;
const savedText = async (x) =>
  ok(await x.read())
    .body.value.content.map((p) =>
      (p.content ?? []).map((t) => t.text).join('')
    )
    .join('\n');
async function settle(...sessions) {
  for (const a of sessions) await a.settle();
}

test('actual EditorViews: local and foreign edits share one page, undo is context-specific', async (t) => {
  const x = await seeded(t),
    a = await x.open('A'),
    b = await x.open('B'),
    av = x.mount(a),
    bv = x.mount(b);
  insert(av, 'LOCAL ');
  a.stopCapturing();
  ok(await a.save());
  await settle(a, b);
  assert.equal(text(bv), 'LOCAL Alpha beta');
  insert(bv, 'FOREIGN ', 7);
  b.stopCapturing();
  ok(await b.save());
  await settle(a, b);
  assert.equal(a.history(av, 'undo'), true);
  ok(await a.save());
  await settle(a, b);
  assert.equal(text(av), 'FOREIGN Alpha beta');
  assert.equal(text(bv), text(av));
  assert.equal(a.history(av, 'redo'), true);
  ok(await a.save());
  await settle(a, b);
  assert.equal(text(bv), 'LOCAL FOREIGN Alpha beta');
  assert.equal(await savedText(x), text(av));
});
test('destroying a view preserves context history and other view selections', async (t) => {
  const x = await seeded(t),
    a = await x.open('A'),
    b = await x.open('B'),
    av = x.mount(a),
    bv = x.mount(b);
  bv.dispatch(bv.state.tr.setSelection(TextSelection.create(bv.state.doc, 8)));
  insert(av, 'LOCAL ');
  a.stopCapturing();
  ok(await a.save());
  await settle(a, b);
  assert.equal(bv.state.selection.head, 14);
  av.destroy();
  const remounted = x.mount(a);
  assert.equal(a.history(remounted, 'undo'), true);
  ok(await a.save());
  await settle(a, b);
  assert.equal(text(bv), 'Alpha beta');
  assert.equal(bv.state.selection.head, 8);
});
test('missed notifications reconcile on resume using the authoritative root', async (t) => {
  const x = await seeded(t),
    a = await x.open('A'),
    b = await x.open('B', x.client('desktop', undefined, false)),
    av = x.mount(a),
    bv = x.mount(b);
  insert(av, 'NEW ');
  ok(await a.save());
  await a.settle();
  assert.equal(text(bv), 'Alpha beta');
  ok(await b.sync());
  assert.equal(text(bv), 'NEW Alpha beta');
});

test('lost reply retains exact request while newer typing stays pending', async (t) => {
  const x = await seeded(t);
  let lose = true;
  const commands = [];
  const client = x.client('desktop', async (c) => {
    commands.push(structuredClone(c));
    const r = await x.run(c);
    if (c.method === 'editor.apply' && lose) {
      lose = false;
      throw Error('lost reply');
    }
    return r;
  });
  const a = await x.open('A', client),
    av = x.mount(a);
  insert(av, 'FIRST ');
  code(await a.save(), 'OUTCOME_UNKNOWN');
  const pending = a.pendingCommand;
  insert(av, 'SECOND ', 7);
  ok(await a.save());
  assert.equal(a.dirty, true);
  assert.deepEqual(
    commands.filter((c) => c.method === 'editor.apply').slice(0, 2),
    [pending, pending]
  );
  ok(await a.save());
  await a.settle();
  assert.equal(await savedText(x), 'FIRST SECOND Alpha beta');
  assert.equal(a.dirty, false);
});
test('typing during an in-flight save survives acknowledgement', async (t) => {
  const x = await seeded(t);
  let release, entered;
  const enteredPromise = new Promise((r) => (entered = r));
  let pause = true;
  const a = await x.open(
      'A',
      x.client('desktop', async (c) => {
        const r = await x.run(c);
        if (c.method === 'editor.apply' && pause) {
          pause = false;
          entered();
          await new Promise((r) => (release = r));
        }
        return r;
      })
    ),
    av = x.mount(a);
  insert(av, 'FIRST ');
  const saving = a.save();
  await enteredPromise;
  insert(av, 'SECOND ', 7);
  assert.equal(a.canClose, false);
  release();
  ok(await saving);
  assert.equal(a.dirty, true);
  ok(await a.save());
  await a.settle();
  assert.equal(await savedText(x), 'FIRST SECOND Alpha beta');
});
test('failed saves remain provisional; protected close and restart restore the exact pending work', async (t) => {
  let failSaves = true;
  const x = await seeded(t, {
    beforeCommit: (c) => {
      if (failSaves && c.method === 'editor.apply') throw Error('save failed');
    },
  });
  const a = await x.open('A'),
    av = x.mount(a);
  insert(av, 'PROTECTED ');
  code(await a.save(), 'INTERNAL_ERROR');
  const pending = a.pendingCommand;
  assert.equal(await savedText(x), 'Alpha beta');
  assert.equal(a.canClose, false);
  assert.equal(await a.prepareClose(), true);
  assert.equal(await savedText(x), 'Alpha beta');
  a.destroy();
  x.restart();
  failSaves = false;
  const recovered = await x.open('A'),
    rv = x.mount(recovered);
  assert.equal(text(rv), 'Alpha beta');
  ok(await recovered.recover());
  assert.equal(text(rv), 'PROTECTED Alpha beta');
  assert.deepEqual(recovered.pendingCommand, pending);
  assert.equal(recovered.historyBoundary, 'PROTECTED_RECOVERY');
  await recovered.flush();
  await recovered.settle();
  assert.equal(await savedText(x), 'PROTECTED Alpha beta');
  assert.equal(recovered.dirty, false);
});
test('failed protection refuses context close and leaves the view editable', async (t) => {
  let fail = true;
  const x = await seeded(t, {
    beforeCommit: (c) => {
      if (
        fail &&
        (c.method === 'editor.apply' || c.method === 'editor.protect')
      )
        throw Error('disk failure');
    },
  });
  const a = await x.open('A'),
    av = x.mount(a);
  insert(av, 'UNSAVED ');
  assert.equal(await a.prepareClose(), false);
  assert.equal(a.canClose, false);
  assert.throws(() => a.destroy(), /UNPROTECTED_CHANGES/);
  insert(av, 'MORE ', 9);
  assert.match(text(av), /MORE/);
  assert.equal(await savedText(x), 'Alpha beta');
  fail = false;
  assert.equal(await a.prepareClose(), true);
});
test('new typing after a protection acknowledgement requires a new protection generation', async (t) => {
  let fail = true;
  const x = await seeded(t, {
    beforeCommit: (c) => {
      if (fail && c.method === 'editor.apply') throw Error('save failure');
    },
  });
  const a = await x.open('A'),
    av = x.mount(a);
  insert(av, 'ONE ');
  ok(await a.protect());
  assert.equal(a.canClose, true);
  insert(av, 'TWO ', 5);
  assert.equal(a.canClose, false);
  const p = ok(await a.protect());
  assert.equal(a.canClose, true);
  a.destroy();
  x.restart();
  const restored = await x.open('A'),
    rv = x.mount(restored);
  ok(await restored.recover());
  assert.equal(text(rv), 'ONE TWO Alpha beta');
  assert.equal(
    ok(
      await x.run({
        apiVersion: 1,
        spaceId: x.v.spaceId,
        pageId: 'p',
        contextId: 'A',
        method: 'editor.recovery',
      })
    ).generation,
    p.protection.generation
  );
  fail = false;
  await restored.flush();
  await restored.settle();
});
test('service restart clears interactive undo explicitly but keeps saved content and a live view', async (t) => {
  const x = await seeded(t),
    a = await x.open('A'),
    av = x.mount(a);
  insert(av, 'SAVED ');
  a.stopCapturing();
  ok(await a.save());
  await a.settle();
  x.restart();
  ok(await a.sync());
  assert.equal(a.historyBoundary, 'SERVICE_RESTART');
  assert.equal(a.history(av, 'undo'), false);
  assert.equal(text(av), 'SAVED Alpha beta');
  insert(av, 'AFTER ');
  await a.flush();
  await a.settle();
  assert.equal(await savedText(x), 'AFTER SAVED Alpha beta');
});
test('context grants and private outcomes/protection are bound to the trusted peer', async (t) => {
  const x = await seeded(t),
    a = await x.open('A'),
    av = x.mount(a);
  insert(av, 'PRIVATE ');
  ok(await a.protect());
  code(
    await x.run(
      {
        apiVersion: 1,
        spaceId: x.v.spaceId,
        pageId: 'p',
        contextId: 'A',
        method: 'editor.open',
      },
      'other'
    ),
    'CONTEXT_ALREADY_BOUND'
  );
  code(
    await x.run(
      {
        apiVersion: 1,
        spaceId: x.v.spaceId,
        pageId: 'p',
        contextId: 'A',
        method: 'editor.recovery',
      },
      'other'
    ),
    'NOT_FOUND'
  );
  let lose = true;
  const b = await x.open(
      'B',
      x.client('desktop', async (c) => {
        const r = await x.run(c);
        if (c.method === 'editor.apply' && lose) {
          lose = false;
          throw Error('lost');
        }
        return r;
      })
    ),
    bv = x.mount(b);
  insert(bv, 'B ');
  code(await b.save(), 'OUTCOME_UNKNOWN');
  const command = b.pendingCommand;
  code(await x.run(command, 'other'), 'OPERATION_NOT_OWNED');
  code(
    await x.run({ ...command, operationId: x.next() }, 'other'),
    'CONTEXT_GRANT_REQUIRED'
  );
  ok(await b.save());
  await settle(a, b);
  await a.flush();
  await a.settle();
});
test('raw updates cannot change title/properties/links or introduce unknown nodes', async (t) => {
  const x = await seeded(t);
  const opened = ok(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      contextId: 'attack',
      method: 'editor.open',
    })
  );
  for (const [i, mutate] of [
    (d) => d.getMap('page').set('title', 'evil'),
    (d) =>
      d
        .getMap('page')
        .get('properties')
        .set('secret', { type: 'text', value: 'evil' }),
    (d) => d.getMap('links').set('ref', 'evil'),
    (d) =>
      d
        .getMap('page')
        .get('body')
        .insert(0, [new Y.XmlElement('unknown')]),
  ].entries()) {
    const d = decode({
        pageId: 'p',
        kind: 'notes',
        bytes: fromBase64(opened.payload),
        hash: opened.head,
      }),
      vector = Y.encodeStateVector(d);
    mutate(d);
    const update = toBase64(Y.encodeStateAsUpdate(d, vector));
    d.destroy();
    const r = await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      contextId: 'attack',
      grant: opened.grant,
      baseHead: opened.head,
      operationId: 'bad-' + i,
      method: 'editor.apply',
      generation: 1,
      update,
    });
    assert.equal(r.ok, false);
    assert.equal(ok(await x.read()).head, opened.head);
  }
});
test('malformed binary, unknown base and dangling Y dependencies refuse without replacing a root', async (t) => {
  const x = await seeded(t),
    opened = ok(
      await x.run({
        apiVersion: 1,
        spaceId: x.v.spaceId,
        pageId: 'p',
        contextId: 'A',
        method: 'editor.open',
      })
    );
  const c = {
    apiVersion: 1,
    spaceId: x.v.spaceId,
    pageId: 'p',
    contextId: 'A',
    grant: opened.grant,
    baseHead: opened.head,
    operationId: 'bad',
    method: 'editor.apply',
    generation: 1,
    update: 'AAAA',
  };
  code(await x.run({ ...c, update: '!' }), 'INVALID_REQUEST');
  code(await x.run({ ...c, baseHead: '0'.repeat(64) }), 'UNKNOWN_BASE');
  assert.equal((await x.run(c)).ok, false);
  const d = new Y.Doc(),
    f = d.getXmlFragment('elsewhere'),
    node = new Y.XmlElement('paragraph');
  f.insert(0, [node]);
  const vector = Y.encodeStateVector(d);
  node.insert(0, [new Y.XmlText('missing dependency')]);
  const update = toBase64(Y.encodeStateAsUpdate(d, vector));
  d.destroy();
  code(await x.run({ ...c, update }), 'INCOMPLETE_UPDATE');
  assert.equal(ok(await x.read()).head, opened.head);
});
test('semantic CLI-style writes and task pages use the same Core and editor route', async (t) => {
  const x = await seeded(t),
    a = await x.open('A'),
    av = x.mount(a),
    snapshot = ok(await x.read());
  ok(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      method: 'page.update',
      operationId: 'automation',
      expectedHead: snapshot.head,
      patch: { body: body('From automation') },
    })
  );
  await a.settle();
  assert.equal(text(av), 'From automation');
  assert.equal(a.history(av, 'undo'), false);
  ok(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'task',
      method: 'page.create',
      operationId: 'task',
      kind: 'task',
      title: 'Task page',
      body: body('Task body'),
      properties: { Due: { type: 'date', value: '2026-11-16' } },
    })
  );
  const task = await x.open('Task', x.client(), 'task'),
    tv = x.mount(task);
  insert(tv, 'Written inside ');
  await task.flush();
  await task.settle();
  const read = ok(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'task',
      method: 'page.read',
    })
  );
  assert.equal(read.kind, 'task');
  assert.equal(read.properties.Due.value, '2026-11-16');
  assert.equal(
    read.body.value.content[0].content[0].text,
    'Written inside Task body'
  );
});
test('keyboard Enter creates stable paragraph identities through the actual binding', async (t) => {
  const x = await seeded(t),
    a = await x.open('A'),
    av = x.mount(a);
  av.focus();
  av.dispatch(av.state.tr.setSelection(TextSelection.create(av.state.doc, 6)));
  const event = new dom.window.KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    bubbles: true,
    cancelable: true,
  });
  av.dom.dispatchEvent(event);
  assert.equal(av.state.doc.childCount, 2);
  const ids = [];
  av.state.doc.forEach((n) => ids.push(n.attrs.blockId));
  assert.equal(new Set(ids).size, 2);
  assert.ok(ids.every(Boolean));
  await a.flush();
  await a.settle();
  assert.equal(ok(await x.read()).body.value.content.length, 2);
  a.stopCapturing();
  assert.equal(a.history(av, 'undo'), true);
  assert.equal(av.state.doc.childCount, 1);
  assert.equal(text(av), 'Alpha beta');
  await a.flush();
  await a.settle();
  assert.equal(a.history(av, 'redo'), true);
  assert.equal(av.state.doc.childCount, 2);
  await a.flush();
  await a.settle();
});

test('a lost protection reply retries exactly; later typing remains unprotected', async (t) => {
  const x = await seeded(t);
  let lose = true;
  const sent = [];
  const a = await x.open(
      'A',
      x.client('desktop', async (c) => {
        if (c.method === 'editor.protect') sent.push(structuredClone(c));
        const r = await x.run(c);
        if (c.method === 'editor.protect' && lose) {
          lose = false;
          throw Error('lost protect reply');
        }
        return r;
      })
    ),
    av = x.mount(a);
  insert(av, 'ONE ');
  code(await a.protect(), 'OUTCOME_UNKNOWN');
  assert.equal(a.canClose, false);
  insert(av, 'TWO ', 5);
  ok(await a.protect());
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(a.canClose, false);
  ok(await a.protect());
  assert.equal(a.canClose, true);
  await a.flush();
  await a.settle();
});
test('typing while protection is in flight prevents an unsafe close', async (t) => {
  const x = await seeded(t);
  let entered, release;
  const waiting = new Promise((r) => (entered = r));
  let pause = true;
  const a = await x.open(
      'A',
      x.client('desktop', async (c) => {
        const r = await x.run(c);
        if (c.method === 'editor.protect' && pause) {
          pause = false;
          entered();
          await new Promise((r) => (release = r));
        }
        return r;
      })
    ),
    av = x.mount(a);
  insert(av, 'ONE ');
  const protecting = a.protect();
  await waiting;
  insert(av, 'TWO ', 5);
  assert.equal(a.canClose, false);
  release();
  ok(await protecting);
  assert.equal(a.canClose, false);
  ok(await a.protect());
  assert.equal(a.canClose, true);
  await a.flush();
  await a.settle();
});
test('protection refuses pending work absent from its staged snapshot', async (t) => {
  const x = await seeded(t),
    opened = ok(
      await x.run({
        apiVersion: 1,
        spaceId: x.v.spaceId,
        pageId: 'p',
        contextId: 'A',
        method: 'editor.open',
      })
    );
  const d = decode({
      pageId: 'p',
      kind: 'notes',
      bytes: fromBase64(opened.payload),
      hash: opened.head,
    }),
    vector = Y.encodeStateVector(d);
  d.getMap('page')
    .get('body')
    .toArray()[0]
    .toArray()[0]
    .insert(0, 'NOT PROTECTED ');
  const update = toBase64(Y.encodeStateAsUpdate(d, vector));
  d.destroy();
  const pending = {
    apiVersion: 1,
    spaceId: x.v.spaceId,
    pageId: 'p',
    contextId: 'A',
    method: 'editor.apply',
    grant: opened.grant,
    baseHead: opened.head,
    operationId: 'pending',
    generation: 1,
    update,
  };
  code(
    await x.run({
      ...pending,
      method: 'editor.protect',
      operationId: 'protection',
      update: 'AAA=',
      pending,
    }),
    'PENDING_NOT_PROTECTED'
  );
  code(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      contextId: 'A',
      method: 'editor.recovery',
    }),
    'NOT_FOUND'
  );
});
test('schema1 temporary stores are refused without automatic migration or overwrite', async (t) => {
  const x = await seeded(t);
  x.v.close();
  const file = join(x.v.directory, 'space.sqlite'),
    db = new DatabaseSync(file);
  db.exec('PRAGMA user_version=1');
  db.close();
  const before = readFileSync(file);
  assert.throws(
    () => SqliteVault.reopenDisposable(x.v.directory),
    /UNSUPPORTED_STORE/
  );
  assert.deepEqual(readFileSync(file), before);
});
async function stdio(x, mode, input) {
  const entry = fileURLToPath(
      new URL(
        '../../../docs/foundation/i1/stdio-dev-entry.mjs',
        import.meta.url
      )
    ),
    p = spawn(process.execPath, [entry, mode], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });
  let out = '',
    err = '';
  const timer = setTimeout(() => p.kill('SIGKILL'), 10000);
  timer.unref();
  p.stdout.on('data', (c) => (out += c));
  p.stderr.on('data', (c) => (err += c));
  p.on('message', async (m) =>
    p.send({ id: m.id, reply: await x.run(m.command, 'automation') })
  );
  p.stdin.end(input);
  const [exit] = await once(p, 'exit');
  clearTimeout(timer);
  assert.equal(exit, 0, err);
  return out.trim().split('\n').map(JSON.parse);
}
test('real CLI/MCP processes update a mounted view and read back UI edits', async (t) => {
  const x = await seeded(t),
    a = await x.open('A'),
    av = x.mount(a);
  const command = () => ({
    apiVersion: 1,
    spaceId: x.v.spaceId,
    pageId: 'p',
    method: 'page.update',
    operationId: x.next(),
    expectedHead: x.v.load('p').head,
    patch: { body: body('CLI') },
  });
  ok((await stdio(x, 'cli', JSON.stringify(command())))[0]);
  await a.settle();
  assert.equal(text(av), 'CLI');
  const c = { ...command(), patch: { body: body('MCP') } },
    messages = [
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
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'clutter_command', arguments: c },
      },
    ];
  const replies = await stdio(
    x,
    'mcp',
    messages.map(JSON.stringify).join('\n') + '\n'
  );
  ok(JSON.parse(replies.at(-1).result.content[0].text));
  await a.settle();
  assert.equal(text(av), 'MCP');
  assert.equal(a.history(av, 'undo'), false);
  insert(av, 'UI ');
  await a.flush();
  await a.settle();
  const page = ok(
    (
      await stdio(
        x,
        'cli',
        JSON.stringify({
          apiVersion: 1,
          spaceId: x.v.spaceId,
          pageId: 'p',
          method: 'page.read',
        })
      )
    )[0]
  );
  assert.equal(page.body.value.content[0].content[0].text, 'UI MCP');
});
for (const method of ['editor.apply', 'editor.protect'])
  test(`real process death: ${method} is old-or-new with exact durable replay`, async (t) => {
    for (const phase of ['beforeCommit', 'afterCommit']) {
      const x = await seeded(t),
        opened = ok(
          await x.run({
            apiVersion: 1,
            spaceId: x.v.spaceId,
            pageId: 'p',
            contextId: 'crash',
            method: 'editor.open',
          })
        ),
        d = decode({
          pageId: 'p',
          kind: 'notes',
          bytes: fromBase64(opened.payload),
          hash: opened.head,
        }),
        vector = Y.encodeStateVector(d);
      d.getMap('page')
        .get('body')
        .toArray()[0]
        .toArray()[0]
        .insert(0, 'CRASH ');
      const update = toBase64(Y.encodeStateAsUpdate(d, vector));
      d.destroy();
      const c = {
        apiVersion: 1,
        spaceId: x.v.spaceId,
        pageId: 'p',
        contextId: 'crash',
        method,
        operationId: 'crash-op',
        grant: 'placeholder',
        generation: 1,
        baseHead: opened.head,
        update,
      };
      x.v.close();
      const p = spawn(
        process.execPath,
        [
          fileURLToPath(new URL('./editor-crash-worker.mjs', import.meta.url)),
          x.v.directory,
          phase,
          JSON.stringify(c),
        ],
        { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
      );
      let actual,
        err = '';
      p.on('message', (m) => (actual = m.command));
      p.stderr.on('data', (c) => (err += c));
      const [exit, signal] = await once(p, 'exit');
      assert.equal(signal, 'SIGKILL', String(exit) + err);
      assert.ok(actual);
      x.v = SqliteVault.reopenDisposable(x.v.directory);
      x.s = new SpaceService(x.v, qualifiedEngine, { newGrant: x.next });
      const expected =
        method === 'editor.apply' && phase === 'afterCommit'
          ? 'CRASH Alpha beta'
          : 'Alpha beta';
      assert.equal(await savedText(x), expected);
      if (phase === 'afterCommit') {
        const receipt = ok(await x.run(actual));
        assert.deepEqual(ok(await x.run(actual)), receipt);
        assert.equal(receipt.sequence, 2);
        if (method === 'editor.protect') {
          const restored = await x.open('crash'),
            view = x.mount(restored);
          ok(await restored.recover());
          assert.equal(text(view), 'CRASH Alpha beta');
          await restored.flush();
          await restored.settle();
        }
      } else {
        code(await x.run(actual), 'CONTEXT_GRANT_REQUIRED');
        const grant = ok(
          await x.run({
            apiVersion: 1,
            spaceId: x.v.spaceId,
            pageId: 'p',
            contextId: 'crash',
            method: 'editor.open',
          })
        );
        assert.equal(
          ok(
            await x.run({
              ...actual,
              operationId: 'known-uncommitted-retry',
              grant: grant.grant,
            })
          ).sequence,
          2
        );
      }
    }
  });

test('a foreign paragraph replacement cannot silently consume unsaved local text', async (t) => {
  const x = await seeded(t),
    a = await x.open('A', x.client('desktop', undefined, false)),
    av = x.mount(a);
  insert(av, 'UNSAVED ');
  const before = ok(await x.read()),
    replacement = body('FOREIGN');
  replacement.value.content[0].attrs.blockId = 'replacement';
  ok(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      method: 'page.update',
      operationId: 'replace',
      expectedHead: before.head,
      patch: { body: replacement },
    })
  );
  await assert.rejects(a.sync(), /EDITOR_REBASE_CONFLICT/);
  assert.equal(text(av), 'UNSAVED Alpha beta');
  assert.equal(a.dirty, true);
  ok(await a.protect());
  assert.equal(a.canClose, true);
  a.destroy();
  const recovered = await x.open('A'),
    rv = x.mount(recovered);
  await assert.rejects(recovered.recover(), /RECOVERY_CONFLICT/);
  assert.equal(text(rv), 'FOREIGN');
  assert.equal(
    (
      await x.run({
        apiVersion: 1,
        spaceId: x.v.spaceId,
        pageId: 'p',
        contextId: 'A',
        method: 'editor.recovery',
      })
    ).ok,
    true
  );
});
test('undo after a foreign edit in a newly split paragraph preserves the foreign text', async (t) => {
  const x = await seeded(t),
    a = await x.open('A'),
    b = await x.open('B'),
    av = x.mount(a),
    bv = x.mount(b);
  av.dispatch(av.state.tr.setSelection(TextSelection.create(av.state.doc, 6)));
  av.dom.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    })
  );
  a.stopCapturing();
  await a.flush();
  await settle(a, b);
  const pos = bv.state.doc.firstChild.nodeSize + 1;
  insert(bv, 'FOREIGN ', pos);
  await b.flush();
  await settle(a, b);
  a.history(av, 'undo');
  assert.match(text(av), /FOREIGN/);
  if (a.dirty) await a.flush();
  await settle(a, b);
  assert.match(await savedText(x), /FOREIGN/);
});

test('live editor saves and undo preserve media introduced through real CLI/MCP clients', async (t) => {
  const x = await seeded(t),
    a = await x.open('A'),
    av = x.mount(a),
    bytes = readFileSync(
      new URL(
        '../../../docs/foundation/experiments/r07-two-view/media/fixtures/tiny.png',
        import.meta.url
      )
    );
  const command = {
    apiVersion: 1,
    spaceId: x.v.spaceId,
    pageId: 'p',
    method: 'media.import',
    operationId: x.next(),
    expectedHead: x.v.load('p').head,
    attachmentId: 'image',
    name: 'image.png',
    role: 'body',
    mime: 'image/png',
    payload: toBase64(bytes),
  };
  ok((await stdio(x, 'cli', JSON.stringify(command)))[0]);
  await a.settle();
  insert(av, 'LOCAL ');
  a.stopCapturing();
  await a.flush();
  await a.settle();
  assert.equal(a.history(av, 'undo'), true);
  await a.flush();
  await a.settle();
  const media = ok(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      method: 'media.list',
    })
  );
  assert.equal(media.assets.image.mime, 'image/png');
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
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'clutter_command',
        arguments: {
          apiVersion: 1,
          spaceId: x.v.spaceId,
          pageId: 'p',
          method: 'media.read',
          attachmentId: 'image',
        },
      },
    },
  ];
  const replies = await stdio(
    x,
    'mcp',
    messages.map(JSON.stringify).join('\n') + '\n'
  );
  const file = ok(JSON.parse(replies.at(-1).result.content[0].text));
  assert.deepEqual(Buffer.from(fromBase64(file.payload)), bytes);
});
test('protected editor drafts retain transitive media after current removal and restart', async (t) => {
  const x = await seeded(t),
    bytes = readFileSync(
      new URL(
        '../../../docs/foundation/experiments/r07-two-view/media/fixtures/tiny.png',
        import.meta.url
      )
    );
  const imported = ok(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      method: 'media.import',
      operationId: x.next(),
      expectedHead: x.v.load('p').head,
      attachmentId: 'image',
      name: 'image.png',
      role: 'body',
      mime: 'image/png',
      payload: toBase64(bytes),
    })
  );
  const a = await x.open('A'),
    av = x.mount(a);
  insert(av, 'PROTECTED ');
  ok(await a.protect());
  a.destroy();
  ok(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      method: 'media.remove',
      operationId: x.next(),
      expectedHead: x.v.load('p').head,
      attachmentId: 'image',
    })
  );
  x.restart();
  const saved = x.v.recovery('p', 'A', 'desktop');
  assert.ok(saved);
  const links = x.v.assetLinks(saved.root);
  assert.ok(links.image);
  assert.deepEqual(Buffer.from(x.v.readAsset(links.image.hash)), bytes);
  assert.deepEqual(
    Buffer.from(
      fromBase64(
        ok(
          await x.run({
            apiVersion: 1,
            spaceId: x.v.spaceId,
            pageId: 'p',
            method: 'media.read',
            attachmentId: 'image',
            atSequence: imported.sequence,
          })
        ).payload
      )
    ),
    bytes
  );
  const recovered = await x.open('A'),
    rv = x.mount(recovered);
  await assert.rejects(recovered.recover(), /RECOVERY_CONFLICT/);
  assert.equal(text(rv), 'Alpha beta');
});

test('clearing a note remains saveable/protectable through the real view binding', async (t) => {
  const x = await seeded(t),
    a = await x.open('A'),
    av = x.mount(a);
  av.dispatch(av.state.tr.delete(0, av.state.doc.content.size));
  await a.flush();
  await a.settle();
  const p = ok(await x.read());
  assert.equal(p.body.value.type, 'doc');
  assert.equal(av.state.doc.textContent, '');
  assert.equal(a.dirty, false);
  assert.equal(a.canClose, true);
});

test('toolbar history maps the current caret/range instead of jumping to the edit bookmark', async (t) => {
  const x = await seeded(t),
    a = await x.open('A'),
    av = x.mount(a);
  insert(av, 'LOCAL ');
  a.stopCapturing();
  const end = av.state.doc.content.size - 1;
  av.dispatch(
    av.state.tr.setSelection(TextSelection.create(av.state.doc, end))
  );
  assert.equal(a.history(av, 'undo', { preserveSelection: true }), true);
  assert.equal(text(av), 'Alpha beta');
  assert.equal(av.state.selection.head, end - 6);
  assert.equal(a.history(av, 'redo', { preserveSelection: true }), true);
  assert.equal(av.state.selection.head, end);
  // Backward ranges stay backward and anchored to the same surviving characters.
  av.dispatch(
    av.state.tr.setSelection(TextSelection.create(av.state.doc, end, end - 4))
  );
  assert.equal(a.history(av, 'undo', { preserveSelection: true }), true);
  assert.equal(av.state.selection.anchor, end - 6);
  assert.equal(av.state.selection.head, end - 10);
  assert.equal(a.history(av, 'redo', { preserveSelection: true }), true);
  assert.equal(av.state.selection.anchor, end);
  assert.equal(av.state.selection.head, end - 4);
});

test('registry keeps actual editor context/history when all views detach and later remount', async (t) => {
  const { EditingContextRegistry } = await import('../src/index.ts');
  const x = await seeded(t);
  let opens = 0;
  const registry = new EditingContextRegistry(async (scope) => {
    opens++;
    return x.open(scope.contextId, x.client(), scope.pageId);
  });
  const scope = { spaceId: x.v.spaceId, pageId: 'p', contextId: 'A' };
  const [one, two] = await Promise.all([
    registry.acquire(scope),
    registry.acquire(scope),
  ]);
  assert.equal(one.session, two.session);
  const a = x.mount(one.session),
    b = x.mount(two.session);
  insert(a, 'RETAINED ');
  one.session.stopCapturing();
  await one.session.flush();
  await one.session.settle();
  assert.equal(text(b), 'RETAINED Alpha beta');
  a.destroy();
  one.release();
  await assert.rejects(registry.close(scope), /CONTEXT_IN_USE/);
  b.destroy();
  two.release();
  const again = await registry.acquire(scope),
    remounted = x.mount(again.session);
  assert.equal(opens, 1);
  assert.equal(text(remounted), 'RETAINED Alpha beta');
  assert.equal(again.session.history(remounted, 'undo'), true);
  assert.equal(text(remounted), 'Alpha beta');
  assert.equal(again.session.history(remounted, 'redo'), true);
  remounted.destroy();
  again.release();
  assert.equal(await registry.close(scope), true);
  x.sessions = x.sessions.filter((s) => s !== again.session);
});

test('registry retains real pending editor work when both save and protection fail', async (t) => {
  const { EditingContextRegistry } = await import('../src/index.ts');
  let fail = true;
  const x = await seeded(t, {
    beforeCommit: (c) => {
      if (fail && ['editor.apply', 'editor.protect'].includes(c.method))
        throw Error('disk failure');
    },
  });
  const scope = { spaceId: x.v.spaceId, pageId: 'p', contextId: 'A' };
  let opens = 0;
  const registry = new EditingContextRegistry(async (s) => {
    opens++;
    return x.open(s.contextId);
  });
  const lease = await registry.acquire(scope),
    view = x.mount(lease.session);
  insert(view, 'UNSAVED ');
  view.destroy();
  lease.release();
  assert.equal(await registry.close(scope), false);
  const pending = lease.session.pendingCommand;
  const again = await registry.acquire(scope),
    remounted = x.mount(again.session);
  assert.equal(opens, 1);
  assert.equal(again.session, lease.session);
  assert.equal(text(remounted), 'UNSAVED Alpha beta');
  assert.deepEqual(again.session.pendingCommand, pending);
  assert.equal(await savedText(x), 'Alpha beta');
  fail = false;
  await again.session.flush();
  await again.session.settle();
  assert.equal(await savedText(x), 'UNSAVED Alpha beta');
  remounted.destroy();
  again.release();
  assert.equal(await registry.close(scope), true);
  x.sessions = x.sessions.filter((s) => s !== again.session);
});

test('view-local selection bookmark maps foreign edits while detached and refuses another context', async (t) => {
  const x = await seeded(t),
    a = await x.open('selection_a'),
    b = await x.open('selection_b');
  const av = x.mount(a),
    bv = x.mount(b);
  av.dispatch(av.state.tr.setSelection(TextSelection.create(av.state.doc, 6)));
  const bookmark = a.captureSelection(av);
  av.destroy();
  insert(bv, 'FOREIGN ', 1);
  ok(await b.save());
  await settle(a, b);
  const reopened = x.mount(a);
  assert.equal(a.restoreSelection(reopened, bookmark), true);
  assert.equal(reopened.state.selection.anchor, 14);
  assert.throws(() => b.restoreSelection(bv, bookmark), /WRONG_CONTEXT_VIEW/);
});
