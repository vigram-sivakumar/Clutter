import { pageContent } from '../../editor/src/schema.mjs';
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
} from '../../core/src/index.ts';
import { SqliteStore } from '../src/sqlite-store.ts';
import { qualifiedEngine } from '../../editor/src/engine.mjs';
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
  await import('../../editor/src/qualified-replica.mjs');
const { TextSelection, NodeSelection } = await import('prosemirror-state');
const Y = await import('yjs');
const { decode } = await import('../../editor/src/page-codec.mjs');
const ok = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
};
const code = (r, c) => {
  assert.equal(r.ok, false);
  assert.equal(r.error.code, c);
};
function body(text = 'Alpha beta') {
  return pageContent('', text, { title: 'title', body: 'paragraph-1' });
}
function setup(t, hooks = {}) {
  const v = SqliteStore.createDisposable(hooks);
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
    state.v = SqliteStore.reopenDisposable(v.directory, hooks);
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
async function seeded(t, hooks = {}, initialBody) {
  const x = setup(t, hooks);
  ok(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      method: 'page.create',
      operationId: 'create',
      kind: 'note',
      content: body(initialBody),
      properties: {},
    })
  );
  return x;
}
const insert = (view, text, pos = 1) =>
  view.dispatch(view.state.tr.insertText(text, pos + 2));
const text = (view) =>
  Array.from(
    { length: view.state.doc.childCount - 1 },
    (_, i) => view.state.doc.child(i + 1).textContent
  ).join('');
const savedText = async (x) =>
  ok(await x.read())
    .content.value.content.slice(1)
    .map((p) => (p.content ?? []).map((t) => t.text).join(''))
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
  bv.dispatch(bv.state.tr.setSelection(TextSelection.create(bv.state.doc, 10)));
  insert(av, 'LOCAL ');
  a.stopCapturing();
  ok(await a.save());
  await settle(a, b);
  assert.equal(bv.state.selection.head, 16);
  av.destroy();
  const remounted = x.mount(a);
  assert.equal(a.history(remounted, 'undo'), true);
  ok(await a.save());
  await settle(a, b);
  assert.equal(text(bv), 'Alpha beta');
  assert.equal(bv.state.selection.head, 10);
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
  av.dispatch(av.state.tr.insertText('Protected title', 1));
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
  assert.equal(rv.state.doc.firstChild.textContent, 'Protected title');
  assert.deepEqual(recovered.pendingCommand, pending);
  assert.equal(recovered.historyBoundary, 'PROTECTED_RECOVERY');
  await recovered.flush();
  await recovered.settle();
  assert.equal(await savedText(x), 'PROTECTED Alpha beta');
  assert.equal(recovered.dirty, false);
  assert.equal(ok(await x.read()).title, 'Protected title');
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
test('raw updates cannot add scalar-title metadata, alter properties/links or introduce unknown nodes', async (t) => {
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
        .get('content')
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
      patch: { content: body('From automation') },
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
      content: body('Task body'),
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
    read.content.value.content[1].content[0].text,
    'Written inside Task body'
  );
});
test('keyboard Enter creates stable paragraph identities through the actual binding', async (t) => {
  const x = await seeded(t),
    a = await x.open('A'),
    av = x.mount(a);
  av.focus();
  av.dispatch(av.state.tr.setSelection(TextSelection.create(av.state.doc, 8)));
  const event = new dom.window.KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    bubbles: true,
    cancelable: true,
  });
  av.dom.dispatchEvent(event);
  assert.equal(av.state.doc.childCount, 3);
  const ids = [];
  av.state.doc.forEach((n) => ids.push(n.attrs.blockId));
  assert.equal(new Set(ids).size, 3);
  assert.ok(ids.every(Boolean));
  await a.flush();
  await a.settle();
  assert.equal(ok(await x.read()).content.value.content.length, 3);
  a.stopCapturing();
  assert.equal(a.history(av, 'undo'), true);
  assert.equal(av.state.doc.childCount, 2);
  assert.equal(text(av), 'Alpha beta');
  await a.flush();
  await a.settle();
  assert.equal(a.history(av, 'redo'), true);
  assert.equal(av.state.doc.childCount, 3);
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
    .get('content')
    .toArray()[1]
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
    () => SqliteStore.reopenDisposable(x.v.directory),
    /UNSUPPORTED_STORE/
  );
  assert.deepEqual(readFileSync(file), before);
});
async function stdio(x, mode, input, expectedExit = 0) {
  const entry = fileURLToPath(
      new URL('./fixtures/stdio-entry.mjs', import.meta.url)
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
  assert.equal(exit, expectedExit, err);
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
    patch: {
      content: pageContent('CLI title', 'CLI', {
        title: 'title',
        body: 'paragraph-1',
      }),
    },
  });
  ok((await stdio(x, 'cli', JSON.stringify(command())))[0]);
  await a.settle();
  assert.equal(text(av), 'CLI');
  assert.equal(av.state.doc.firstChild.textContent, 'CLI title');
  const c = {
      ...command(),
      patch: {
        content: pageContent('MCP title', 'MCP', {
          title: 'title',
          body: 'paragraph-1',
        }),
      },
    },
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
  assert.equal(av.state.doc.firstChild.textContent, 'MCP title');
  assert.equal(a.history(av, 'undo'), false);
  av.dispatch(
    av.state.tr.insertText('UI ', av.state.doc.firstChild.nodeSize + 1)
  );
  av.dispatch(av.state.tr.insertText('UI ', 1));
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
  assert.equal(page.content.value.content[1].content[0].text, 'UI MCP');
  assert.equal(page.title, 'UI MCP title');
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
        .get('content')
        .toArray()[1]
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
      x.v = SqliteStore.reopenDisposable(x.v.directory);
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
  replacement.value.content[1].attrs.blockId = 'replacement';
  ok(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      method: 'page.update',
      operationId: 'replace',
      expectedHead: before.head,
      patch: { content: replacement },
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
  av.dispatch(av.state.tr.setSelection(TextSelection.create(av.state.doc, 8)));
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
    bytes = readFileSync(new URL('./fixtures/tiny.png', import.meta.url));
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
    bytes = readFileSync(new URL('./fixtures/tiny.png', import.meta.url));
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
  assert.equal(p.content.value.type, 'doc');
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
  const { EditingContextRegistry } = await import('../../core/src/index.ts');
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
  const { EditingContextRegistry } = await import('../../core/src/index.ts');
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
  av.dispatch(av.state.tr.setSelection(TextSelection.create(av.state.doc, 8)));
  const bookmark = a.captureSelection(av);
  av.destroy();
  insert(bv, 'FOREIGN ', 1);
  ok(await b.save());
  await settle(a, b);
  const reopened = x.mount(a);
  assert.equal(a.restoreSelection(reopened, bookmark), true);
  assert.equal(reopened.state.selection.anchor, 16);
  assert.throws(() => b.restoreSelection(bv, bookmark), /WRONG_CONTEXT_VIEW/);
});

test('toolbar caret before surviving first character stays before it across prefix undo/redo', async (t) => {
  const x = await seeded(t),
    a = await x.open('prefix_boundary'),
    av = x.mount(a);
  insert(av, 'LOCAL ');
  a.stopCapturing();
  av.dispatch(av.state.tr.setSelection(TextSelection.create(av.state.doc, 9)));
  assert.equal(text(av), 'LOCAL Alpha beta');
  assert.equal(a.history(av, 'undo', { preserveSelection: true }), true);
  assert.equal(text(av), 'Alpha beta');
  assert.equal(
    av.state.selection.head,
    3,
    'caret must stay before A after removing the prefix'
  );
  assert.equal(a.history(av, 'redo', { preserveSelection: true }), true);
  assert.equal(text(av), 'LOCAL Alpha beta');
  assert.equal(
    av.state.selection.head,
    9,
    'caret must stay before A after restoring the prefix'
  );
});

test('toolbar uses the visible focused DOM caret when native selectionchange is still pending', async (t) => {
  const x = await seeded(t),
    a = await x.open('native_boundary'),
    av = x.mount(a);
  insert(av, 'LOCAL ');
  a.stopCapturing();
  av.dispatch(av.state.tr.setSelection(TextSelection.create(av.state.doc, 10)));
  av.focus();
  const node = av.dom.querySelector('p').firstChild;
  // Native click has moved the visible caret before A; selectionchange has not
  // reached PM yet. The toolbar pointer-down preserves this DOM selection.
  const visible = av.dom.ownerDocument.getSelection();
  visible.setBaseAndExtent(node, 6, node, 6);
  assert.equal(
    av.state.selection.head,
    10,
    'stored selection intentionally lags DOM'
  );
  assert.equal(a.history(av, 'undo', { preserveSelection: true }), true);
  assert.equal(text(av), 'Alpha beta');
  assert.equal(
    av.state.selection.head,
    3,
    'toolbar must use visible caret before A'
  );
  assert.equal(a.history(av, 'redo', { preserveSelection: true }), true);
  assert.equal(
    av.state.selection.head,
    9,
    'redo must retain the same logical boundary'
  );
});

test('toolbar reconciles a pending backward DOM range without reversing its endpoints', async (t) => {
  const x = await seeded(t),
    a = await x.open('native_range'),
    av = x.mount(a);
  insert(av, 'LOCAL ');
  a.stopCapturing();
  av.focus();
  const node = av.dom.querySelector('p').firstChild;
  av.dom.ownerDocument.getSelection().setBaseAndExtent(node, 16, node, 6);
  a.history(av, 'undo', { preserveSelection: true });
  assert.equal(av.state.selection.anchor, 13);
  assert.equal(av.state.selection.head, 3);
  a.history(av, 'redo', { preserveSelection: true });
  assert.equal(av.state.selection.anchor, 19);
  assert.equal(av.state.selection.head, 9);
});
test('toolbar targeting an unfocused context never borrows another editor DOM caret', async (t) => {
  const x = await seeded(t),
    a = await x.open('native_target_a'),
    b = await x.open('native_target_b'),
    av = x.mount(a),
    bv = x.mount(b);
  insert(av, 'LOCAL ');
  a.stopCapturing();
  ok(await a.save());
  await settle(a, b);
  av.dispatch(av.state.tr.setSelection(TextSelection.create(av.state.doc, 19)));
  bv.focus();
  const node = bv.dom.querySelector('p').firstChild;
  bv.dom.ownerDocument.getSelection().setBaseAndExtent(node, 6, node, 6);
  a.history(av, 'undo', { preserveSelection: true });
  assert.equal(av.state.selection.head, 13);
  assert.equal(bv.hasFocus(), true);
});

