import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextSelection } from 'prosemirror-state';
import { Authority, MemoryStore } from '../src/authority.mjs';
import { Context, settle } from '../src/context.mjs';
import { fixture, textPosition, schema } from '../src/schema.mjs';
import { execute } from '../src/api.mjs';
import { FileStore } from '../src/file-store.mjs';

const rig = () => {
  const store = new MemoryStore(),
    a = new Authority(fixture(), store);
  return { store, a, A: new Context(a, 'A'), B: new Context(a, 'B') };
};
const first = (doc) => doc.firstChild.textContent;
const insertAt = (c, text, needle, offset = 0) =>
  c.insert(text, textPosition(c.state.doc, needle, offset));
const external = (a, text, id = 'api-1', target = 'Alpha') =>
  execute(a, { method: 'insert', id, version: a.version, text, target });
const directories = [];
after(() => {
  for (const dir of directories) rmSync(dir, { recursive: true, force: true });
});
function temp() {
  const dir = mkdtempSync(join(tmpdir(), 'clutter-r07-'));
  directories.push(dir);
  return dir;
}

test('A and B converge while maintaining independent mapped selections', () => {
  const { a, A, B } = rig();
  B.apply(
    B.state.tr.setSelection(
      TextSelection.create(B.state.doc, textPosition(B.state.doc, 'Gamma', 2))
    )
  );
  const old = B.state.selection.from;
  insertAt(A, 'X', 'Alpha');
  settle(A, B);
  assert.equal(first(a.doc), 'XAlpha beta');
  assert.equal(B.state.selection.from, old + 1);
  assert.notEqual(A.state.selection.from, B.state.selection.from);
  assert.ok(A.state.doc.eq(B.state.doc));
});
test('concurrent insertions at exactly the same position preserve both origins', () => {
  for (const reversed of [false, true]) {
    const { a, A, B } = rig();
    insertAt(A, 'X', 'Alpha');
    insertAt(B, 'Y', 'Alpha');
    settle(...(reversed ? [B, A] : [A, B]));
    assert.ok(['XYAlpha beta', 'YXAlpha beta'].includes(first(a.doc)));
    assert.ok(A.state.doc.eq(a.doc));
    assert.ok(B.state.doc.eq(a.doc));
    A.undo();
    settle(A, B);
    assert.equal(first(a.doc), 'YAlpha beta');
  }
});
test('backward selection replacement is local, and undo restores the text', () => {
  const { a, A, B } = rig();
  const end = textPosition(A.state.doc, 'beta', 4),
    start = end - 4;
  A.apply(
    A.state.tr.setSelection(TextSelection.create(A.state.doc, end, start))
  );
  A.insert('new');
  settle(A, B);
  assert.equal(first(a.doc), 'Alpha new');
  A.undo();
  settle(A, B);
  assert.equal(first(a.doc), 'Alpha beta');
});
test('context undo and redo preserve disjoint changes by the other view', () => {
  const { a, A, B } = rig();
  insertAt(A, 'A-', 'Alpha');
  settle(A, B);
  insertAt(B, 'B-', 'Gamma');
  settle(A, B);
  assert.equal(A.undo(), true);
  settle(A, B);
  assert.equal(first(a.doc), 'Alpha beta');
  assert.match(a.doc.textContent, /B-Gamma/);
  A.redo();
  settle(A, B);
  assert.equal(first(a.doc), 'A-Alpha beta');
  assert.match(a.doc.textContent, /B-Gamma/);
});
test('guarded candidate refuses an undo that would delete a nested foreign insertion', () => {
  const { a, A, B } = rig();
  insertAt(A, 'abcd', 'Alpha');
  settle(A, B);
  insertAt(B, 'FOREIGN', 'abcd', 2);
  settle(A, B);
  assert.equal(A.undo(), false);
  settle(A, B);
  assert.equal(A.historyError, 'UNDO_BLOCKED_FOREIGN_CONTENT');
  assert.equal(first(a.doc), 'abFOREIGNcdAlpha beta');
});
test('shared API edits stay visible through local undo', () => {
  const { a, A, B } = rig();
  insertAt(A, 'own', 'Alpha');
  settle(A, B);
  external(a, 'other', 'api', 'Gamma');
  settle(A, B);
  A.undo();
  settle(A, B);
  assert.equal(first(a.doc), 'Alpha beta');
  assert.match(a.doc.textContent, /otherGamma/);
});
test('pending input survives a stale push and subsequent catch-up', () => {
  const { a, A, B } = rig();
  insertAt(A, 'X', 'Alpha');
  A.push();
  insertAt(B, 'Y', 'Gamma');
  assert.throws(() => B.push(), /STALE_VERSION/);
  assert.equal(B.pending, 1);
  assert.match(B.state.doc.textContent, /YGamma/);
  settle(A, B);
  assert.match(a.doc.textContent, /YGamma/);
  assert.match(a.doc.textContent, /XAlpha/);
});
test('a rebase that removes a pending step retains its pre-rebase recovery snapshot', () => {
  const { A, B } = rig();
  let from, to;
  A.state.doc.descendants((n, pos) => {
    if (n.type.name === 'task') {
      from = pos;
      to = pos + n.nodeSize;
    }
  });
  insertAt(B, 'KEEP-ME', 'Budget');
  A.apply(A.state.tr.delete(from, to));
  A.push();
  B.pull();
  assert.equal(B.pending, 0);
  assert.equal(B.recovery.length, 1);
  assert.match(JSON.stringify(B.recovery[0].doc), /KEEP-ME/);
});
test('idempotency runs before stale guard, including retry after newer commits', () => {
  const { a } = rig();
  const request = {
    method: 'insert',
    id: 'same',
    version: 0,
    text: 'X',
    target: 'Alpha',
  };
  const original = execute(a, request);
  external(a, 'Y', 'later');
  assert.deepEqual(execute(a, { ...request }), original);
  assert.equal(first(a.doc), 'XYAlpha beta');
  assert.throws(
    () => execute(a, { ...request, text: 'different' }),
    /OPERATION_ID_REUSED/
  );
});
test('receipt uses canonical object key order', () => {
  const { a } = rig();
  execute(a, { method: 'insert', id: 'reordered', version: 0, text: 'X' });
  assert.equal(
    execute(a, { text: 'X', version: 0, id: 'reordered', method: 'insert' })
      .version,
    1
  );
});
test('invalid compound mutation has no partial authoritative effect', () => {
  const { a, A } = rig();
  const before = a.doc.toJSON();
  const task = a.doc.child(2);
  const tr = A.state.tr
    .insertText('X', 1)
    .insert(A.state.doc.content.size + 1, task);
  assert.throws(
    () =>
      a.submit({
        id: 'bad',
        clientId: 'A',
        version: 0,
        steps: tr.steps.map((s) => s.toJSON()),
      }),
    /INVALID_TASK_IDENTITY/
  );
  assert.deepEqual(a.doc.toJSON(), before);
  assert.equal(a.version, 0);
  assert.equal(a.outcomes.size, 0);
});
test('failed saves remain accepted but not reported durable; recovery restores them', () => {
  const { a, store } = rig();
  store.failSave = true;
  const r = external(a, 'UNSAVED');
  assert.equal(r.accepted, true);
  assert.equal(r.durable, false);
  assert.equal(r.saveError, 'SAVE_FAILED');
  assert.deepEqual(a.protectBeforeClose(), {
    protected: true,
    via: 'recovery',
  });
  const restarted = Authority.restore(store, fixture());
  assert.equal(first(restarted.doc), 'UNSAVEDAlpha beta');
  assert.equal(
    execute(restarted, {
      method: 'insert',
      id: 'api-1',
      version: 0,
      text: 'UNSAVED',
      target: 'Alpha',
    }).version,
    1
  );
});
test('when both protection paths fail, close refuses and keeps all accepted content', () => {
  const { a, store } = rig();
  store.failSave = store.failProtect = true;
  external(a, 'KEEP');
  assert.throws(() => a.protectBeforeClose(), /CLOSE_BLOCKED/);
  assert.equal(first(a.doc), 'KEEPAlpha beta');
});
test('reopening the same logical context after restart does not reuse operation IDs', () => {
  const { a, A, store } = rig();
  insertAt(A, 'X', 'Alpha');
  settle(A);
  const restored = Authority.restore(store, fixture()),
    reopened = new Context(restored, 'A');
  insertAt(reopened, 'Y', 'Alpha');
  settle(reopened);
  assert.equal(first(restored.doc), 'XYAlpha beta');
});
test('task title editing preserves task body, properties and identity', () => {
  const { a, A, B } = rig();
  const p = textPosition(A.state.doc, 'Send proposal');
  A.insert('', p, p + 'Send proposal'.length);
  settle(A, B);
  const task = a.doc.child(2);
  assert.equal(task.attrs.id, 't1');
  assert.deepEqual(task.attrs.properties, {
    Priority: { type: 'text', value: 'High' },
  });
  assert.equal(task.firstChild.textContent, '');
  assert.equal(task.lastChild.textContent, 'Budget details');
});
test('table edit undo preserves another view cell edit', () => {
  const { a, A, B } = rig();
  insertAt(A, 'X', 'One');
  settle(A, B);
  insertAt(B, 'Y', 'Four');
  settle(A, B);
  A.undo();
  settle(A, B);
  assert.match(a.doc.textContent, /OneTwoThreeYFour/);
});
test('bounded request validation refuses stale or invalid positions before effects', () => {
  const { a } = rig();
  assert.throws(
    () =>
      execute(a, {
        method: 'insert',
        id: 'bad',
        version: 0,
        text: 'X',
        offset: -1,
      }),
    /INVALID_REQUEST/
  );
  assert.throws(
    () =>
      execute(a, {
        method: 'insert',
        id: 'big',
        version: 0,
        text: 'x'.repeat(1048577),
      }),
    /REQUEST_LIMIT/
  );
  assert.equal(a.version, 0);
});
test('real filesystem checkpoint and receipts survive authority restart', (t) => {
  const directory = temp(t);
  let store = new FileStore(directory),
    a = new Authority(fixture(), store);
  external(a, 'disk');
  store.close();
  store = new FileStore(directory);
  t.after(() => store.close());
  a = Authority.restore(store, fixture());
  assert.equal(first(a.doc), 'diskAlpha beta');
  assert.equal(
    execute(a, {
      method: 'insert',
      id: 'api-1',
      version: 0,
      text: 'disk',
      target: 'Alpha',
    }).version,
    1
  );
});
test('real filesystem rescue survives failed snapshot writes', (t) => {
  const directory = temp(t);
  let store = new FileStore(directory),
    a = new Authority(fixture(), store);
  store.failSave = true;
  external(a, 'rescue');
  a.protectBeforeClose();
  store.close();
  store = new FileStore(directory);
  t.after(() => store.close());
  a = Authority.restore(store, fixture());
  assert.equal(first(a.doc), 'rescueAlpha beta');
});
test('interrupted cleanup cannot make an older recovery hide a newer snapshot', (t) => {
  const directory = temp(t),
    store = new FileStore(directory);
  t.after(() => store.close());
  const a = new Authority(fixture(), store);
  external(a, 'old');
  const old = a.snapshot();
  external(a, 'new', 'new');
  writeFileSync(join(directory, 'recovery.json'), JSON.stringify(old));
  assert.equal(
    first(Authority.restore(store, fixture()).doc),
    'oldnewAlpha beta'
  );
});
test('exclusive lab ownership refuses another writer; unmarked nonempty folders refused', (t) => {
  const directory = temp(t),
    store = new FileStore(directory);
  t.after(() => store.close());
  assert.throws(() => new FileStore(directory), /EEXIST/);
  const other = temp(t);
  writeFileSync(join(other, 'user-note.md'), 'untouched');
  assert.throws(() => new FileStore(other), /REFUSE_NONEMPTY/);
  assert.equal(readFileSync(join(other, 'user-note.md'), 'utf8'), 'untouched');
});
test('corrupt replay fails loudly instead of silently starting an empty document', (t) => {
  const directory = temp(t),
    store = new FileStore(directory);
  t.after(() => store.close());
  const a = new Authority(fixture(), store);
  external(a, 'X');
  const saved = a.snapshot();
  saved.doc = fixture().toJSON();
  writeFileSync(join(directory, 'snapshot.json'), JSON.stringify(saved));
  assert.throws(() => Authority.restore(store, fixture()), /SNAPSHOT_MISMATCH/);
});

