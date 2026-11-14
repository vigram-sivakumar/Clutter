import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EditorState,
  TextSelection,
  NodeSelection,
  AllSelection,
} from 'prosemirror-state';
import {
  ySyncPluginKey,
  initProseMirrorDoc,
  absolutePositionToRelativePosition,
} from 'y-prosemirror';
import * as Y from 'yjs';
import { Authority } from '../src/authority.mjs';
import { OriginAuthority } from '../src/origin-authority.mjs';
import { Context, settle } from '../src/context.mjs';
import { fixture, schema, textPosition } from '../src/schema.mjs';
const rig = () => {
  const a = new Authority(fixture());
  return { a, A: new Context(a, 'A'), B: new Context(a, 'B') };
};
const bold = (c, text) => {
  const from = textPosition(c.state.doc, text);
  c.apply(
    c.state.tr.addMark(from, from + text.length, schema.marks.strong.create())
  );
};
const insert = (c, needle, text) =>
  c.insert(text, textPosition(c.state.doc, needle));
function tableRange(doc) {
  let range;
  doc.descendants((n, pos) => {
    if (!range && n.type.name === 'table')
      range = { from: pos, to: pos + n.nodeSize };
  });
  return range;
}
function position(peer, text, offset = 0) {
  const fragment = peer.doc.getXmlFragment('prosemirror'),
    { doc, mapping } = initProseMirrorDoc(fragment, schema);
  return Y.createAbsolutePositionFromRelativePosition(
    absolutePositionToRelativePosition(
      textPosition(doc, text, offset),
      fragment,
      mapping
    ),
    peer.doc
  );
}
function yinsert(peer, text, needle, offset = 0, origin = ySyncPluginKey) {
  const p = position(peer, needle, offset);
  peer.doc.transact(() => p.type.insert(p.index, text), origin);
}
function model(peer, needle = 'Alpha', from = 0, to = from) {
  const { doc } = initProseMirrorDoc(
    peer.doc.getXmlFragment('prosemirror'),
    schema
  );
  return EditorState.create({
    doc,
    selection: TextSelection.create(
      doc,
      textPosition(doc, needle, from),
      textPosition(doc, needle, to)
    ),
  });
}

test('step: disjoint foreign marks do not block own text undo/redo', () => {
  const { a, A, B } = rig();
  insert(A, 'Alpha', 'AOWN');
  settle(A, B);
  bold(B, 'Gamma');
  settle(A, B);
  assert.equal(A.undo(), true);
  settle(A, B);
  assert.equal(a.doc.firstChild.textContent, 'Alpha beta');
  assert.ok(
    a.doc.child(1).firstChild.marks.some((m) => m.type.name === 'strong')
  );
  assert.equal(A.redo(), true);
  settle(A, B);
  assert.equal(a.doc.firstChild.textContent, 'AOWNAlpha beta');
  assert.ok(
    a.doc.child(1).firstChild.marks.some((m) => m.type.name === 'strong')
  );
});
test('step: own formatting inverse permits disjoint foreign text', () => {
  const { a, A, B } = rig();
  bold(A, 'Alpha');
  settle(A, B);
  insert(B, 'Gamma', 'BOWN');
  settle(A, B);
  assert.equal(A.undo(), true);
  settle(A, B);
  assert.equal(a.doc.firstChild.firstChild.marks.length, 0);
  assert.ok(a.doc.textContent.includes('BOWNGamma'));
  assert.equal(A.redo(), true);
  settle(A, B);
  assert.ok(
    a.doc.firstChild.firstChild.marks.some((m) => m.type.name === 'strong')
  );
  assert.ok(a.doc.textContent.includes('BOWNGamma'));
});
test('step: foreign format footprint maps past a later prefix insertion', () => {
  const { a, A, B } = rig();
  bold(B, 'Alpha');
  settle(A, B);
  insert(A, 'Alpha', 'X');
  settle(A, B);
  assert.equal(A.undo(), true);
  settle(A, B);
  assert.equal(a.doc.firstChild.textContent, 'Alpha beta');
  assert.ok(
    a.doc.firstChild.firstChild.marks.some((m) => m.type.name === 'strong')
  );
});
test('step: overlapping foreign formatting still blocks deleting the formatted own text', () => {
  const { a, A, B } = rig();
  insert(A, 'Alpha', 'abcd');
  settle(A, B);
  bold(B, 'bc');
  settle(A, B);
  const before = a.doc.toJSON();
  assert.equal(A.undo(), false);
  assert.equal(A.historyError, 'UNDO_BLOCKED_FOREIGN_OPAQUE_CHANGE');
  settle(A, B);
  assert.deepEqual(a.doc.toJSON(), before);
});
test('step: foreign node attributes protect their node, not an unrelated paragraph', () => {
  const { a, A, B } = rig();
  insert(A, 'Alpha', 'AOWN');
  settle(A, B);
  let taskPos;
  B.state.doc.descendants((n, pos) => {
    if (n.type.name === 'task') taskPos = pos;
  });
  B.apply(B.state.tr.setNodeAttribute(taskPos, 'completed', true));
  settle(A, B);
  assert.equal(A.undo(), true);
  settle(A, B);
  assert.equal(a.doc.firstChild.textContent, 'Alpha beta');
  assert.equal(a.doc.child(2).attrs.completed, true);
});