const keydown = (view, key, extra = {}) => {
  const event = new dom.window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...extra,
  });
  view.dom.dispatchEvent(event);
  return event;
};
test('3A title/body share ordered history and accepted persistence; foreign title survives local body undo', async (t) => {
  const x = await seeded(t),
    a = await x.open('title_a'),
    b = await x.open('title_b'),
    av = x.mount(a),
    bv = x.mount(b);
  assert.equal(av.state.selection.head, 1, 'new editor starts in its title');
  assert.equal(
    av.dom.querySelector('[data-title]').getAttribute('data-placeholder'),
    'New note'
  );
  av.dispatch(av.state.tr.insertText('Named', 1));
  a.stopCapturing();
  av.dispatch(
    av.state.tr.insertText('BODY ', av.state.doc.firstChild.nodeSize + 1)
  );
  a.stopCapturing();
  assert.equal(a.history(av, 'undo'), true);
  assert.equal(av.state.doc.firstChild.textContent, 'Named');
  assert.equal(text(av), 'Alpha beta');
  assert.equal(a.history(av, 'undo'), true);
  assert.equal(av.state.doc.firstChild.textContent, '');
  a.history(av, 'redo');
  a.history(av, 'redo');
  await a.flush();
  await settle(a, b);
  assert.equal(bv.state.doc.firstChild.textContent, 'Named');
  bv.dispatch(bv.state.tr.insertText(' foreign', 6));
  b.stopCapturing();
  await b.flush();
  await settle(a, b);
  a.history(av, 'undo');
  assert.equal(av.state.doc.firstChild.textContent, 'Named foreign');
  assert.equal(text(av), 'Alpha beta');
  await a.flush();
  await settle(a, b);
  const saved = ok(await x.read());
  assert.equal(saved.title, 'Named foreign');
  assert.equal(saved.content.schemaVersion, 2);
  av.destroy();
  const remount = x.mount(a);
  assert.equal(remount.state.doc.firstChild.textContent, 'Named foreign');
  assert.equal(a.history(remount, 'redo'), true);
  assert.equal(text(remount), 'BODY Alpha beta');
});
test('3A Enter and Backspace respect title/body boundary and Shift+Enter is inert', async (t) => {
  const x = await seeded(t),
    a = await x.open('title_keys'),
    av = x.mount(a);
  av.dispatch(av.state.tr.insertText('Title', 1));
  a.stopCapturing();
  av.focus();
  const before = av.state.doc.toJSON(),
    caret = av.state.selection.head;
  assert.equal(keydown(av, 'Enter', { shiftKey: true }).defaultPrevented, true);
  assert.deepEqual(av.state.doc.toJSON(), before);
  assert.equal(av.state.selection.head, caret);
  keydown(av, 'Enter');
  assert.equal(av.state.doc.childCount, 3);
  assert.equal(av.state.doc.child(1).textContent, '');
  assert.equal(av.state.doc.child(2).textContent, 'Alpha beta');
  assert.equal(av.state.selection.head, av.state.doc.firstChild.nodeSize + 1);
  keydown(av, 'Backspace');
  assert.equal(av.state.selection.head, av.state.doc.firstChild.nodeSize - 1);
  assert.deepEqual(av.state.doc.child(2).textContent, 'Alpha beta');
  // Empty first body is reused, not duplicated, when it is the only body block.
  av.dispatch(
    av.state.tr.replaceWith(
      av.state.doc.firstChild.nodeSize,
      av.state.doc.content.size,
      av.state.schema.nodes.paragraph.create({ blockId: 'empty-body' })
    )
  );
  av.dispatch(av.state.tr.setSelection(TextSelection.create(av.state.doc, 1)));
  keydown(av, 'Enter');
  assert.equal(av.state.doc.childCount, 2);
  assert.equal(av.state.selection.$from.parent.type.name, 'paragraph');
});
for (const { initialBody, trailingEmpty, label } of [
  { initialBody: '', label: 'blank body' },
  { initialBody: 'Alpha beta', label: 'body ending in text' },
  {
    initialBody: 'Alpha beta',
    trailingEmpty: true,
    label: 'body ending in an empty paragraph',
  },
])
  test(`78 multiline title paste into a ${label} selects the pasted blocks and undoes once`, async (t) => {
    const x = await seeded(t, {}, initialBody),
      a = await x.open('title_paste'),
      av = x.mount(a);
    av.dispatch(av.state.tr.insertText('Keep', 1));
    if (trailingEmpty) {
      av.dispatch(
        av.state.tr.insert(
          av.state.doc.content.size,
          av.state.schema.nodes.paragraph.create({ blockId: 'trailing-empty' })
        )
      );
    }
    a.stopCapturing();
    const initialDoc = av.state.doc;
    av.focus();
    const selectionStart = initialBody ? 2 : 1;
    const bodyLines = [
      ...(initialBody ? [initialBody] : []),
      'first',
      '',
      'last',
      '',
    ];
    const event = new dom.window.Event('paste', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (type) => (type === 'text/plain' ? 'first\r\n\r\nlast\n' : ''),
      },
    });
    let scrolled = false;
    const old = dom.window.HTMLElement.prototype.scrollIntoView;
    dom.window.HTMLElement.prototype.scrollIntoView = function () {
      if (this.classList.contains('selected-body-block')) scrolled = true;
    };
    try {
      av.dom.dispatchEvent(event);
    } finally {
      dom.window.HTMLElement.prototype.scrollIntoView = old;
    }
    assert.equal(event.defaultPrevented, true);
    assert.equal(av.state.doc.firstChild.textContent, 'Keep');
    assert.deepEqual(
      Array.from(
        { length: av.state.doc.childCount - 1 },
        (_, i) => av.state.doc.child(i + 1).textContent
      ),
      bodyLines
    );
    assert(av.hasFocus());
    assert(av.state.selection instanceof BodyBlockSelection);
    assert.equal(av.state.selection.visible, false);
    assert.deepEqual(
      av.state.selection.ids,
      av.state.doc
        .toJSON()
        .content.slice(selectionStart)
        .map((node) => node.attrs.blockId)
    );
    assert.equal(av.dom.querySelectorAll('.selected-body-block').length, 4);
    assert(scrolled);
    if (!initialBody || trailingEmpty) {
      assert.equal(
        av.state.selection.ids[0],
        initialDoc.lastChild.attrs.blockId
      );
    }
    await a.flush();
    await settle(a);
    assert.equal(av.dom.querySelectorAll('.selected-body-block').length, 4);
    for (const mode of ['cli', 'mcp']) {
      const saved = ok(
        await peerCommand67(x, mode, {
          apiVersion: 1,
          method: 'page.read',
          spaceId: x.v.spaceId,
          pageId: 'p',
        })
      );
      assert.equal(saved.head, ok(await x.read()).head);
      assert.deepEqual(
        saved.content.value.content
          .slice(1)
          .map((node) => node.content?.[0]?.text ?? ''),
        bodyLines
      );
      assert(!JSON.stringify(saved.content).includes('selected-body-block'));
    }
    assert(keydown(av, 'a', { ctrlKey: true }).defaultPrevented);
    assert.equal(av.state.selection.ids.length, bodyLines.length);
    assert.equal(
      av.dom.querySelectorAll('.selected-body-block').length,
      bodyLines.length
    );
    assert(keydown(av, 'z', { ctrlKey: true }).defaultPrevented);
    assert.equal(av.state.doc.firstChild.textContent, 'Keep');
    assert(av.state.doc.eq(initialDoc));
    a.history(av, 'redo');
    assert.equal(av.state.doc.childCount, bodyLines.length + 1);
  });
test('3A single-line title paste inserts normally without body append or block selection', async (t) => {
  const x = await seeded(t),
    a = await x.open('single-paste'),
    av = x.mount(a);
  av.focus();
  const event = new dom.window.Event('paste', {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type) => (type === 'text/plain' ? 'One line' : '') },
  });
  av.dom.dispatchEvent(event);
  assert.equal(av.state.doc.firstChild.textContent, 'One line');
  assert.equal(text(av), 'Alpha beta');
  assert.equal(av.state.doc.childCount, 2);
  assert(av.state.selection instanceof TextSelection);
  assert(av.hasFocus());
  a.stopCapturing();
  a.history(av, 'undo');
  assert.equal(av.state.doc.firstChild.textContent, '');
});

function bodyInput(view, value, offset = value.length) {
  const start = view.state.doc.firstChild.nodeSize + 1;
  const tr = view.state.tr.replaceWith(
    start,
    start + view.state.doc.child(1).content.size,
    value ? view.state.schema.text(value) : []
  );
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, start + offset)));
}
for (const level of [1, 2, 3, 4, 5, 6])
  test(`66 slash H${level} converts existing text in place and keeps its mapped caret/history`, async (t) => {
    const x = await seeded(t),
      a = await x.open('heading_' + level),
      av = x.mount(a);
    av.focus();
    bodyInput(av, 'before/h' + level + 'after', 9);
    a.stopCapturing();
    keydown(av, 'Enter');
    const node = av.state.doc.child(1);
    assert.equal(av.state.doc.childCount, 2);
    assert.equal(node.type.name, 'heading');
    assert.equal(node.attrs.level, level);
    assert.equal(node.textContent, 'beforeafter');
    assert.equal(node.attrs.blockId, 'paragraph-1');
    assert.equal(av.state.selection.$from.parent.attrs.blockId, 'paragraph-1');
    assert.equal(av.state.selection.$from.parentOffset, 6);
    assert(av.hasFocus());
    await a.flush();
    assert.equal(
      ok(await x.read()).content.value.content[1].attrs.level,
      level
    );
    a.history(av, 'undo');
    assert.equal(text(av), 'before/h' + level + 'after');
    assert.equal(av.state.doc.child(1).type.name, 'paragraph');
    a.history(av, 'redo');
    assert.equal(av.state.doc.child(1).type.name, 'heading');
    await a.flush();
  });
test('61 slash menu triggers mid-text, filters immediately, supports arrows/Escape and leaves unmatched queries/URLs alone', async (t) => {
  const x = await seeded(t),
    a = await x.open('queries'),
    av = x.mount(a);
  const menu = () =>
    av.state.plugins
      .find((p) => p.key.startsWith('block-insertion'))
      .getState(av.state);
  av.focus();
  bodyInput(av, 'abc/');
  assert(menu());
  assert.equal(menu().items.length, 10);
  keydown(av, 'ArrowDown');
  assert.equal(menu().index, 1);
  keydown(av, 'ArrowUp');
  assert.equal(menu().index, 0);
  keydown(av, 'Escape');
  assert.equal(menu(), null);
  assert.equal(text(av), 'abc/');
  bodyInput(av, 'abc/h2');
  assert.equal(menu().items.length, 1);
  assert.equal(menu().items[0].id, 'heading-2');
  bodyInput(av, 'abc/doesnotmatch');
  assert.equal(menu(), null);
  assert.equal(text(av), 'abc/doesnotmatch');
  for (const url of [
    '(https://example.com/h1',
    '"https://example.com/h2',
    'https:/',
    'https://example.com/h1',
    'www.example.com/h2',
    'example.com/h3',
    'mailto:someone@example.com/h4',
  ]) {
    bodyInput(av, url);
    assert.equal(menu(), null, url);
    assert.equal(text(av), url);
  }
  bodyInput(av, 'url https://example.com/ and/h5');
  assert(menu());
  assert.equal(menu().items[0].id, 'heading-5');
});
test('61 paragraph and separator commands preserve text; Backspace after separator does nothing', async (t) => {
  const x = await seeded(t),
    a = await x.open('basic_blocks'),
    av = x.mount(a);
  av.focus();
  bodyInput(av, 'prefix/paragraphsuffix', 16);
  keydown(av, 'Enter');
  assert.deepEqual(
    Array.from({ length: 1 }, (_, i) => av.state.doc.child(i + 1).textContent),
    ['prefixsuffix']
  );
  a.history(av, 'undo');
  bodyInput(av, 'prefix/separatorsuffix', 16);
  keydown(av, 'Enter');
  assert.equal(av.state.doc.child(2).type.name, 'separator');
  av.dispatch(
    av.state.tr.insert(
      av.state.doc.content.size,
      av.state.schema.nodes.paragraph.create(
        { blockId: 'after-divider' },
        av.state.schema.text('After')
      )
    )
  );
  const suffixPos =
    av.state.doc.firstChild.nodeSize +
    av.state.doc.child(1).nodeSize +
    av.state.doc.child(2).nodeSize +
    1;
  av.dispatch(
    av.state.tr.setSelection(TextSelection.create(av.state.doc, suffixPos))
  );
  const before = av.state.doc.toJSON();
  assert(keydown(av, 'Backspace').defaultPrevented);
  assert.deepEqual(av.state.doc.toJSON(), before);
  assert.equal(av.state.selection.head, suffixPos);
  await a.flush();
  assert.equal(ok(await x.read()).content.value.content[2].type, 'separator');
});
test('61 heading keyboard Enter at end creates normal paragraph, with unique stable identities', async (t) => {
  const x = await seeded(t),
    a = await x.open('heading_enter'),
    av = x.mount(a);
  av.focus();
  bodyInput(av, '/h1');
  keydown(av, 'Enter');
  const pos = av.state.doc.firstChild.nodeSize + 1;
  const tr = av.state.tr.insertText('Heading', pos);
  av.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 7)));
  keydown(av, 'Enter');
  assert.equal(av.state.selection.$from.parent.type.name, 'paragraph');
  const ids = [];
  av.state.doc.forEach((n) => ids.push(n.attrs.blockId));
  assert.equal(new Set(ids).size, ids.length);
  await a.flush();
});

test('61 undo of heading insertion preserves text another context typed into that heading', async (t) => {
  const x = await seeded(t),
    a = await x.open('heading_local'),
    b = await x.open('heading_foreign'),
    av = x.mount(a),
    bv = x.mount(b);
  av.focus();
  bodyInput(av, '/h3');
  keydown(av, 'Enter');
  await a.flush();
  await settle(a, b);
  const pos = bv.state.doc.firstChild.nodeSize + 1;
  bv.dispatch(bv.state.tr.insertText('FOREIGN HEADING', pos));
  await b.flush();
  await settle(a, b);
  a.history(av, 'undo');
  assert(
    av.state.doc.textContent.includes('FOREIGN HEADING'),
    'foreign text must survive structural undo'
  );
  await a.flush();
  await settle(a, b);
  assert(
    ok(await x.read()).content.value.content.some((n) =>
      (n.content ?? []).some((t) => t.text === 'FOREIGN HEADING')
    )
  );
});

