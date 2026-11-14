import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState, TextSelection } from 'prosemirror-state';
import { fixture, textPosition } from '../src/schema.mjs';
import {
  nextCell,
  previousCell,
  nextRowSameColumn,
  cellLineBreak,
  appendTableAxis,
} from '../src/table-command.mjs';
const stateAt = (text, offset = 0) => {
  const doc = fixture();
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, textPosition(doc, text, offset)),
  });
};
function apply(state, command) {
  let next = state;
  const handled = command(state, (tr) => (next = state.apply(tr)));
  return { state: next, handled };
}
for (const [name, command, from, to] of [
  ['Tab', nextCell, 'One', 'Two'],
  ['Shift-Tab', previousCell, 'Four', 'Three'],
  ['Tab wraps existing rows', nextCell, 'Two', 'Three'],
  ['Enter column one', nextRowSameColumn, 'One', 'Three'],
  ['Enter column two', nextRowSameColumn, 'Two', 'Four'],
]) {
  test(
    name + ' collapses caret at destination end without changing content',
    () => {
      const before = stateAt(from, 1),
        result = apply(before, command);
      assert.equal(result.handled, true);
      assert.equal(
        result.state.selection.anchor,
        textPosition(result.state.doc, to, to.length)
      );
      assert.equal(result.state.selection.empty, true);
      assert.ok(result.state.doc.eq(before.doc));
    }
  );
}
for (const [name, command, cell] of [
  ['last Tab', nextCell, 'Four'],
  ['bottom Enter left', nextRowSameColumn, 'Three'],
  ['bottom Enter right', nextRowSameColumn, 'Four'],
]) {
  test(name + ' is handled without selection/content/structural change', () => {
    const before = stateAt(cell, 2),
      result = apply(before, command);
    assert.equal(result.handled, true);
    assert.equal(result.state, before);
  });
}
test('Shift-Enter inserts one hard break in the same cell', () => {
  const before = stateAt('Four', 2),
    result = apply(before, cellLineBreak);
  assert.equal(result.state.doc.child(3).lastChild.lastChild.childCount, 1);
  assert.equal(
    result.state.doc.child(3).lastChild.lastChild.firstChild.child(1).type.name,
    'hard_break'
  );
  assert.equal(result.state.selection.anchor, before.selection.anchor + 1);
});
test('first Shift-Tab retains native backward focus escape', () => {
  const before = stateAt('One');
  assert.equal(apply(before, previousCell).handled, false);
});
test('table commands leave ordinary paragraph keys to their existing handlers', () => {
  const before = stateAt('Alpha');
  for (const c of [nextCell, previousCell, nextRowSameColumn, cellLineBreak])
    assert.equal(apply(before, c).handled, false);
});
for (const axis of ['row', 'column']) {
  test(
    'explicit ' +
      axis +
      ' handle appends only that axis and preserves active cell',
    () => {
      const before = stateAt('Four', 2);
      let pos;
      before.doc.descendants((n, p) => {
        if (n.type.name === 'table') pos = p;
      });
      let next;
      assert.equal(
        appendTableAxis(before, (tr) => (next = before.apply(tr)), pos, axis),
        true
      );
      const table = next.doc.nodeAt(pos);
      assert.equal(table.childCount, axis === 'row' ? 3 : 2);
      assert.equal(table.firstChild.childCount, axis === 'column' ? 3 : 2);
      assert.equal(next.selection.empty, true);
      assert.equal(next.selection.$head.parent.textContent, 'Four');
      assert.equal(next.selection.$head.parentOffset, 2);
      assert.equal(next.doc.child(2).attrs.id, 't1');
    }
  );
}

for (const axis of ['row', 'column'])
  test(
    axis + ' insertion preserves a backward selection in the original cell',
    () => {
      const base = stateAt('Four'),
        start = textPosition(base.doc, 'Four');
      const state = EditorState.create({
        doc: base.doc,
        selection: TextSelection.create(base.doc, start + 4, start + 1),
      });
      let tablePos;
      state.doc.descendants((n, p) => {
        if (n.type.name === 'table') tablePos = p;
      });
      let next;
      appendTableAxis(state, (tr) => (next = state.apply(tr)), tablePos, axis);
      assert.equal(next.selection.$anchor.parent.textContent, 'Four');
      assert.equal(next.selection.$anchor.parentOffset, 4);
      assert.equal(next.selection.$head.parentOffset, 1);
    }
  );