test('origin: external prefix change maps table scope and remains disjoint', () => {
  const a = new OriginAuthority();
  try {
    a.attach('A');
    const scope = tableRange(a.read());
    a.insertExternal({ target: 'Alpha', offset: 0, text: 'A' });
    assert.ok(a.changes.every((c) => c.to >= c.from && c.newTo >= c.from));
    assert.equal(a.hasForeignInScope('A', 0, scope), false);
    assert.deepEqual(a.mapScopeSince(0, scope), tableRange(a.read()));
  } finally {
    a.destroy();
  }
});
test('origin: foreign text inside a mapped table scope is protected', () => {
  const a = new OriginAuthority();
  try {
    a.attach('A');
    const b = a.attach('B'),
      scope = tableRange(a.read());
    a.insertExternal({ target: 'Alpha', offset: 0, text: 'SHIFT' });
    yinsert(b, 'FOREIGN', 'One');
    assert.equal(a.hasForeignInScope('A', 0, scope), true);
  } finally {
    a.destroy();
  }
});
test('origin: foreign formatting outside table is disjoint; inside table is protected', () => {
  const a = new OriginAuthority();
  try {
    a.attach('A');
    const b = a.attach('B'),
      scope = tableRange(a.read());
    let p = position(b, 'Gamma');
    b.doc.transact(() => p.type.format(p.index, 5, { strong: {} }), 'foreign');
    assert.equal(a.hasForeignInScope('A', 0, scope), false);
    p = position(b, 'One');
    b.doc.transact(() => p.type.format(p.index, 3, { strong: {} }), 'foreign');
    assert.equal(a.hasForeignInScope('A', 0, scope), true);
  } finally {
    a.destroy();
  }
});
test('origin: inserting a block adjacent to a table moves its scope without touching it', () => {
  const a = new OriginAuthority();
  try {
    a.attach('A');
    const b = a.attach('B'),
      scope = tableRange(a.read());
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText('BEFORE')]);
    b.doc.transact(
      () => b.doc.getXmlFragment('prosemirror').insert(3, [paragraph]),
      'foreign'
    );
    assert.equal(a.hasForeignInScope('A', 0, scope), false);
    assert.deepEqual(a.mapScopeSince(0, scope), tableRange(a.read()));
  } finally {
    a.destroy();
  }
});
test('origin: removing the protected table is still a foreign overlap', () => {
  const a = new OriginAuthority();
  try {
    a.attach('A');
    const b = a.attach('B'),
      scope = tableRange(a.read());
    b.doc.transact(
      () => b.doc.getXmlFragment('prosemirror').delete(3, 1),
      'foreign'
    );
    assert.equal(a.hasForeignInScope('A', 0, scope), true);
  } finally {
    a.destroy();
  }
});