test('61 CLI and MCP admit headings/separators through the same Core as the mounted editor', async (t) => {
  const x = await seeded(t),
    a = await x.open('blocks_peers'),
    av = x.mount(a);
  for (const mode of ['cli', 'mcp']) {
    const content = body(mode.toUpperCase());
    content.value.content[1].type = 'heading';
    content.value.content[1].attrs.level = 6;
    content.value.content.push({
      type: 'separator',
      attrs: { blockId: 'separator', indent: 0, parentId: null },
    });
    const c = {
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      method: 'page.update',
      operationId: x.next(),
      expectedHead: x.v.load('p').head,
      patch: { content },
    };
    if (mode === 'cli') ok((await stdio(x, 'cli', JSON.stringify(c)))[0]);
    else {
      const messages = [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test', version: '1' },
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
    }
    await settle(a);
    assert.equal(av.dom.querySelector('h6').textContent, mode.toUpperCase());
    assert(av.dom.querySelector('hr'));
    assert.equal(
      a.history(av, 'undo'),
      false,
      'peer writes do not enter local history'
    );
  }
  const pos = av.state.doc.firstChild.nodeSize + 1;
  av.dispatch(av.state.tr.insertText('UI ', pos));
  await a.flush();
  const readCommand = {
    apiVersion: 1,
    spaceId: x.v.spaceId,
    pageId: 'p',
    method: 'page.read',
  };
  const read = ok((await stdio(x, 'cli', JSON.stringify(readCommand)))[0]);
  assert.equal(read.content.value.content[1].content[0].text, 'UI MCP');
  assert.equal(read.content.value.content[2].type, 'separator');
});

for (const level of [1, 2, 3, 4, 5, 6])
  test(`67 separator below nonempty H${level} retains text/type and selects the object`, async (t) => {
    const x = await seeded(t),
      a = await x.open('separator_heading_' + level),
      av = x.mount(a);
    av.dispatch(
      av.state.tr.setNodeMarkup(
        av.state.doc.firstChild.nodeSize,
        av.state.schema.nodes.heading,
        { ...av.state.doc.child(1).attrs, level }
      )
    );
    av.focus();
    bodyInput(av, 'prefix/separatorsuffix', 16);
    a.stopCapturing();
    const id = av.state.doc.child(1).attrs.blockId;
    keydown(av, 'Enter');
    assert.equal(av.state.doc.childCount, 3);
    assert.equal(av.state.doc.child(1).type.name, 'heading');
    assert.equal(av.state.doc.child(1).attrs.level, level);
    assert.equal(av.state.doc.child(1).textContent, 'prefixsuffix');
    assert.equal(av.state.doc.child(2).type.name, 'separator');
    assert(av.state.selection instanceof NodeSelection);
    assert.equal(av.state.selection.node.type.name, 'separator');
    assert.equal(av.state.doc.child(1).attrs.blockId, id);
    assert.equal(av.hasFocus(), true);
    await a.flush();
    const saved = ok(await x.read());
    assert.equal(saved.content.value.content[1].attrs.level, level);
    a.history(av, 'undo');
    assert.equal(av.state.doc.childCount, 2);
    assert.equal(av.state.doc.child(1).textContent, 'prefix/separatorsuffix');
    a.history(av, 'redo');
    assert.equal(av.state.doc.child(1).textContent, 'prefixsuffix');
    assert.equal(av.state.doc.child(2).type.name, 'separator');
  });
test('67 empty command block converts to selected separator; Enter creates/reuses a paragraph below', async (t) => {
  for (const following of ['none', 'paragraph', 'heading', 'empty-paragraph']) {
    const x = await seeded(t),
      a = await x.open('separator_' + following),
      av = x.mount(a);
    if (following !== 'none')
      av.dispatch(
        av.state.tr.insert(
          av.state.doc.content.size,
          av.state.schema.nodes[
            following === 'empty-paragraph' ? 'paragraph' : following
          ].create(
            {
              blockId: 'existing-after',
              ...(following === 'heading' ? { level: 2 } : {}),
            },
            following === 'empty-paragraph'
              ? null
              : av.state.schema.text('Existing')
          )
        )
      );
    av.focus();
    bodyInput(av, '/separator');
    a.stopCapturing();
    const id = av.state.doc.child(1).attrs.blockId;
    keydown(av, 'Enter');
    assert.equal(av.state.doc.child(1).type.name, 'separator');
    assert.equal(av.state.doc.child(1).attrs.blockId, id);
    assert(av.state.selection instanceof NodeSelection);
    assert.equal(av.state.doc.childCount, following === 'none' ? 2 : 3);
    assert(
      av.dom.querySelector('hr').classList.contains('ProseMirror-selectednode')
    );
    keydown(av, 'Enter');
    assert.equal(av.state.doc.child(2).type.name, 'paragraph');
    assert.equal(av.state.doc.child(2).textContent, '');
    assert.equal(
      av.state.selection.$from.parent.attrs.blockId,
      av.state.doc.child(2).attrs.blockId
    );
    assert.equal(av.state.selection.$from.parentOffset, 0);
    assert.equal(
      av.state.doc.childCount,
      following === 'none' ? 3 : following === 'empty-paragraph' ? 3 : 4
    );
    if (following === 'empty-paragraph')
      assert.equal(av.state.doc.child(2).attrs.blockId, 'existing-after');
    if (following === 'heading' || following === 'paragraph') {
      assert.equal(av.state.doc.child(3).attrs.blockId, 'existing-after');
      assert.equal(av.state.doc.child(3).type.name, following);
    }
    av.dispatch(av.state.tr.insertText('Continue'));
    await a.flush();
    assert.equal(
      ok(await x.read()).content.value.content[2].content[0].text,
      'Continue'
    );
  }
});

async function seededList(t, specs, listStyle = 'unordered') {
  const x = await seeded(t),
    content = body('');
  content.value.content = content.value.content.slice(0, 1).concat(
    specs.map((s) => ({
      type: s.type ?? 'list_item',
      attrs: {
        blockId: s.id,
        indent: s.indent ?? 0,
        parentId: s.parent ?? null,
        ...((s.type ?? 'list_item') === 'list_item'
          ? { listStyle: s.style ?? listStyle }
          : s.type === 'heading'
            ? { level: s.level ?? 2 }
            : {}),
      },
      ...(s.text ? { content: [{ type: 'text', text: s.text }] } : {}),
    }))
  );
  ok(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      method: 'page.update',
      expectedHead: x.v.load('p').head,
      operationId: x.next(),
      patch: { content },
    })
  );
  const a = await x.open('lists'),
    av = x.mount(a);
  av.focus();
  return { ...x, a, av };
}
function rowAt(view, id, offset = 0) {
  let pos;
  view.state.doc.forEach((node, start) => {
    if (node.attrs.blockId === id) pos = start + 1 + offset;
  });
  assert.notEqual(pos, undefined, 'block exists: ' + id);
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, pos))
  );
}
function listRows(view) {
  const rows = [];
  view.state.doc.forEach((n, i) => {
    if (n.type.name !== 'title')
      rows.push({
        id: n.attrs.blockId,
        type: n.type.name,
        indent: n.attrs.indent,
        parent: n.attrs.parentId,
        text: n.textContent,
      });
  });
  return rows;
}
for (const style of ['ordered', 'unordered']) {
  test(`64 ${style} Tab/Shift+Tab carry descendants only; preceding sibling becomes parent`, async (t) => {
    const { a, av, ...x } = await seededList(
      t,
      [
        { id: 'a', text: 'A' },
        { id: 'ac', text: 'a child', indent: 1, parent: 'a' },
        { id: 'b', text: 'B' },
        { id: 'bc', text: 'b child', indent: 1, parent: 'b' },
        { id: 'c', text: 'C' },
      ],
      style
    );
    rowAt(av, 'b');
    keydown(av, 'Tab');
    assert.deepEqual(
      listRows(av).map((r) => [r.id, r.indent, r.parent]),
      [
        ['a', 0, null],
        ['ac', 1, 'a'],
        ['b', 1, 'a'],
        ['bc', 2, 'b'],
        ['c', 0, null],
      ]
    );
    keydown(av, 'Tab', { shiftKey: true });
    assert.deepEqual(
      listRows(av).map((r) => [r.id, r.indent, r.parent]),
      [
        ['a', 0, null],
        ['ac', 1, 'a'],
        ['b', 0, null],
        ['bc', 1, 'b'],
        ['c', 0, null],
      ]
    );
    a.history(av, 'undo');
    assert.equal(listRows(av)[2].indent, 1);
    a.history(av, 'redo');
    assert.equal(listRows(av)[2].indent, 0);
    await a.flush();
    assert.equal(
      ok(await x.read()).content.value.content[3].attrs.parentId,
      null
    );
  });
  test(`64 ${style} first item indents without a parent and leaves following siblings unchanged; leftmost Shift+Tab does nothing`, async (t) => {
    const { a, av, ...x } = await seededList(
      t,
      [
        { id: 'a', text: 'A' },
        { id: 'ac', text: 'child', indent: 1, parent: 'a' },
        { id: 'b', text: 'B' },
      ],
      style
    );
    rowAt(av, 'a');
    const before = av.state.doc.toJSON();
    assert(keydown(av, 'Tab', { shiftKey: true }).defaultPrevented);
    assert.deepEqual(av.state.doc.toJSON(), before);
    keydown(av, 'Tab');
    assert.deepEqual(
      listRows(av).map((r) => [r.id, r.indent, r.parent]),
      [
        ['a', 1, null],
        ['ac', 2, 'a'],
        ['b', 0, null],
      ]
    );
    assert.equal(av.state.selection.$from.parent.attrs.blockId, 'a');
    await a.flush();
  });
  for (const where of ['middle', 'end'])
    test(`64 ${style} Enter at ${where} creates an immediate sibling and transfers existing children`, async (t) => {
      const { a, av, ...x } = await seededList(
        t,
        [
          { id: 'a', text: 'Alpha beta' },
          { id: 'child', text: 'child', indent: 1, parent: 'a' },
          { id: 'grand', text: 'grand', indent: 2, parent: 'child' },
          { id: 'last', text: 'last' },
        ],
        style
      );
      const before = av.state.doc.toJSON();
      rowAt(av, 'a', where === 'middle' ? 5 : 10);
      keydown(av, 'Enter');
      const rows = listRows(av),
        next = rows[1].id;
      assert.equal(rows[0].text, where === 'middle' ? 'Alpha' : 'Alpha beta');
      assert.equal(rows[1].text, where === 'middle' ? ' beta' : '');
      assert.equal(rows[1].type, 'list_item');
      assert.equal(rows[1].indent, 0);
      assert.equal(rows[2].id, 'child');
      assert.equal(rows[2].parent, next);
      assert.equal(rows[3].parent, 'child');
      assert.equal(rows[3].indent, 2);
      assert.equal(rows[4].id, 'last');
      assert.equal(av.state.selection.$from.parent.attrs.blockId, next);
      const after = av.state.doc.toJSON();
      await a.flush();
      a.history(av, 'undo');
      assert.deepEqual(av.state.doc.toJSON(), before);
      a.history(av, 'redo');
      assert.deepEqual(av.state.doc.toJSON(), after);
      await a.flush();
    });
  test(`64 ${style} empty Enter outdents only itself then becomes a paragraph; children retain indentation`, async (t) => {
    const { a, av, ...x } = await seededList(
      t,
      [
        { id: 'a', indent: 2 },
        { id: 'child', text: 'child', indent: 3, parent: 'a' },
        { id: 'grand', text: 'grand', indent: 4, parent: 'child' },
      ],
      style
    );
    rowAt(av, 'a');
    keydown(av, 'Enter');
    let rows = listRows(av);
    assert.equal(rows[0].indent, 1);
    assert.equal(rows[1].indent, 3);
    assert.equal(rows[1].parent, null);
    assert.equal(rows[2].parent, 'child');
    keydown(av, 'Enter');
    assert.equal(listRows(av)[0].indent, 0);
    assert.equal(listRows(av)[0].type, 'list_item');
    keydown(av, 'Enter');
    rows = listRows(av);
    assert.equal(rows[0].type, 'paragraph');
    assert.equal(rows[1].type, 'list_item');
    assert.equal(rows[1].indent, 3);
    assert.equal(rows[2].indent, 4);
    await a.flush();
  });
  test(`64 ${style} Backspace first converts at same indent, then outdents just paragraph, then respects title boundary`, async (t) => {
    const { a, av, ...x } = await seededList(
      t,
      [
        { id: 'a', text: 'Keep', indent: 2 },
        { id: 'child', text: 'child', indent: 3, parent: 'a' },
      ],
      style
    );
    rowAt(av, 'a');
    keydown(av, 'Backspace');
    let rows = listRows(av);
    assert.equal(rows[0].type, 'paragraph');
    assert.equal(rows[0].indent, 2);
    assert.equal(rows[0].text, 'Keep');
    assert.equal(rows[1].indent, 3);
    assert.equal(rows[1].parent, null);
    keydown(av, 'Backspace');
    assert.equal(listRows(av)[0].indent, 1);
    keydown(av, 'Backspace');
    assert.equal(listRows(av)[0].indent, 0);
    keydown(av, 'Backspace');
    assert.equal(av.state.selection.$from.parent.type.name, 'title');
    assert.equal(listRows(av)[0].text, 'Keep');
    await a.flush();
  });
  test(`64 ${style} Shift+Enter creates an inline line break and retains children`, async (t) => {
    const { a, av, ...x } = await seededList(
      t,
      [
        { id: 'a', text: 'AB' },
        { id: 'child', text: 'child', indent: 1, parent: 'a' },
      ],
      style
    );
    rowAt(av, 'a', 1);
    keydown(av, 'Enter', { shiftKey: true });
    const doc = av.state.doc.toJSON();
    assert.deepEqual(doc.content[1].content, [
      { type: 'text', text: 'A' },
      { type: 'hard_break' },
      { type: 'text', text: 'B' },
    ]);
    assert.equal(doc.content[2].attrs.parentId, 'a');
    assert.equal(doc.content.length, 3);
    await a.flush();
    assert.equal(
      ok(await x.read()).content.value.content[1].content[1].type,
      'hard_break'
    );
  });
}
test('64 outdent preserves following siblings and explicit parents even when flat rows are not depth-first nested', async (t) => {
  const { a, av, ...x } = await seededList(t, [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B', indent: 1, parent: 'a' },
    { id: 'bc', text: 'Bc', indent: 2, parent: 'b' },
    { id: 'c', text: 'C', indent: 1, parent: 'a' },
  ]);
  rowAt(av, 'b');
  keydown(av, 'Tab', { shiftKey: true });
  assert.deepEqual(
    listRows(av).map((r) => [r.id, r.indent, r.parent]),
    [
      ['a', 0, null],
      ['b', 0, null],
      ['bc', 1, 'b'],
      ['c', 1, 'a'],
    ]
  );
  await a.flush();
  assert.equal(a.dirty, false);
});
test('64 ordered numbering is derived per sibling group; bullets and non-list blocks reset a run', async (t) => {
  const { a, av, ...x } = await seededList(
    t,
    [
      { id: 'a', text: 'A' },
      { id: 'ac', text: 'child', indent: 1, parent: 'a' },
      { id: 'b', text: 'B' },
      { id: 'break', type: 'paragraph', text: 'break' },
      { id: 'c', text: 'C' },
      { id: 'bullet', text: 'bullet', style: 'unordered' },
      { id: 'd', text: 'D' },
    ],
    'ordered'
  );
  assert.deepEqual(
    [...av.dom.querySelectorAll('[data-list-style]')].map((n) =>
      n.getAttribute('data-marker')
    ),
    ['1.', '1.', '2.', '1.', '•', '1.']
  );
  assert(!JSON.stringify(ok(await x.read()).content).includes('data-marker'));
});

