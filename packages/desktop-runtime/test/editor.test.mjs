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
const { TextSelection } = await import('prosemirror-state');
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
      content: body(),
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
async function stdio(x, mode, input) {
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
test('3A multiline title paste appends every line, has no caret, persists highlight until any click, and undoes once', async (t) => {
  const x = await seeded(t),
    a = await x.open('title_paste'),
    av = x.mount(a);
  av.dispatch(av.state.tr.insertText('Keep', 1));
  a.stopCapturing();
  av.focus();
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
    if (this.classList.contains('pasted-block')) scrolled = true;
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
    ['Alpha beta', 'first', '', 'last', '']
  );
  assert.equal(av.hasFocus(), false);
  assert(av.dom.classList.contains('paste-feedback'));
  assert.equal(av.dom.querySelectorAll('.pasted-block').length, 4);
  assert(scrolled);
  await a.flush();
  await settle(a);
  assert.equal(
    av.dom.querySelectorAll('.pasted-block').length,
    4,
    'saving does not dismiss feedback'
  );
  const saved = ok(await x.read());
  assert(!JSON.stringify(saved.content).includes('pasted-block'));
  document.body.dispatchEvent(
    new dom.window.Event('pointerdown', { bubbles: true })
  );
  assert.equal(av.dom.querySelectorAll('.pasted-block').length, 0);
  assert.equal(av.dom.classList.contains('paste-feedback'), false);
  assert.equal(a.history(av, 'undo'), true);
  assert.equal(av.state.doc.firstChild.textContent, 'Keep');
  assert.equal(text(av), 'Alpha beta');
  a.history(av, 'redo');
  assert.equal(av.state.doc.childCount, 6);
});
test('3A single-line title paste inserts normally without body append or paste feedback', async (t) => {
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
  assert(!av.dom.classList.contains('paste-feedback'));
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
  test(`61 slash H${level} preserves prefix/suffix, inserts empty heading and retains original caret/history`, async (t) => {
    const x = await seeded(t),
      a = await x.open('heading_' + level),
      av = x.mount(a);
    av.focus();
    bodyInput(av, 'before/h' + level + 'after', 9);
    a.stopCapturing();
    assert.equal(keydown(av, 'Enter').defaultPrevented, true);
    assert.equal(av.state.doc.child(1).textContent, 'before');
    assert.equal(av.state.doc.child(2).type.name, 'heading');
    assert.equal(av.state.doc.child(2).attrs.level, level);
    assert.equal(av.state.doc.child(2).textContent, '');
    assert.equal(av.state.doc.child(3).textContent, 'after');
    assert.equal(
      av.state.selection.$from.parent.attrs.blockId,
      av.state.doc.child(1).attrs.blockId
    );
    assert.equal(av.state.selection.$from.parentOffset, 6);
    assert.equal(av.hasFocus(), true);
    await a.flush();
    await settle(a);
    assert.equal(
      ok(await x.read()).content.value.content[2].attrs.level,
      level
    );
    assert.equal(a.history(av, 'undo'), true);
    assert.equal(text(av), 'before/h' + level + 'after');
    assert.equal(av.state.doc.childCount, 2);
    assert.equal(a.history(av, 'redo'), true);
    assert.equal(av.state.doc.child(2).attrs.level, level);
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
  assert.equal(menu().items.length, 8);
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
    Array.from({ length: 3 }, (_, i) => av.state.doc.child(i + 1).textContent),
    ['prefix', '', 'suffix']
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
  const pos =
    av.state.doc.firstChild.nodeSize + av.state.doc.child(1).nodeSize + 1;
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
  const pos =
    bv.state.doc.firstChild.nodeSize + bv.state.doc.child(1).nodeSize + 1;
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
  test(`63 separator below nonempty H${level} retains its type, complete text and original caret`, async (t) => {
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
    assert.equal(av.state.selection.$from.parent.attrs.blockId, id);
    assert.equal(av.state.selection.$from.parentOffset, 6);
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
test('63 separator above an empty command block retains it with no extra blank block or caret jump', async (t) => {
  for (const following of ['none', 'paragraph', 'heading']) {
    const x = await seeded(t),
      a = await x.open('separator_' + following),
      av = x.mount(a);
    if (following !== 'none')
      av.dispatch(
        av.state.tr.insert(
          av.state.doc.content.size,
          av.state.schema.nodes[following].create(
            {
              blockId: 'existing-after',
              indent: 0,
              parentId: null,
              ...(following === 'heading' ? { level: 2 } : {}),
            },
            av.state.schema.text('Existing')
          )
        )
      );
    av.focus();
    bodyInput(av, '/separator');
    a.stopCapturing();
    const id = av.state.doc.child(1).attrs.blockId;
    keydown(av, 'Enter');
    assert.equal(av.state.doc.child(1).type.name, 'separator');
    assert.equal(av.state.doc.child(2).type.name, 'paragraph');
    assert.equal(av.state.doc.child(2).attrs.blockId, id);
    assert.equal(av.state.doc.child(2).textContent, '');
    assert.equal(av.state.selection.$from.parent.attrs.blockId, id);
    assert.equal(av.state.selection.$from.parentOffset, 0);
    assert.equal(av.state.doc.childCount, following === 'none' ? 3 : 4);
    if (following !== 'none') {
      assert.equal(av.state.doc.child(3).attrs.blockId, 'existing-after');
      assert.equal(av.state.doc.child(3).type.name, following);
    }
    av.dispatch(av.state.tr.insertText('Typing stays here'));
    assert.equal(av.state.doc.child(2).textContent, 'Typing stays here');
    await a.flush();
  }
});