test('context-owned origin history works without a DOM or EditorView', () => {
  const a = new OriginAuthority();
  try {
    const peer = a.attach('A'),
      context = a.historyContext('A');
    assert.equal(a.historyContext('A'), context);
    context.beforeEdit(model(peer));
    yinsert(peer, 'OWN-', 'Alpha');
    context.manager.stopCapturing();
    assert.equal(context.run('undo', model(peer)), true);
    assert.equal(a.read().firstChild.textContent, 'Alpha beta');
    assert.equal(context.run('redo', model(peer)), true);
    assert.equal(a.read().firstChild.textContent, 'OWN-Alpha beta');
    context.beforeEdit(model(peer));
    yinsert(peer, 'NEW-', 'Alpha');
    context.manager.stopCapturing();
    assert.equal(context.run('undo', model(peer)), true);
    assert.equal(a.read().firstChild.textContent, 'OWN-Alpha beta');
  } finally {
    a.destroy();
  }
});
test('context bookmark restores a backward text selection after undo without a binding mutation', () => {
  const a = new OriginAuthority();
  try {
    const peer = a.attach('A'),
      context = a.historyContext('A'),
      before = model(peer, 'beta', 4, 0);
    context.beforeEdit(before);
    const p = position(peer, 'beta');
    peer.doc.transact(() => {
      p.type.delete(p.index, 4);
      p.type.insert(p.index, 'X');
    }, ySyncPluginKey);
    assert.equal(context.run('undo', model(peer)), true);
    let state = model(peer);
    assert.equal(
      context.restore(state, (tr) => (state = state.apply(tr))),
      true
    );
    assert.ok(state.selection.anchor > state.selection.head);
    assert.equal(
      state.doc.textBetween(state.selection.from, state.selection.to),
      'beta'
    );
  } finally {
    a.destroy();
  }
});
test('disposing the context stops history capture; view lifecycle never calls disposal', () => {
  const a = new OriginAuthority();
  try {
    const peer = a.attach('A'),
      context = a.historyContext('A');
    context.beforeEdit(model(peer));
    yinsert(peer, 'OWN-', 'Alpha');
    context.destroy();
    context.destroy();
    yinsert(peer, 'AFTER-', 'Alpha');
    assert.equal(context.manager.canUndo(), false);
    assert.throws(
      () => context.run('undo', model(peer)),
      /HISTORY_CONTEXT_DISPOSED/
    );
    assert.ok(a.read().textContent.includes('AFTER-'));
  } finally {
    a.destroy();
  }
});

test('step: deleting an own-created task cannot erase foreign task attributes', () => {
  const { a, A, B } = rig();
  A.apply(
    A.state.tr.insert(
      A.state.doc.content.size,
      schema.nodes.task.create(
        { id: 't2', completed: false, properties: {} },
        schema.nodes.paragraph.create(null, schema.text('New task'))
      )
    )
  );
  settle(A, B);
  let pos;
  B.state.doc.descendants((node, p) => {
    if (node.type.name === 'task' && node.attrs.id === 't2') pos = p;
  });
  B.apply(B.state.tr.setNodeAttribute(pos, 'completed', true));
  settle(A, B);
  const before = a.doc.toJSON();
  assert.equal(A.undo(), false);
  assert.equal(A.historyError, 'UNDO_BLOCKED_FOREIGN_OPAQUE_CHANGE');
  settle(A, B);
  assert.deepEqual(a.doc.toJSON(), before);
});

test('origin: malformed history footprints fail closed', () => {
  const a = new OriginAuthority();
  try {
    a.attach('A');
    for (const scope of [
      null,
      {},
      { from: -1, to: 5 },
      { from: 4, to: 2 },
      { from: NaN, to: 10 },
    ]) {
      assert.equal(a.hasForeignInScope('A', 0, scope), true);
      assert.throws(() => a.mapScopeSince(0, scope), /INVALID_HISTORY_SCOPE/);
    }
  } finally {
    a.destroy();
  }
});

test('context bookmark restores a deleted read-only embed placement as a node selection', () => {
  const a = new OriginAuthority();
  try {
    const peer = a.attach('A'),
      context = a.historyContext('A');
    let before = model(peer),
      pos;
    before.doc.descendants((node, p) => {
      if (node.type.name === 'embed') pos = p;
    });
    before = before.apply(
      before.tr.setSelection(NodeSelection.create(before.doc, pos))
    );
    context.beforeEdit(before);
    peer.doc.transact(
      () => peer.doc.getXmlFragment('prosemirror').delete(4, 1),
      ySyncPluginKey
    );
    assert.equal(context.run('undo', model(peer)), true);
    let state = model(peer);
    context.restore(state, (tr) => (state = state.apply(tr)));
    assert.ok(state.selection instanceof NodeSelection);
    assert.equal(state.selection.node.type.name, 'embed');
    assert.equal(state.selection.node.attrs.target, 'original-note');
  } finally {
    a.destroy();
  }
});
test('context bookmark restores an all-document selection using public model APIs', () => {
  const a = new OriginAuthority();
  try {
    const peer = a.attach('A'),
      context = a.historyContext('A');
    let before = model(peer);
    before = before.apply(before.tr.setSelection(new AllSelection(before.doc)));
    context.beforeEdit(before);
    yinsert(peer, 'OWN-', 'Alpha');
    assert.equal(context.run('undo', model(peer)), true);
    let state = model(peer);
    context.restore(state, (tr) => (state = state.apply(tr)));
    assert.ok(state.selection instanceof AllSelection);
    assert.equal(state.doc.firstChild.textContent, 'Alpha beta');
  } finally {
    a.destroy();
  }
});