test('64 Undo of list Enter retains foreign text in the new sibling and valid child parentage', async (t) => {
  const { a, av, ...x } = await seededList(t, [
    { id: 'a', text: 'Parent' },
    { id: 'child', text: 'child', indent: 1, parent: 'a' },
  ]);
  rowAt(av, 'a', 6);
  keydown(av, 'Enter');
  const sibling = listRows(av)[1].id;
  await a.flush();
  const b = await x.open('foreign_list'),
    bv = x.mount(b);
  rowAt(bv, sibling);
  bv.dispatch(bv.state.tr.insertText('FOREIGN'));
  await b.flush();
  await settle(a, b);
  a.history(av, 'undo');
  assert(av.state.doc.textContent.includes('FOREIGN'));
  await a.flush();
  await settle(a, b);
  assert.equal(av.state.doc.textContent, bv.state.doc.textContent);
  assert(
    ok(await x.read()).content.value.content.some((n) =>
      (n.content ?? []).some((t) => t.text === 'FOREIGN')
    )
  );
});
test('64 actual CLI/MCP list writes and UI list typing share one accepted document', async (t) => {
  const x = await seeded(t),
    a = await x.open('list_peers'),
    av = x.mount(a);
  for (const mode of ['cli', 'mcp']) {
    const content = body('');
    content.value.content[1] = {
      type: 'list_item',
      attrs: {
        blockId: 'row',
        indent: 1,
        parentId: null,
        listStyle: mode === 'cli' ? 'ordered' : 'unordered',
      },
      content: [{ type: 'text', text: mode.toUpperCase() }],
    };
    const c = {
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      method: 'page.update',
      operationId: x.next(),
      expectedHead: x.v.load('p').head,
      patch: { content },
    };
    if (mode === 'cli') ok((await stdio(x, 'cli', JSON.stringify(c)))[0]);
    else {
      const messages = [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test', version: '1' },
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
      ok(
        JSON.parse(
          (
            await stdio(
              x,
              'mcp',
              messages.map(JSON.stringify).join('\n') + '\n'
            )
          ).at(-1).result.content[0].text
        )
      );
    }
    await settle(a);
    const row = av.dom.querySelector('[data-list-style]');
    assert.equal(row.textContent, mode.toUpperCase());
    assert.equal(
      row.dataset.listStyle,
      mode === 'cli' ? 'ordered' : 'unordered'
    );
    assert.equal(a.history(av, 'undo'), false);
  }
  rowAt(av, 'row');
  av.dispatch(av.state.tr.insertText('UI '));
  await a.flush();
  const read = ok(
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
  assert.equal(read.content.value.content[1].type, 'list_item');
  assert.equal(read.content.value.content[1].content[0].text, 'UI MCP');
});
test('64 leftmost paragraph merges only with preceding text; non-text separator blocks Backspace', async (t) => {
  for (const previous of ['list_item', 'separator']) {
    const { a, av, ...x } = await seededList(t, [
      {
        id: 'above',
        type: previous,
        text: previous === 'list_item' ? 'Above' : '',
      },
      { id: 'current', text: 'Current', type: 'paragraph' },
    ]);
    rowAt(av, 'current');
    const before = av.state.doc.toJSON();
    keydown(av, 'Backspace');
    if (previous === 'separator')
      assert.deepEqual(av.state.doc.toJSON(), before);
    else {
      assert.equal(listRows(av).length, 1);
      assert.equal(listRows(av)[0].text, 'AboveCurrent');
    }
    await a.flush();
  }
});
test('64 title Enter treats an empty list as existing structure and inserts a paragraph before it', async (t) => {
  const { a, av, ...x } = await seededList(t, [{ id: 'item' }]);
  av.dispatch(av.state.tr.setSelection(TextSelection.create(av.state.doc, 1)));
  keydown(av, 'Enter');
  assert.equal(av.state.doc.child(1).type.name, 'paragraph');
  assert.equal(av.state.doc.child(2).type.name, 'list_item');
  assert.equal(av.state.doc.child(2).attrs.blockId, 'item');
  assert.equal(av.state.selection.$from.parent.type.name, 'paragraph');
  await a.flush();
});
test('64 Shift+Enter inside a link creates a saveable line break without copying text-only mark fields', async (t) => {
  const { a, av, ...x } = await seededList(t, [{ id: 'a', text: 'AB' }]);
  const start = av.state.doc.firstChild.nodeSize + 1;
  av.dispatch(
    av.state.tr.addMark(
      start,
      start + 2,
      av.state.schema.marks.link.create({ href: 'https://example.com' })
    )
  );
  rowAt(av, 'a', 1);
  keydown(av, 'Enter', { shiftKey: true });
  assert.equal(av.state.doc.child(1).child(1).type.name, 'hard_break');
  assert.equal(av.state.doc.child(1).child(1).marks.length, 0);
  await a.flush();
  assert.equal(a.dirty, false);
  assert.equal(
    ok(await x.read()).content.value.content[1].content[1].type,
    'hard_break'
  );
});

const insertionCases = [
  { query: '/paragraph', type: 'paragraph' },
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    query: '/h' + level,
    type: 'heading',
    level,
  })),
  { query: '/ol', type: 'list_item', listStyle: 'ordered' },
  { query: '/ul', type: 'list_item', listStyle: 'unordered' },
];
test('65 empty text-block conversion matrix keeps one block/identity, strips old type attrs and focuses editing', async (t) => {
  for (const source of ['paragraph', 'heading', 'ordered', 'unordered'])
    for (const target of insertionCases) {
      const x = await seeded(t),
        a = await x.open('conversion'),
        av = x.mount(a);
      const sourceType = ['ordered', 'unordered'].includes(source)
        ? 'list_item'
        : source;
      av.dispatch(
        av.state.tr.setNodeMarkup(
          av.state.doc.firstChild.nodeSize,
          av.state.schema.nodes[sourceType],
          {
            blockId: 'paragraph-1',
            indent: 1,
            parentId: null,
            ...(sourceType === 'heading'
              ? { level: 4 }
              : sourceType === 'list_item'
                ? { listStyle: source }
                : {}),
          }
        )
      );
      av.focus();
      bodyInput(av, target.query);
      a.stopCapturing();
      const before = av.state.doc.toJSON();
      keydown(av, 'Enter');
      assert.equal(av.state.doc.childCount, 2, source + ' -> ' + target.query);
      const node = av.state.doc.child(1);
      assert.equal(node.type.name, target.type);
      assert.equal(node.attrs.blockId, 'paragraph-1');
      assert.equal(node.attrs.indent, 1);
      if (target.level) assert.equal(node.attrs.level, target.level);
      else assert.equal(node.attrs.level, undefined);
      if (target.listStyle)
        assert.equal(node.attrs.listStyle, target.listStyle);
      else assert.equal(node.attrs.listStyle, undefined);
      assert.equal(
        av.state.selection.$from.parent.attrs.blockId,
        'paragraph-1'
      );
      assert.equal(av.state.selection.$from.parentOffset, 0);
      assert(av.hasFocus());
      await a.flush();
      a.history(av, 'undo');
      assert.deepEqual(av.state.doc.toJSON(), before);
      a.history(av, 'redo');
      await a.flush();
    }
});
test('66 filled editable conversion matrix keeps complete inline text and original ID/caret', async (t) => {
  for (const target of insertionCases) {
    const x = await seeded(t),
      a = await x.open('convert_filled'),
      av = x.mount(a);
    av.focus();
    bodyInput(av, 'prefix' + target.query + 'suffix', 6 + target.query.length);
    keydown(av, 'Enter');
    assert.equal(av.state.doc.childCount, 2);
    assert.equal(av.state.doc.child(1).type.name, target.type);
    assert.equal(av.state.doc.child(1).attrs.blockId, 'paragraph-1');
    assert.equal(av.state.doc.child(1).textContent, 'prefixsuffix');
    assert.equal(av.state.selection.$from.parentOffset, 6);
    av.dispatch(av.state.tr.insertText('Ready'));
    assert.equal(av.state.doc.child(1).textContent, 'prefixReadysuffix');
    await a.flush();
  }
});
test('65 conversion preserves child references and indentation under the same block identity', async (t) => {
  const { a, av, ...x } = await seededList(t, [
    { id: 'a', text: '/h2' },
    { id: 'child', text: 'child', indent: 1, parent: 'a' },
    { id: 'grand', text: 'grand', indent: 2, parent: 'child' },
  ]);
  rowAt(av, 'a', 3);
  // A local text transaction activates slash query for the already-admitted fixture.
  av.dispatch(av.state.tr.insertText('x').deleteSelection());
  const pos = av.state.selection.from;
  av.dispatch(av.state.tr.delete(pos - 1, pos));
  keydown(av, 'Enter');
  assert.equal(av.state.doc.child(1).type.name, 'heading');
  assert.equal(av.state.doc.child(1).attrs.blockId, 'a');
  assert.equal(av.state.doc.child(2).attrs.parentId, 'a');
  assert.equal(av.state.doc.child(3).attrs.parentId, 'child');
  await a.flush();
});
test('65 insertion policy prop overrides focus/placement without changing the shared executor', async (t) => {
  const { createBlockDefinitions } =
    await import('../../editor/src/block-definitions.mjs');
  const { insertBlock } = await import('../../editor/src/block-insertion.mjs');
  const x = await seeded(t),
    a = await x.open('policy'),
    av = x.mount(a);
  av.focus();
  bodyInput(av, 'before/h2after', 9);
  const definitions = createBlockDefinitions({
    'heading-2': { focus: 'retain', empty: 'after', nonEmpty: 'after' },
  });
  const tr = insertBlock(
    av.state,
    'heading-2',
    { from: 9, to: 12, query: 'h2' },
    x.next,
    definitions
  );
  assert(tr);
  av.dispatch(tr);
  assert.equal(av.state.doc.child(1).textContent, 'beforeafter');
  assert.equal(av.state.selection.$from.parent.attrs.blockId, 'paragraph-1');
  assert.equal(av.state.selection.$from.parentOffset, 6);
  assert.equal(
    createBlockDefinitions().find((d) => d.id === 'heading-2').insertion.focus,
    'inserted',
    'override does not mutate defaults'
  );
  for (const value of [
    { missing: { focus: 'retain' } },
    { paragraph: { focus: 'other' } },
    { paragraph: { extra: true } },
    { paragraph: null },
  ])
    assert.throws(() => createBlockDefinitions(value));
});

test('65 generic insertion entry works without slash text and rejects incompatible focus policy before editing', async (t) => {
  const { createInsertionTransaction } =
    await import('../../editor/src/block-insertion.mjs');
  const { createBlockDefinitions } =
    await import('../../editor/src/block-definitions.mjs');
  const x = await seeded(t),
    a = await x.open('generic'),
    av = x.mount(a);
  av.focus();
  rowAt(av, 'paragraph-1', 5);
  const before = av.state.doc.toJSON();
  assert.throws(
    () =>
      createInsertionTransaction(av.state, 'separator', x.next, {
        definitions: createBlockDefinitions({
          separator: { focus: 'inserted' },
        }),
      }),
    /UNSUPPORTED_BLOCK_INSERTION_POLICY/
  );
  assert.deepEqual(av.state.doc.toJSON(), before);
  av.dispatch(createInsertionTransaction(av.state, 'ordered-list', x.next));
  assert.equal(av.state.doc.child(1).textContent, 'Alpha beta');
  assert.equal(av.state.doc.child(1).type.name, 'list_item');
  assert.equal(
    av.state.selection.$from.parent.attrs.blockId,
    av.state.doc.child(1).attrs.blockId
  );
  await a.flush();
  assert.equal(a.history(av, 'undo'), true);
  assert.equal(av.state.doc.childCount, 2);
  assert.equal(av.state.doc.child(1).type.name, 'paragraph');
  assert.equal(av.state.doc.child(1).textContent, 'Alpha beta');
  assert.equal(a.history(av, 'redo'), true);
  await a.flush();
});
test('65 workspace insertionPolicies prop reaches actual editor behavior', async (t) => {
  const { WindowWorkspace } = await import('../../ui/src/window-workspace.mjs');
  const x = await seeded(t),
    model = new WindowWorkspace({
      client: x.client(),
      spaceId: x.v.spaceId,
      windowId: 'prop_window',
      insertionPolicies: {
        'heading-2': { focus: 'retain', nonEmpty: 'after' },
      },
    });
  await model.start();
  const e = model.editor('p'),
    target = document.createElement('section');
  document.body.append(target);
  try {
    const view = await e.mount('prop_view', target);
    view.focus();
    bodyInput(view, 'before/h2after', 9);
    keydown(view, 'Enter');
    assert.equal(view.state.doc.child(1).textContent, 'beforeafter');
    assert.equal(view.state.doc.child(2).type.name, 'heading');
    assert.equal(
      view.state.selection.$from.parent.attrs.blockId,
      view.state.doc.child(1).attrs.blockId
    );
    assert.equal(view.state.selection.$from.parentOffset, 6);
    await e.flush();
  } finally {
    assert.equal((await model.prepareClose()).safe, true);
    await e.releaseAfterClose();
    for (const s of e.contexts.values()) s.destroy();
    target.remove();
  }
});
test('65 insertion uses explicit descendants rather than unrelated indented rows as its placement group', async (t) => {
  const { a, av, ...x } = await seededList(t, [
    { id: 'a', text: 'before/h2after' },
    { id: 'child', text: 'child', indent: 1, parent: 'a' },
    { id: 'free', text: 'free', indent: 1 },
  ]);
  rowAt(av, 'a', 9);
  const pos = av.state.selection.from;
  av.dispatch(av.state.tr.insertText('x'));
  av.dispatch(av.state.tr.delete(pos, pos + 1));
  const { insertBlock } = await import('../../editor/src/block-insertion.mjs');
  const { createBlockDefinitions } =
    await import('../../editor/src/block-definitions.mjs');
  av.dispatch(
    insertBlock(
      av.state,
      'heading-2',
      { from: 9, to: 12, query: 'h2' },
      x.next,
      createBlockDefinitions({ 'heading-2': { nonEmpty: 'after' } })
    )
  );
  const rows = listRows(av);
  assert.equal(rows[0].text, 'beforeafter');
  assert.equal(rows[1].id, 'child');
  assert.equal(rows[1].parent, 'a');
  assert.equal(rows[2].type, 'heading');
  assert.equal(rows[3].id, 'free');
  assert.equal(av.state.selection.$from.parent.attrs.blockId, rows[2].id);
  await a.flush();
});