test('raw candidate reproduction: PM undo also removes nested foreign text (known blocker)', () => {
  const { a, A, B } = rig();
  A.guardHistory = false;
  insertAt(A, 'abcd', 'Alpha');
  settle(A, B);
  insertAt(B, 'FOREIGN', 'abcd', 2);
  settle(A, B);
  A.undo();
  settle(A, B);
  assert.equal(first(a.doc), 'Alpha beta');
  // This is a diagnostic reproduction, not a passing product acceptance case.
});
test('guard also refuses opaque foreign formatting rather than inventing mark ownership', () => {
  const { A, B } = rig();
  insertAt(A, 'X', 'Alpha');
  settle(A, B);
  B.apply(B.state.tr.addMark(1, 2, schema.marks.strong.create()));
  settle(A, B);
  assert.equal(A.undo(), false);
  assert.equal(A.historyError, 'UNDO_BLOCKED_FOREIGN_OPAQUE_CHANGE');
});

test('client backup failure does not silently discard provisional input', () => {
  const { A, a } = rig();
  A.onBackup = () => {
    throw new Error('quota');
  };
  insertAt(A, 'KEEP', 'Alpha');
  assert.equal(A.backupError, 'CLIENT_BACKUP_FAILED');
  assert.equal(A.pending, 1);
  assert.equal(a.version, 0);
  assert.match(JSON.stringify(A.lastUnprotectedBackup), /KEEP/);
});
test('redo also refuses deletion of new foreign input inside its replacement range', () => {
  const { A, B, a } = rig();
  const start = textPosition(A.state.doc, 'beta');
  A.insert('own', start, start + 4);
  settle(A, B);
  A.undo();
  settle(A, B);
  insertAt(B, 'FOREIGN', 'beta', 2);
  settle(A, B);
  assert.equal(A.redo(), false);
  assert.equal(A.historyError, 'UNDO_BLOCKED_FOREIGN_CONTENT');
  assert.equal(first(a.doc), 'Alpha beFOREIGNta');
});