const indentableCases = [
  { name: 'paragraph', type: 'paragraph' },
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    name: 'H' + level,
    type: 'heading',
    level,
  })),
  { name: 'ordered', type: 'list_item', style: 'ordered' },
  { name: 'unordered', type: 'list_item', style: 'unordered' },
];
for (const spec of indentableCases)
  test(`66 ${spec.name} indents/outdents from root using the shared body text handler`, async (t) => {
    const { a, av, ...x } = await seededList(t, [
      {
        id: 'a',
        text: 'Keep text',
        type: spec.type,
        level: spec.level,
        style: spec.style,
      },
    ]);
    rowAt(av, 'a', 4);
    const initial = av.state.doc.toJSON();
    assert(keydown(av, 'Tab', { shiftKey: true }).defaultPrevented);
    assert.deepEqual(av.state.doc.toJSON(), initial);
    keydown(av, 'Tab');
    keydown(av, 'Tab');
    assert.equal(av.state.doc.child(1).attrs.indent, 2);
    assert.equal(av.state.doc.child(1).type.name, spec.type);
    assert.equal(av.state.selection.$from.parentOffset, 4);
    assert.equal(av.state.doc.child(1).textContent, 'Keep text');
    keydown(av, 'Tab', { shiftKey: true });
    assert.equal(av.state.doc.child(1).attrs.indent, 1);
    await a.flush();
    assert.equal(ok(await x.read()).content.value.content[1].attrs.indent, 1);
    a.history(av, 'undo');
    assert.equal(av.state.doc.child(1).attrs.indent, 2);
    a.history(av, 'redo');
    assert.equal(av.state.doc.child(1).attrs.indent, 1);
    keydown(av, 'Tab', { shiftKey: true });
    assert.equal(av.state.doc.child(1).attrs.indent, 0);
    await a.flush();
  });
test('66 heading subtree indentation preserves mixed text children and unrelated siblings', async (t) => {
  const { a, av, ...x } = await seededList(t, [
    { id: 'root', type: 'paragraph', text: 'Root' },
    {
      id: 'h',
      type: 'heading',
      level: 2,
      text: 'Heading',
      indent: 1,
      parent: 'root',
    },
    { id: 'child', text: 'Child', indent: 2, parent: 'h' },
    {
      id: 'grand',
      type: 'paragraph',
      text: 'Grand',
      indent: 3,
      parent: 'child',
    },
    { id: 'last', type: 'paragraph', text: 'Last' },
  ]);
  rowAt(av, 'h', 2);
  keydown(av, 'Tab', { shiftKey: true });
  assert.deepEqual(
    listRows(av).map((r) => [r.id, r.indent, r.parent]),
    [
      ['root', 0, null],
      ['h', 0, null],
      ['child', 1, 'h'],
      ['grand', 2, 'child'],
      ['last', 0, null],
    ]
  );
  keydown(av, 'Tab');
  assert.deepEqual(
    listRows(av).map((r) => [r.id, r.indent, r.parent]),
    [
      ['root', 0, null],
      ['h', 1, 'root'],
      ['child', 2, 'h'],
      ['grand', 3, 'child'],
      ['last', 0, null],
    ]
  );
  await a.flush();
});
test('66 title and separator cannot initiate block indentation', async (t) => {
  const { NodeSelection } = await import('prosemirror-state');
  const { a, av } = await seededList(t, [
    { id: 'sep', type: 'separator' },
    { id: 'p', type: 'paragraph', text: 'Text' },
  ]);
  av.dispatch(av.state.tr.setSelection(TextSelection.create(av.state.doc, 1)));
  let before = av.state.doc.toJSON();
  keydown(av, 'Tab');
  assert.deepEqual(av.state.doc.toJSON(), before);
  av.dispatch(
    av.state.tr.setSelection(
      NodeSelection.create(av.state.doc, av.state.doc.firstChild.nodeSize)
    )
  );
  before = av.state.doc.toJSON();
  keydown(av, 'Tab');
  keydown(av, 'Tab', { shiftKey: true });
  assert.deepEqual(av.state.doc.toJSON(), before);
  await a.flush();
});
test('66 shared indentation and conversion roundtrip through real CLI/MCP clients', async (t) => {
  const x = await seeded(t),
    a = await x.open('indent_peers'),
    av = x.mount(a);
  for (const mode of ['cli', 'mcp']) {
    const content = body(mode.toUpperCase());
    content.value.content[1].type = 'heading';
    content.value.content[1].attrs.level = 2;
    content.value.content[1].attrs.indent = 2;
    const command = {
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      method: 'page.update',
      operationId: x.next(),
      expectedHead: x.v.load('p').head,
      patch: { content },
    };
    if (mode === 'cli') ok((await stdio(x, 'cli', JSON.stringify(command)))[0]);
    else {
      const messages = [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test', version: '1' },
          },
        },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'clutter_command', arguments: command },
        },
      ];
      ok(
        JSON.parse(
          (
            await stdio(
              x,
              'mcp',
              messages.map(JSON.stringify).join('\n') + '\n'
            )
          ).at(-1).result.content[0].text
        )
      );
    }
    await settle(a);
    assert.equal(av.state.doc.child(1).attrs.indent, 2);
    assert.equal(av.state.doc.child(1).textContent, mode.toUpperCase());
    rowAt(av, 'paragraph-1');
    keydown(av, 'Tab', { shiftKey: true });
    assert.equal(av.state.doc.child(1).attrs.indent, 1);
    bodyInput(av, mode.toUpperCase() + '/ol');
    keydown(av, 'Enter');
    assert.equal(av.state.doc.childCount, 2);
    assert.equal(av.state.doc.child(1).type.name, 'list_item');
    assert.equal(av.state.doc.child(1).attrs.indent, 1);
    await a.flush();
    const read = ok(
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
    assert.equal(read.content.value.content[1].type, 'list_item');
    assert.equal(read.content.value.content[1].attrs.indent, 1);
    assert.equal(
      read.content.value.content[1].content[0].text,
      mode.toUpperCase()
    );
  }
});

function selectObject(view, id) {
  let pos;
  view.state.doc.forEach((node, start) => {
    if (node.attrs.blockId === id) pos = start;
  });
  assert.notEqual(pos, undefined);
  view.dispatch(
    view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos))
  );
}
test('67 object click selects without mutation; Enter continuation is normal text with separate undo', async (t) => {
  const x = await seededList(t, [
      { id: 'before', type: 'heading', text: 'Heading', level: 3 },
      { id: 'divider', type: 'separator', indent: 2 },
      { id: 'after', type: 'heading', text: 'Keep', level: 2 },
    ]),
    { av, a } = x;
  const before = av.state.doc.toJSON();
  let at;
  av.state.doc.forEach((node, pos) => {
    if (node.attrs.blockId === 'divider') at = pos;
  });
  const event = new dom.window.MouseEvent('click', { button: 0 });
  assert.equal(
    av.someProp('handleClickOn', (handler) =>
      handler(av, at, av.state.doc.nodeAt(at), at, event, true)
    ),
    true
  );
  assert(av.state.selection instanceof NodeSelection);
  assert.equal(av.state.selection.node.attrs.blockId, 'divider');
  assert.deepEqual(av.state.doc.toJSON(), before);
  assert(av.hasFocus());
  assert(
    av.dom.querySelector('hr').classList.contains('ProseMirror-selectednode')
  );
  keydown(av, 'Enter');
  const p = av.state.doc.child(3);
  assert.equal(p.type.name, 'paragraph');
  assert.equal(p.attrs.indent, 2);
  assert.equal(p.textContent, '');
  assert.equal(av.state.selection.$from.parent.attrs.blockId, p.attrs.blockId);
  assert.equal(av.state.doc.child(4).attrs.blockId, 'after');
  await a.flush();
  assert(a.history(av, 'undo'));
  assert.deepEqual(av.state.doc.toJSON(), before);
  assert(a.history(av, 'redo'));
  assert.equal(av.state.doc.child(3).type.name, 'paragraph');
  await a.flush();
});
for (const key of ['Backspace', 'Delete'])
  test(`67 selected object ${key} chooses nearby body caret/object and keeps children`, async (t) => {
    const cases = [
      {
        rows: [
          { id: 'prev', type: 'paragraph', text: 'Before' },
          { id: 'sep', type: 'separator' },
          { id: 'next', type: 'paragraph', text: 'After' },
        ],
        text: 'prev',
        offset: 6,
      },
      {
        rows: [
          { id: 'prev', type: 'separator' },
          { id: 'sep', type: 'separator' },
          { id: 'next', type: 'paragraph', text: 'After' },
        ],
        text: 'next',
        offset: 0,
      },
      {
        rows: [
          { id: 'prev', type: 'separator' },
          { id: 'sep', type: 'separator' },
        ],
        object: 'prev',
      },
      {
        rows: [
          { id: 'sep', type: 'separator' },
          { id: 'next', type: 'separator' },
        ],
        object: 'next',
      },
      { rows: [{ id: 'sep', type: 'separator' }], empty: true },
      {
        rows: [
          { id: 'sep', type: 'separator' },
          {
            id: 'child',
            type: 'paragraph',
            text: 'Child',
            indent: 1,
            parent: 'sep',
          },
        ],
        text: 'child',
        offset: 0,
      },
    ];
    for (const c of cases) {
      const x = await seededList(t, c.rows),
        { av, a } = x;
      const before = av.state.doc.toJSON();
      selectObject(av, 'sep');
      assert(keydown(av, key).defaultPrevented);
      assert(!listRows(av).some((row) => row.id === 'sep'));
      assert(av.hasFocus());
      if (c.object) {
        assert(av.state.selection instanceof NodeSelection);
        assert.equal(av.state.selection.node.attrs.blockId, c.object);
      } else {
        assert(av.state.selection instanceof TextSelection);
        assert.notEqual(av.state.selection.$from.parent.type.name, 'title');
        if (c.text) {
          assert.equal(av.state.selection.$from.parent.attrs.blockId, c.text);
          assert.equal(av.state.selection.$from.parentOffset, c.offset);
        } else {
          assert.equal(av.state.doc.childCount, 2);
          assert.equal(av.state.doc.child(1).type.name, 'paragraph');
          assert.equal(av.state.doc.child(1).textContent, '');
        }
      }
      if (c.text === 'child') {
        assert.equal(av.state.doc.child(1).attrs.parentId, null);
        assert.equal(av.state.doc.child(1).attrs.indent, 1);
      }
      await a.flush();
      assert(a.history(av, 'undo'));
      assert.deepEqual(av.state.doc.toJSON(), before);
      assert(a.history(av, 'redo'));
      await a.flush();
    }
  });
test('67 selected object key guards do not mutate on modified Enter, composition or read-only', async (t) => {
  const x = await seededList(t, [{ id: 'sep', type: 'separator' }]),
    { av, a } = x;
  selectObject(av, 'sep');
  const before = av.state.doc.toJSON();
  const { objectInteractions } =
    await import('../../editor/src/object-interactions.mjs');
  const plugin = objectInteractions({ nextId: x.next, canEdit: () => true });
  for (const extra of [
    { shiftKey: true },
    { ctrlKey: true },
    { isComposing: true },
  ]) {
    assert.equal(
      plugin.props.handleKeyDown(
        av,
        new dom.window.KeyboardEvent('keydown', { key: 'Enter', ...extra })
      ),
      false
    );
    assert.deepEqual(av.state.doc.toJSON(), before);
  }
  const locked = objectInteractions({ nextId: x.next, canEdit: () => false });
  for (const key of ['Enter', 'Backspace', 'Delete'])
    assert.equal(
      locked.props.handleKeyDown(
        av,
        new dom.window.KeyboardEvent('keydown', { key })
      ),
      false
    );
});
async function peerCommand67(x, mode, command, cliExit = 0) {
  if (mode === 'cli')
    return (await stdio(x, mode, JSON.stringify(command), cliExit))[0];
  const messages = [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'separator67', version: '1' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'clutter_command', arguments: command },
    },
  ];
  return JSON.parse(
    (await stdio(x, mode, messages.map(JSON.stringify).join('\n') + '\n')).at(
      -1
    ).result.content[0].text
  );
}
test('67 real CLI/MCP read UI separator continuation/deletion and reload the same accepted root', async (t) => {
  const x = await seeded(t),
    a = await x.open('objects67'),
    av = x.mount(a);
  av.focus();
  bodyInput(av, 'Alpha/separator');
  keydown(av, 'Enter');
  assert(av.state.selection instanceof NodeSelection);
  const id = av.state.selection.node.attrs.blockId;
  keydown(av, 'Enter');
  av.dispatch(av.state.tr.insertText('Below'));
  await a.flush();
  for (const mode of ['cli', 'mcp']) {
    const command = {
      apiVersion: 1,
      method: 'page.read',
      spaceId: x.v.spaceId,
      pageId: 'p',
    };
    const read = ok(await peerCommand67(x, mode, command));
    assert.deepEqual(
      read.content.value.content.map((n) => n.type),
      ['title', 'paragraph', 'separator', 'paragraph']
    );
    assert.equal(read.content.value.content[3].content[0].text, 'Below');
  }
  selectObject(av, id);
  keydown(av, 'Delete');
  await a.flush();
  for (const mode of ['cli', 'mcp']) {
    const read = ok(
      await peerCommand67(x, mode, {
        apiVersion: 1,
        method: 'page.read',
        spaceId: x.v.spaceId,
        pageId: 'p',
      })
    );
    assert.deepEqual(
      read.content.value.content.map((n) => n.type),
      ['title', 'paragraph', 'paragraph']
    );
    assert.equal(read.content.value.content[1].content[0].text, 'Alpha');
    assert.equal(read.content.value.content[2].content[0].text, 'Below');
  }
  const b = await x.open('reopened67'),
    bv = x.mount(b);
  assert.deepEqual(bv.state.doc.toJSON(), av.state.doc.toJSON());
});
test('67 peer removal of a selected last separator cannot crash selection restoration or move into title', async (t) => {
  const x = await seededList(t, [
      { id: 'before', type: 'paragraph', text: 'Body' },
      { id: 'sep', type: 'separator' },
    ]),
    { av, a } = x;
  selectObject(av, 'sep');
  const content = body('Peer body');
  ok(
    await peerCommand67(x, 'mcp', {
      apiVersion: 1,
      method: 'page.update',
      spaceId: x.v.spaceId,
      pageId: 'p',
      operationId: x.next(),
      expectedHead: x.v.load('p').head,
      patch: { content },
    })
  );
  await settle(a);
  assert.equal(av.state.doc.childCount, 2);
  assert(av.state.selection instanceof TextSelection);
  assert.equal(av.state.selection.$from.parent.type.name, 'paragraph');
  assert.equal(av.state.doc.child(1).textContent, 'Peer body');
});
test('67 generic object selection policy rejects non-atomic text and nonempty destructive conversion', async (t) => {
  const { createInsertionTransaction } =
    await import('../../editor/src/block-insertion.mjs');
  const { createBlockDefinitions } =
    await import('../../editor/src/block-definitions.mjs');
  const x = await seeded(t),
    a = await x.open('object_config'),
    av = x.mount(a);
  rowAt(av, 'paragraph-1');
  const before = av.state.doc.toJSON();
  for (const config of [
    { paragraph: { focus: 'selected' } },
    { separator: { nonEmpty: 'convert' } },
  ])
    assert.throws(
      () =>
        createInsertionTransaction(av.state, Object.keys(config)[0], x.next, {
          definitions: createBlockDefinitions(config),
        }),
      /UNSUPPORTED_BLOCK_INSERTION_POLICY/
    );
  assert.deepEqual(av.state.doc.toJSON(), before);
});
for (const listStyle of ['ordered', 'unordered'])
  test(`67 ${listStyle} list inserts selected separator after its child group then Enter starts a normal paragraph`, async (t) => {
    const x = await seededList(
        t,
        [
          { id: 'list', text: 'Parent', indent: 1 },
          { id: 'child', text: 'Child', indent: 2, parent: 'list' },
        ],
        listStyle
      ),
      { av, a } = x;
    rowAt(av, 'list', 6);
    av.dispatch(av.state.tr.insertText('/separator'));
    keydown(av, 'Enter');
    assert.deepEqual(
      listRows(av).map((row) => row.type),
      ['list_item', 'list_item', 'separator']
    );
    assert(av.state.selection instanceof NodeSelection);
    keydown(av, 'Enter');
    assert.equal(av.state.doc.child(4).type.name, 'paragraph');
    assert.equal(av.state.doc.child(4).attrs.indent, 1);
    assert.equal(av.state.doc.child(2).attrs.parentId, 'list');
    assert.equal(av.state.doc.child(1).textContent, 'Parent');
    assert.equal(av.state.doc.child(2).textContent, 'Child');
    await a.flush();
  });

const { createFormattingTransaction, formattingState } =
  await import('../../editor/src/formatting.mjs');
function selectBodyText(view, from = 0, to = 5) {
  const start = view.state.doc.firstChild.nodeSize + 1;
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.create(view.state.doc, start + from, start + to)
    )
  );
  view.focus();
}
for (const [action, value] of [
  ['bold'],
  ['italic'],
  ['underline'],
  ['strike'],
  ['link', 'https://example.com'],
  ['text_color', 'blue'],
  ['highlight', 'yellow'],
  ['background', 'green'],
])
  test(`69 ${action} preserves selection, saves and undoes/redoes through context history`, async (t) => {
    const x = await seeded(t),
      a = await x.open('format_' + action),
      av = x.mount(a);
    selectBodyText(av);
    const before = av.state.doc.toJSON(),
      selection = av.state.selection.toJSON();
    av.dispatch(createFormattingTransaction(av.state, action, value));
    assert.deepEqual(av.state.selection.toJSON(), selection);
    assert(av.hasFocus());
    assert.equal(formattingState(av.state)[action], value ?? true);
    await a.flush();
    const saved = ok(await x.read());
    assert.equal(saved.title, '');
    if (action === 'background')
      assert.equal(saved.content.value.content[1].attrs.background, value);
    else
      assert(
        saved.content.value.content[1].content[0].marks.some(
          (mark) => mark.type === action
        )
      );
    assert(a.history(av, 'undo'));
    assert.deepEqual(av.state.doc.toJSON(), before);
    assert(a.history(av, 'redo'));
    assert.equal(formattingState(av.state)[action], value ?? true);
    av.dispatch(
      createFormattingTransaction(
        av.state,
        action,
        ['bold', 'italic', 'underline', 'strike'].includes(action)
          ? undefined
          : null
      )
    );
    assert.equal(formattingState(av.state)[action], null);
    await a.flush();
  });
test('69 shortcuts share formatting executor; title, objects and title-crossing ranges cannot acquire body formats', async (t) => {
  const x = await seeded(t),
    a = await x.open('shortcuts'),
    av = x.mount(a);
  selectBodyText(av);
  for (const [key, extra, mark] of [
    ['b', { metaKey: true }, 'bold'],
    ['i', { ctrlKey: true }, 'italic'],
    ['u', { metaKey: true }, 'underline'],
    ['x', { ctrlKey: true, shiftKey: true }, 'strike'],
  ]) {
    assert(keydown(av, key, extra).defaultPrevented);
    assert(formattingState(av.state)[mark]);
  }
  rowAt(av, 'paragraph-1', 5);
  keydown(av, 'b', { metaKey: true });
  av.dispatch(av.state.tr.insertText('BOLD'));
  assert(av.state.doc.child(1).textContent.includes('BOLD'));
  await a.flush();
  av.dispatch(av.state.tr.setSelection(TextSelection.create(av.state.doc, 1)));
  const before = av.state.doc.toJSON();
  assert(keydown(av, 'b', { metaKey: true }).defaultPrevented);
  assert.deepEqual(av.state.doc.toJSON(), before);
  assert.equal(
    createFormattingTransaction(av.state, 'background', 'red'),
    null
  );
  av.dispatch(
    av.state.tr.setSelection(
      TextSelection.create(
        av.state.doc,
        1,
        av.state.doc.firstChild.nodeSize + 3
      )
    )
  );
  assert.equal(createFormattingTransaction(av.state, 'bold'), null);
});
test('69 formatting spans body blocks without formatting semantic atoms, preserves background on conversion and outdent', async (t) => {
  const x = await seededList(t, [
      { id: 'one', type: 'heading', text: 'First', indent: 1 },
      { id: 'two', type: 'paragraph', text: 'Second' },
    ]),
    { av, a } = x;
  const start = av.state.doc.firstChild.nodeSize + 1,
    end = av.state.doc.content.size - 1;
  av.dispatch(
    av.state.tr.setSelection(TextSelection.create(av.state.doc, start, end))
  );
  av.dispatch(createFormattingTransaction(av.state, 'bold'));
  av.dispatch(createFormattingTransaction(av.state, 'background', 'purple'));
  assert.equal(av.state.doc.child(1).attrs.background, 'purple');
  assert.equal(av.state.doc.child(2).attrs.background, 'purple');
  rowAt(av, 'one', 5);
  av.dispatch(av.state.tr.insertText('/ul'));
  keydown(av, 'Enter');
  assert.equal(av.state.doc.child(1).attrs.background, 'purple');
  rowAt(av, 'one');
  keydown(av, 'Backspace');
  assert.equal(av.state.doc.child(1).type.name, 'paragraph');
  assert.equal(av.state.doc.child(1).attrs.background, 'purple');
  await a.flush();
});
test('69 invalid custom formats, unsafe links and title formats are rejected through real CLI/MCP without changing accepted root', async (t) => {
  const x = await seeded(t),
    initial = ok(await x.read());
  const bad = [
    (c) =>
      (c.value.content[1].content[0].marks = [
        { type: 'text_color', attrs: { preset: '#ff0000' } },
      ]),
    (c) =>
      (c.value.content[1].content[0].marks = [
        { type: 'link', attrs: { href: 'javascript:alert(1)' } },
      ]),
    (c) =>
      (c.value.content[1].content[0].marks = [
        { type: 'bold', attrs: { html: 'bad' } },
      ]),
    (c) => (c.value.content[1].attrs.background = 'url(https://example.com)'),
    (c) =>
      (c.value.content[0].content = [
        { type: 'text', text: 'Title', marks: [{ type: 'bold' }] },
      ]),
  ];
  for (const mode of ['cli', 'mcp'])
    for (const mutate of bad) {
      const content = body();
      mutate(content);
      const reply = await peerCommand67(
        x,
        mode,
        {
          apiVersion: 1,
          spaceId: x.v.spaceId,
          pageId: 'p',
          method: 'page.update',
          operationId: x.next(),
          expectedHead: initial.head,
          patch: { content },
        },
        mode === 'cli' ? 1 : 0
      );
      assert.equal(reply.ok, false);
      assert.equal(ok(await x.read()).head, initial.head);
    }
});
test('69 formatted peer writes, local formatting undo, and saved reopen share one accepted root through real clients', async (t) => {
  const x = await seeded(t),
    a = await x.open('format_peers'),
    av = x.mount(a);
  for (const mode of ['cli', 'mcp']) {
    const content = body('Peer formatted');
    content.value.content[1].attrs.background = 'blue';
    content.value.content[1].content[0].marks = [
      { type: 'italic' },
      { type: 'text_color', attrs: { preset: 'red' } },
    ];
    ok(
      await peerCommand67(x, mode, {
        apiVersion: 1,
        spaceId: x.v.spaceId,
        pageId: 'p',
        method: 'page.update',
        operationId: x.next(),
        expectedHead: x.v.load('p').head,
        patch: { content },
      })
    );
    await settle(a);
    selectBodyText(av, 0, 4);
    assert(formattingState(av.state).italic);
    av.dispatch(createFormattingTransaction(av.state, 'underline'));
    await a.flush();
    const read = ok(
      await peerCommand67(x, mode, {
        apiVersion: 1,
        spaceId: x.v.spaceId,
        pageId: 'p',
        method: 'page.read',
      })
    );
    assert(
      read.content.value.content[1].content[0].marks.some(
        (m) => m.type === 'underline'
      )
    );
    assert(a.history(av, 'undo'));
    assert(!formattingState(av.state).underline);
    assert(formattingState(av.state).italic);
    assert.equal(av.state.doc.child(1).attrs.background, 'blue');
    await a.flush();
  }
  const b = await x.open('format_reopen'),
    bv = x.mount(b);
  assert.deepEqual(bv.state.doc.toJSON(), av.state.doc.toJSON());
});
test('69 selection formatting preserves reference/date/break atoms without unsupported mark metadata', async (t) => {
  const x = await seeded(t),
    content = body('');
  content.value.content[1].content = [
    { type: 'text', text: 'Before ' },
    { type: 'note_reference', attrs: { pageId: 'ref', label: 'Reference' } },
    { type: 'date', attrs: { value: '2026-11-17' } },
    { type: 'hard_break' },
    { type: 'text', text: 'After' },
  ];
  ok(
    await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      method: 'page.update',
      operationId: x.next(),
      expectedHead: x.v.load('p').head,
      patch: { content },
    })
  );
  const a = await x.open('format_atoms'),
    av = x.mount(a);
  selectBodyText(av, 0, av.state.doc.child(1).content.size);
  av.dispatch(createFormattingTransaction(av.state, 'bold'));
  for (const node of av.state.doc.child(1).content.content)
    assert.equal(node.marks.length, node.isText ? 1 : 0);
  await a.flush();
  const saved = ok(await x.read());
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        saved.content.value.content[1].content.filter((n) => n.type !== 'text')
      )
    ),
    content.value.content[1].content.filter((n) => n.type !== 'text')
  );
});
test('69 raw Y updates cannot sneak unknown marks, custom colours or title formatting past accepted validation', async (t) => {
  const x = await seeded(t),
    opened = ok(
      await x.run({
        apiVersion: 1,
        spaceId: x.v.spaceId,
        pageId: 'p',
        contextId: 'format_attack',
        method: 'editor.open',
      })
    );
  for (const [i, mutate] of [
    (fragment) => fragment.get(1).get(0).format(0, 1, { unknown: {} }),
    (fragment) =>
      fragment
        .get(1)
        .get(0)
        .format(0, 1, { text_color: { preset: '#000' } }),
    (fragment) =>
      fragment
        .get(1)
        .get(0)
        .format(0, 1, { link: { href: 'javascript:alert(1)' } }),
    (fragment) => fragment.get(1).setAttribute('background', 'not-preset'),
    (fragment) => {
      const text = new Y.XmlText();
      text.insert(0, 'Title', { bold: {} });
      fragment.get(0).insert(0, [text]);
    },
  ].entries()) {
    const d = decode({
        pageId: 'p',
        kind: 'notes',
        bytes: fromBase64(opened.payload),
        hash: opened.head,
      }),
      vector = Y.encodeStateVector(d);
    mutate(d.getMap('page').get('content'));
    const update = toBase64(Y.encodeStateAsUpdate(d, vector));
    d.destroy();
    const result = await x.run({
      apiVersion: 1,
      spaceId: x.v.spaceId,
      pageId: 'p',
      contextId: 'format_attack',
      grant: opened.grant,
      baseHead: opened.head,
      operationId: 'format-bad-' + i,
      method: 'editor.apply',
      generation: 1,
      update,
    });
    assert.equal(result.ok, false);
    assert.equal(ok(await x.read()).head, opened.head);
  }
});

const { BodyBlockSelection, selectBodyBlocks } =
  await import('../../editor/src/body-selection.mjs');
for (const modifier of ['metaKey', 'ctrlKey'])
  test(`71 ${modifier} first selects current body block text, second selects body IDs only; title stays isolated`, async (t) => {
    const x = await seededList(t, [
        { id: 'one', type: 'paragraph', text: 'First' },
        { id: 'two', type: 'heading', text: 'Second' },
        { id: 'sep', type: 'separator' },
      ]),
      { av, a } = x;
    // Make title nonempty so exclusion is observable in text and copied content.
    av.dispatch(av.state.tr.insertText('Title', 1));
    a.stopCapturing();
    rowAt(av, 'two', 3);
    const before = av.state.doc.toJSON();
    assert(keydown(av, 'a', { [modifier]: true }).defaultPrevented);
    assert(av.state.selection instanceof TextSelection);
    assert.equal(av.state.selection.$from.parent.attrs.blockId, 'two');
    assert.equal(
      av.state.doc.textBetween(av.state.selection.from, av.state.selection.to),
      'Second'
    );
    keydown(av, 'a', { [modifier]: true });
    assert(av.state.selection instanceof BodyBlockSelection);
    assert.deepEqual(av.state.selection.ids, ['one', 'two', 'sep']);
    assert.equal(av.state.selection.visible, false);
    assert.equal(av.dom.querySelectorAll('.selected-body-block').length, 3);
    assert(
      !av.dom
        .querySelector('h1[data-title]')
        .classList.contains('selected-body-block')
    );
    assert(
      !av.state.selection
        .content()
        .content.textBetween(0, av.state.selection.content().content.size)
        .includes('Title')
    );
    keydown(av, 'Escape');
    assert(av.state.selection instanceof BodyBlockSelection);
    assert.deepEqual(av.state.selection.ids, []);
    assert.equal(av.state.selection.visible, false);
    assert.equal(av.dom.querySelectorAll('.selected-body-block').length, 0);
    assert(keydown(av, 'x').defaultPrevented);
    keydown(av, 'Enter');
    av.dom.dispatchEvent(
      new dom.window.InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: 'X',
      })
    );
    assert.deepEqual(av.state.doc.toJSON(), before);
    av.dispatch(
      av.state.tr.setSelection(TextSelection.create(av.state.doc, 2))
    );
    for (let n = 0; n < 3; n++) {
      keydown(av, 'a', { [modifier]: true });
      assert(av.state.selection instanceof TextSelection);
      assert.equal(av.state.selection.from, 1);
      assert.equal(av.state.selection.to, 6);
    }
    await a.flush();
  });
test('71 empty body needs two select-all presses and ordinary click restores exact text caret', async (t) => {
  const x = await seeded(t),
    a = await x.open('empty-select'),
    av = x.mount(a);
  bodyInput(av, '');
  rowAt(av, 'paragraph-1');
  keydown(av, 'a', { metaKey: true });
  assert(av.state.selection instanceof TextSelection);
  keydown(av, 'a', { metaKey: true });
  assert.deepEqual(av.state.selection.ids, ['paragraph-1']);
  const pos = av.state.doc.firstChild.nodeSize + 1;
  assert(
    av.someProp('handleClick', (handler) =>
      handler(av, pos, new dom.window.MouseEvent('click', { button: 0 }))
    )
  );
  assert(av.state.selection instanceof TextSelection);
  assert.equal(av.state.selection.from, pos);
  av.dispatch(av.state.tr.insertText('Typing'));
  await a.flush();
  assert.equal(
    ok(await x.read()).content.value.content[1].content[0].text,
    'Typing'
  );
});
test('71 disjoint explicit deletion preserves unselected descendants/indent, title and formats with Undo/Redo', async (t) => {
  const x = await seededList(t, [
      { id: 'parent', text: 'Parent' },
      { id: 'child', text: 'Child', indent: 1, parent: 'parent' },
      { id: 'grandchild', text: 'Grandchild', indent: 2, parent: 'child' },
      { id: 'unrelated', text: 'Keep' },
    ]),
    { av, a } = x;
  rowAt(av, 'grandchild');
  const markStart = av.state.selection.from;
  av.dispatch(
    av.state.tr.setSelection(
      TextSelection.create(av.state.doc, markStart, markStart + 10)
    )
  );
  av.dispatch(createFormattingTransaction(av.state, 'background', 'purple'));
  av.dispatch(selectBodyBlocks(av.state, ['parent', 'child', 'title']));
  assert.deepEqual(av.state.selection.ids, ['parent', 'child']);
  const copied = av.state.selection.content().content;
  assert.equal(copied.childCount, 2);
  assert.equal(copied.child(0).textContent, 'Parent');
  const before = av.state.doc.toJSON();
  keydown(av, 'Delete');
  assert.deepEqual(
    listRows(av).map((r) => r.id),
    ['grandchild', 'unrelated']
  );
  assert.equal(av.state.doc.child(1).attrs.indent, 2);
  assert.equal(av.state.doc.child(1).attrs.background, 'purple');
  assert.equal(av.state.doc.child(1).attrs.parentId, null);
  assert(av.state.selection instanceof BodyBlockSelection);
  assert.deepEqual(av.state.selection.ids, []);
  await a.flush();
  assert(a.history(av, 'undo'));
  assert.deepEqual(av.state.doc.toJSON(), before);
  assert(av.state.selection instanceof BodyBlockSelection);
  assert.deepEqual(av.state.selection.ids, ['parent', 'child']);
  assert(a.history(av, 'redo'));
  await a.flush();
  // A second operation proves noncontiguous membership/copy/delete does not
  // sweep the rows between explicit IDs into the selected set.
  assert(a.history(av, 'undo'));
  av.dispatch(selectBodyBlocks(av.state, ['unrelated', 'parent', 'title']));
  assert.deepEqual(av.state.selection.ids, ['parent', 'unrelated']);
  const disjoint = av.state.selection.content().content;
  assert.deepEqual(
    [disjoint.child(0).textContent, disjoint.child(1).textContent],
    ['Parent', 'Keep']
  );
  keydown(av, 'Delete');
  await a.flush();
  assert.deepEqual(
    listRows(av).map((row) => row.id),
    ['child', 'grandchild']
  );
  assert.equal(av.state.doc.child(1).attrs.parentId, null);
  assert.equal(av.state.doc.child(2).attrs.parentId, 'child');
  assert.equal(av.state.doc.child(2).attrs.background, 'purple');
  for (const mode of ['cli', 'mcp']) {
    const read = ok(
      await peerCommand67(x, mode, {
        apiVersion: 1,
        method: 'page.read',
        spaceId: x.v.spaceId,
        pageId: 'p',
      })
    );
    assert.equal(read.content.value.content[0].type, 'title');
    assert.deepEqual(
      read.content.value.content.slice(1).map((n) => n.attrs.blockId),
      ['child', 'grandchild']
    );
  }
});
test('71 deleting all body blocks retains one empty paragraph and never deletes title', async (t) => {
  const x = await seeded(t),
    a = await x.open('all-delete'),
    av = x.mount(a);
  av.dispatch(av.state.tr.insertText('Title', 1));
  rowAt(av, 'paragraph-1');
  keydown(av, 'a', { ctrlKey: true });
  keydown(av, 'a', { ctrlKey: true });
  keydown(av, 'Backspace');
  assert.equal(av.state.doc.firstChild.textContent, 'Title');
  assert.equal(av.state.doc.childCount, 2);
  assert.equal(av.state.doc.child(1).type.name, 'paragraph');
  assert.equal(av.state.doc.child(1).textContent, '');
  assert(av.state.selection instanceof BodyBlockSelection);
  assert.equal(av.state.selection.visible, false);
  await a.flush();
});
test('71 peer writes map explicit selection by stable IDs and removal does not leak selection into title', async (t) => {
  const x = await seededList(t, [
      { id: 'one', type: 'paragraph', text: 'First' },
      { id: 'two', type: 'paragraph', text: 'Second' },
    ]),
    { av, a } = x;
  av.dispatch(selectBodyBlocks(av.state, ['one', 'two']));
  const content = body('Peer');
  content.value.content[1].attrs.blockId = 'two';
  ok(
    await peerCommand67(x, 'mcp', {
      apiVersion: 1,
      method: 'page.update',
      spaceId: x.v.spaceId,
      pageId: 'p',
      operationId: x.next(),
      expectedHead: x.v.load('p').head,
      patch: { content },
    })
  );
  await settle(a);
  assert(av.state.selection instanceof BodyBlockSelection);
  assert.deepEqual(av.state.selection.ids, ['two']);
  assert.equal(av.state.doc.firstChild.type.name, 'title');
  const read = ok(await x.read());
  assert.equal(JSON.stringify(read).includes('body-blocks'), false);
  // Empty/suspended selection also remains view-local through remote transactions.
  keydown(av, 'Escape');
  assert.deepEqual(av.state.selection.ids, []);
  await a.flush();
});
test('71 read-only deletion and beforeinput guards prevent block replacement', async (t) => {
  const { bodyBlockInteractions } =
    await import('../../editor/src/block-selection.mjs');
  const x = await seeded(t),
    a = await x.open('selection-guards'),
    av = x.mount(a);
  av.dispatch(selectBodyBlocks(av.state, ['paragraph-1']));
  const before = av.state.doc.toJSON();
  const locked = bodyBlockInteractions({
    canEdit: () => false,
    nextId: x.next,
  });
  assert(
    locked.props.handleKeyDown(
      av,
      new dom.window.KeyboardEvent('keydown', { key: 'Delete' })
    )
  );
  assert.deepEqual(av.state.doc.toJSON(), before);
  const beforeInput = new dom.window.InputEvent('beforeinput', {
    inputType: 'insertText',
    data: 'X',
    cancelable: true,
  });
  assert(locked.props.handleDOMEvents.beforeinput(av, beforeInput));
  assert(beforeInput.defaultPrevented);
  const cut = new dom.window.Event('cut', { cancelable: true });
  assert(locked.props.handleDOMEvents.cut(av, cut));
  assert(cut.defaultPrevented);
  assert(locked.props.handleDrop(av));
  assert(locked.props.handlePaste(av));
});

test('72 selection-only body mode updates do not roundtrip through a temporary AllSelection', async (t) => {
  const x = await seeded(t),
    a = await x.open('selection-only72'),
    av = x.mount(a);
  const original = av.props.dispatchTransaction,
    transitions = [];
  av.setProps({
    dispatchTransaction(tr) {
      transitions.push(tr.selection.constructor.name);
      original.call(this, tr);
    },
  });
  av.dispatch(selectBodyBlocks(av.state, ['paragraph-1']));
  keydown(av, 'Escape');
  assert(av.state.selection instanceof BodyBlockSelection);
  assert.deepEqual(av.state.selection.ids, []);
  assert(
    !transitions.includes('AllSelection'),
    'pure selection updates must not normalize through whole-document selection'
  );
  assert.deepEqual(transitions, ['BodyBlockSelection', 'BodyBlockSelection']);
  const before = ok(await x.read()).head;
  await a.flush();
  assert.equal(ok(await x.read()).head, before);
});
test('75 body pointer reentry restores editable focus before mouse-up without content changes', async (t) => {
  const x = await seeded(t),
    a = await x.open('caret72'),
    av = x.mount(a);
  av.focus();
  rowAt(av, 'paragraph-1');
  keydown(av, 'a', { metaKey: true });
  keydown(av, 'a', { metaKey: true });
  keydown(av, 'Delete');
  assert(av.state.selection instanceof BodyBlockSelection);
  assert.equal(av.state.selection.visible, false);
  await a.flush();
  const before = ok(await x.read()),
    transitions = [],
    focusChanges = [],
    original = av.props.dispatchTransaction,
    hitTest = av.posAtCoords;
  av.dom.addEventListener('blur', () => focusChanges.push('blur'));
  av.dom.addEventListener('focus', () => {
    focusChanges.push(av.editable ? 'editable focus' : 'inactive focus');
  });
  av.setProps({
    dispatchTransaction(tr) {
      transitions.push(tr.selection.constructor.name);
      original.call(this, tr);
    },
  });
  // Model the public hit-test returning the end boundary when clicking an empty paragraph,
  // which must resolve to that body paragraph, never back into the title.
  av.posAtCoords = () => ({ pos: av.state.doc.content.size, inside: -1 });
  try {
    for (const mode of ['focused inactive', 'unfocused inactive', 'selected']) {
      if (mode === 'unfocused inactive') {
        av.dispatch(selectBodyBlocks(av.state, []));
        av.dom.blur();
      } else if (mode === 'selected') {
        av.dispatch(
          selectBodyBlocks(av.state, [av.state.doc.child(1).attrs.blockId])
        );
      }
      transitions.length = 0;
      focusChanges.length = 0;
      av.dom.querySelector('p').dispatchEvent(
        new dom.window.MouseEvent('mousedown', {
          button: 0,
          bubbles: true,
          cancelable: true,
          clientX: 20,
          clientY: 40,
        })
      );
      assert(
        av.state.selection instanceof TextSelection,
        'restore on down, not after mouse-up'
      );
      assert.equal(av.state.selection.$from.parent.type.name, 'paragraph');
      assert.equal(av.state.selection.$from.parentOffset, 0);
      assert.equal(av.state.selection.visible, true);
      assert.equal(av.dom.getAttribute('contenteditable'), 'true');
      assert(av.hasFocus());
      assert(!av.dom.hasAttribute('data-body-selection'));
      assert(!av.dom.classList.contains('body-selection-mode'));
      assert(!av.dom.classList.contains('ProseMirror-hideselection'));
      assert.deepEqual(transitions, ['TextSelection']);
      assert.deepEqual(
        focusChanges,
        mode === 'focused inactive'
          ? ['blur', 'editable focus']
          : mode === 'unfocused inactive'
            ? ['editable focus']
            : []
      );
      av.dom.querySelector('p').dispatchEvent(
        new dom.window.MouseEvent('mouseup', {
          button: 0,
          bubbles: true,
          cancelable: true,
          clientX: 20,
          clientY: 40,
        })
      );
      assert(av.state.selection instanceof TextSelection);
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert(av.state.selection instanceof TextSelection);
      assert(!av.dom.classList.contains('body-selection-mode'));
    }
    for (const mode of ['cli', 'mcp']) {
      const read = ok(
        await peerCommand67(x, mode, {
          apiVersion: 1,
          method: 'page.read',
          spaceId: x.v.spaceId,
          pageId: 'p',
        })
      );
      assert.equal(read.head, before.head);
      assert.equal(read.content.value.content[1].type, 'paragraph');
      assert.equal(read.content.value.content[1].content, undefined);
    }
    av.dispatch(av.state.tr.insertText('Immediate typing'));
    await a.flush();
    assert.equal(
      ok(await x.read()).content.value.content[1].content[0].text,
      'Immediate typing'
    );
  } finally {
    av.posAtCoords = hitTest;
  }
});

test('74 inactive body stays noneditable through accepted save and real MCP reconciliation', async (t) => {
  const x = await seeded(t),
    a = await x.open('inactive74'),
    av = x.mount(a);
  av.focus();
  rowAt(av, 'paragraph-1');
  keydown(av, 'a', { metaKey: true });
  keydown(av, 'a', { metaKey: true });
  keydown(av, 'Delete');
  assert.equal(av.dom.getAttribute('contenteditable'), 'false');
  assert.equal(av.dom.getAttribute('tabindex'), '0');
  const original = av.props.dispatchTransaction,
    states = [];
  av.setProps({
    dispatchTransaction(tr) {
      original.call(this, tr);
      states.push({
        selection: av.state.selection.constructor.name,
        editable: av.dom.getAttribute('contenteditable'),
        mode: av.dom.hasAttribute('data-body-selection'),
      });
    },
  });
  await a.flush();
  const content = body('Remote while inactive');
  ok(
    await peerCommand67(x, 'mcp', {
      apiVersion: 1,
      method: 'page.update',
      spaceId: x.v.spaceId,
      pageId: 'p',
      operationId: x.next(),
      expectedHead: x.v.load('p').head,
      patch: { content },
    })
  );
  await settle(a);
  assert(states.length > 0);
  assert(
    states.some((s) => s.selection === 'BodySelectionShield'),
    'exercise actual Y guard'
  );
  assert(
    states.every((s) => s.mode && s.editable === 'false'),
    JSON.stringify(states)
  );
  assert(av.state.selection instanceof BodyBlockSelection);
  assert.deepEqual(av.state.selection.ids, []);
  assert.equal(text(av), 'Remote while inactive');
  const cli = ok(
    await peerCommand67(x, 'cli', {
      apiVersion: 1,
      method: 'page.read',
      spaceId: x.v.spaceId,
      pageId: 'p',
    })
  );
  assert.equal(cli.head, ok(await x.read()).head);
  assert(!JSON.stringify(cli).includes('BodySelectionShield'));
});

test('74 inactive body retains keyboard commands and copy remains body-only', async (t) => {
  const x = await seeded(t),
    a = await x.open('keyboard74'),
    av = x.mount(a);
  av.dispatch(av.state.tr.insertText('Private title', 1));
  av.focus();
  rowAt(av, 'paragraph-1');
  keydown(av, 'a', { ctrlKey: true });
  keydown(av, 'a', { ctrlKey: true });
  const copied = new Map(),
    copy = new dom.window.Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(copy, 'clipboardData', {
    value: {
      clearData() {
        copied.clear();
      },
      setData(type, value) {
        copied.set(type, value);
      },
    },
  });
  av.dom.dispatchEvent(copy);
  assert.equal(copied.get('text/plain'), 'Alpha beta');
  assert(!copied.get('text/html').includes('Private title'));
  keydown(av, 'Delete');
  assert.equal(av.editable, false);
  assert(av.hasFocus());
  assert(keydown(av, 'a', { ctrlKey: true }).defaultPrevented);
  assert(av.state.selection instanceof BodyBlockSelection);
  assert.equal(av.state.selection.ids.length, 1);
  keydown(av, 'Escape');
  assert.equal(av.editable, false);
  assert.deepEqual(av.state.selection.ids, []);
  keydown(av, 'z', { ctrlKey: true });
  assert.equal(text(av), 'Alpha beta');
  keydown(av, 'z', { ctrlKey: true, shiftKey: true });
  assert.equal(text(av), '');
  assert.equal(av.state.doc.firstChild.textContent, 'Private title');
  await a.flush();
});

test('79 marquee leaves same-block text drag native, hits touching blocks and replaces selection with Shift held', async (t) => {
  const x = await seededList(t, [
    { id: 'parent', text: 'Parent' },
    { id: 'child', text: 'Child', indent: 1, parent: 'parent' },
    { id: 'third', text: 'Third' },
    { id: 'fourth', text: 'Fourth' },
  ]);
  const { av, a } = x;
  const el = (id) => av.dom.querySelector(`[data-block-id="${id}"]`);
  const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
  av.dom.getBoundingClientRect = () => rect(0, 0, 200, 230);
  for (const [id, box] of [
    ['title', rect(10, 10, 190, 40)],
    ['parent', rect(10, 60, 190, 80)],
    ['child', rect(40, 95, 190, 115)],
    ['third', rect(10, 130, 190, 150)],
    ['fourth', rect(10, 170, 190, 190)],
  ]) {
    el(id).getBoundingClientRect = () => box;
  }
  // PM uses its ordinary hit-test on mousedown. Provide synthetic geometry for
  // its coordinates as well as the DOM boxes used by marquee.
  av.posAtCoords = ({ top }) => {
    let pos = 0;
    const index =
      top < 50 ? 0 : top < 90 ? 1 : top < 120 ? 2 : top < 160 ? 3 : 4;
    for (let i = 0; i < index; i++) pos += av.state.doc.child(i).nodeSize;
    return { pos: pos + 1, inside: pos };
  };
  function mouse(type, target, x, y, extra = {}) {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      detail: 1,
      buttons: type === 'mousedown' || type === 'mousemove' ? 1 : 0,
      clientX: x,
      clientY: y,
      ...extra,
    });
    target.dispatchEvent(event);
    return event;
  }
  const selected = () =>
    Array.from(
      av.dom.querySelectorAll('.selected-body-block'),
      (node) => node.dataset.blockId
    );
  const overlay = () => document.querySelector('.body-marquee');
  const before = ok(await x.read());

  rowAt(av, 'parent');
  mouse('mousedown', el('parent'), 20, 65);
  assert.equal(
    mouse('mousemove', el('parent'), 60, 70).defaultPrevented,
    false
  );
  assert(av.state.selection instanceof TextSelection);
  assert(!overlay());
  mouse('mousemove', av.dom, 35, 95);
  assert.deepEqual(
    selected(),
    ['parent'],
    'the indented child is outside the rectangle'
  );
  assert(overlay());
  mouse('mousemove', el('child'), 40, 95);
  assert.deepEqual(
    selected(),
    ['parent', 'child'],
    'edge contact is sufficient'
  );
  mouse('mousemove', av.dom, 35, 91);
  assert.deepEqual(selected(), ['parent'], 'moving off the child removes it');
  mouse('mouseup', av.dom, 35, 91);
  assert(!overlay());
  assert(mouse('click', av.dom, 35, 91).defaultPrevented);
  assert.deepEqual(selected(), ['parent']);

  mouse('mousedown', el('fourth'), 20, 180, { shiftKey: true });
  mouse('mousemove', el('fourth'), 30, 180, { shiftKey: true });
  assert(!overlay());
  mouse('mousemove', av.dom, 30, 150, { shiftKey: true });
  assert.deepEqual(selected(), ['third', 'fourth']);
  mouse('mousemove', av.dom, 30, 157, { shiftKey: true });
  assert.deepEqual(selected(), ['fourth']);
  mouse('mouseup', av.dom, 30, 157, { shiftKey: true });
  assert(!overlay());
  av.dispatch(selectBodyBlocks(av.state, ['parent', 'fourth']));

  for (const mode of ['cli', 'mcp']) {
    const read = ok(
      await peerCommand67(x, mode, {
        apiVersion: 1,
        method: 'page.read',
        spaceId: x.v.spaceId,
        pageId: 'p',
      })
    );
    assert.equal(read.head, before.head);
    assert.deepEqual(read.content, JSON.parse(JSON.stringify(before.content)));
  }
  keydown(av, 'Delete');
  await a.flush();
  assert.deepEqual(
    av.state.doc
      .toJSON()
      .content.slice(1)
      .map((n) => n.attrs.blockId),
    ['child', 'third']
  );
  assert.equal(av.state.doc.child(1).attrs.indent, 1);
  assert.equal(av.state.doc.child(1).attrs.parentId, null);
});

test('79 marquee can start on title and whitespace, and Escape cancels an active drag', async (t) => {
  const x = await seeded(t),
    a = await x.open('marquee79'),
    av = x.mount(a);
  const [title, body] = av.dom.children;
  av.dom.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 200,
    bottom: 200,
  });
  title.getBoundingClientRect = () => ({
    left: 10,
    top: 10,
    right: 190,
    bottom: 40,
  });
  body.getBoundingClientRect = () => ({
    left: 10,
    top: 60,
    right: 190,
    bottom: 90,
  });
  av.posAtCoords = ({ top }) =>
    top < 50
      ? { pos: 1, inside: 0 }
      : {
          pos: av.state.doc.firstChild.nodeSize + 1,
          inside: av.state.doc.firstChild.nodeSize,
        };
  av.focus();
  const dispatch = (target, type, y, buttons = 1) =>
    target.dispatchEvent(
      new dom.window.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        buttons,
        clientX: 20,
        clientY: y,
        detail: 1,
      })
    );
  dispatch(title, 'mousedown', 30);
  dispatch(body, 'mousemove', 70);
  assert.deepEqual(av.state.selection.ids, ['paragraph-1']);
  assert(!title.classList.contains('selected-body-block'));
  keydown(av, 'Escape');
  assert(!document.querySelector('.body-marquee'));
  dispatch(body, 'mousemove', 80);
  dispatch(body, 'mouseup', 80, 0);
  assert.deepEqual(av.state.selection.ids, []);
  dispatch(av.dom, 'mousedown', 110);
  dispatch(body, 'mousemove', 90);
  assert.deepEqual(av.state.selection.ids, ['paragraph-1']);
  av.destroy();
  assert(!document.querySelector('.body-marquee'));
  dispatch(document.body, 'mousemove', 70);
  assert(!document.querySelector('.body-marquee'));
});

for (const [platform, modifier] of [
  ['MacIntel', 'metaKey'],
  ['Win32', 'ctrlKey'],
])
  test(`82 ${platform} primary modifier toggles mixed hits from a fixed baseline`, async (t) => {
    const nav = dom.window.navigator;
    Object.defineProperty(nav, 'platform', {
      configurable: true,
      value: platform,
    });
    t.after(() => Reflect.deleteProperty(nav, 'platform'));
    const x = await seededList(t, [
      { id: 'one', text: 'One' },
      { id: 'two', text: 'Two' },
      { id: 'three', text: 'Three' },
    ]);
    const { av } = x;
    const before = ok(await x.read());
    av.posAtCoords = () => ({
      pos: av.state.doc.firstChild.nodeSize + 1,
      inside: av.state.doc.firstChild.nodeSize,
    });
    const canvas = av.dom.parentElement;
    canvas.setAttribute('data-block-selection-canvas', '');
    const outside = document.body.appendChild(document.createElement('button'));
    const [title, one, two, three] = av.dom.children;
    const bounds = (top, bottom) => ({ left: 40, right: 190, top, bottom });
    av.dom.getBoundingClientRect = () => bounds(10, 210);
    title.getBoundingClientRect = () => bounds(10, 30);
    one.getBoundingClientRect = () => bounds(50, 80);
    two.getBoundingClientRect = () => bounds(100, 130);
    three.getBoundingClientRect = () => bounds(150, 180);
    function mouse(type, target, x, y, modified = false, button = 0) {
      const event = new dom.window.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        buttons: ['mousedown', 'mousemove'].includes(type) ? 1 : 0,
        clientX: x,
        clientY: y,
        detail: 1,
        [modifier]: modified,
        button,
      });
      target.dispatchEvent(event);
      return event;
    }
    mouse('mousedown', one, 55, 60, true);
    assert(mouse('mousemove', one, 75, 68, true).defaultPrevented);
    assert.deepEqual(av.state.selection.ids, ['one']);
    mouse('mousemove', two, 75, 115, true);
    assert.deepEqual(av.state.selection.ids, ['one', 'two']);
    mouse('mouseup', two, 75, 115, true);
    assert.deepEqual(av.state.selection.ids, ['one', 'two']);

    // Outside the PM root, in the note canvas padding.
    mouse('mousedown', canvas, 10, 45);
    mouse('mousemove', three, 70, 160);
    mouse('mouseup', three, 70, 160);
    assert.deepEqual(av.state.selection.ids, ['one', 'two', 'three']);

    assert(mouse('mousedown', two, 55, 115, true).defaultPrevented);
    mouse('mouseup', two, 55, 115, true);
    assert(mouse('click', two, 55, 115, true).defaultPrevented);
    assert.deepEqual(av.state.selection.ids, ['one', 'three']);
    mouse('mousedown', canvas, 10, 45, true);
    mouse('mousemove', three, 70, 160, true);
    assert.deepEqual(av.state.selection.ids, ['two']);
    mouse('mousemove', two, 70, 120, true);
    assert.deepEqual(
      av.state.selection.ids,
      ['two', 'three'],
      'retreat restores blocks according to their original state'
    );
    mouse('mouseup', two, 70, 120, true);
    assert.deepEqual(av.state.selection.ids, ['two', 'three']);

    mouse('mousedown', outside, 10, 45);
    mouse('mousemove', one, 70, 60);
    mouse('mouseup', one, 70, 60);
    assert.deepEqual(
      av.state.selection.ids,
      ['two', 'three'],
      'app chrome starts no gesture'
    );
    mouse('mousedown', one, 55, 60, false, 2);
    assert.equal(
      mouse('contextmenu', one, 55, 60, false, 2).defaultPrevented,
      false
    );
    assert(mouse('mousedown', av.dom, 55, 140).defaultPrevented);
    mouse('mouseup', av.dom, 55, 140);
    assert(mouse('click', av.dom, 55, 140).defaultPrevented);
    assert.deepEqual(av.state.selection.ids, []);
    assert.equal(av.state.selection.visible, false);
    assert(!av.hasFocus(), 'blank click dismisses the editor focus');
    assert(!document.querySelector('.body-marquee'));
    mouse('mousedown', one, 55, 60, true);
    mouse('mouseup', one, 55, 60, true);
    assert.deepEqual(av.state.selection.ids, ['one']);
    for (const mode of ['cli', 'mcp']) {
      const read = ok(
        await peerCommand67(x, mode, {
          apiVersion: 1,
          method: 'page.read',
          spaceId: x.v.spaceId,
          pageId: 'p',
        })
      );
      assert.equal(read.head, before.head);
      assert.deepEqual(
        read.content,
        JSON.parse(JSON.stringify(before.content))
      );
    }
  });
