import test from 'node:test';
import { CellSelection } from 'prosemirror-tables';
import assert from 'node:assert/strict';
import { EditorState, TextSelection } from 'prosemirror-state';
import { fixture, textPosition } from '../src/schema.mjs';
import {
  nextCell,
  previousCell,
  nextRowSameColumn,
  cellLineBreak,
  appendTableAxis,
  selectCurrentCell,
  selectCellText,
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

test('Escape selects the current cell; Enter re-enters it without content changes', () => {
  const initial = stateAt('Four', 2);
  const selected = apply(initial, selectCurrentCell).state;
  assert.ok(selected.selection instanceof CellSelection);
  assert.ok(selected.doc.eq(initial.doc));
  assert.equal(apply(selected, selectCurrentCell).state, selected);
  const editing = apply(selected, nextRowSameColumn).state;
  assert.ok(editing.selection instanceof TextSelection);
  assert.equal(editing.selection.head, textPosition(editing.doc, 'Four', 4));
  assert.ok(editing.doc.eq(initial.doc));
});
test('selected-cell Tab moves the cell selection while preserving content', () => {
  const initial = stateAt('Two', 1);
  const selected = apply(initial, selectCurrentCell).state;
  const next = apply(selected, nextCell).state;
  assert.ok(next.selection instanceof CellSelection);
  assert.equal(next.selection.$anchorCell.nodeAfter.textContent, 'Three');
  const back = apply(next, previousCell).state;
  assert.equal(back.selection.$anchorCell.nodeAfter.textContent, 'Two');
  assert.ok(back.doc.eq(initial.doc));
});
for (const [text, command] of [
  ['Four', nextCell],
  ['One', previousCell],
])
  test('selected-cell boundary keeps ' + text + ' selected', () => {
    const selected = apply(stateAt(text, 1), selectCurrentCell).state;
    const result = apply(selected, command);
    assert.equal(result.handled, true);
    assert.equal(result.state, selected);
  });

test('triple-click selects the entire cell text without changing document or selecting the cell', () => {
  const before = stateAt('Four', 2);
  const result = apply(before, (state, dispatch) =>
    selectCellText(state, dispatch, state.selection.head)
  );
  assert.equal(result.handled, true);
  assert.ok(result.state.selection instanceof TextSelection);
  assert.equal(
    result.state.selection.from,
    textPosition(before.doc, 'Four', 0)
  );
  assert.equal(result.state.selection.to, textPosition(before.doc, 'Four', 4));
  assert.ok(result.state.doc.eq(before.doc));
});
test('triple-click cell text spans all paragraphs, without adjacent cells', () => {
  let before = stateAt('Four', 2);
  const $pos = before.selection.$head;
  const cellStart = $pos.before($pos.depth - 1),
    cell = before.doc.nodeAt(cellStart);
  before = before.apply(
    before.tr.replaceWith(cellStart + 1, cellStart + cell.nodeSize - 1, [
      before.schema.nodes.paragraph.create(
        null,
        before.schema.text('First line')
      ),
      before.schema.nodes.paragraph.create(
        null,
        before.schema.text('Second line')
      ),
    ])
  );
  const result = apply(before, (state, dispatch) =>
    selectCellText(state, dispatch, cellStart + 2)
  );
  const sel = result.state.selection;
  assert.ok(sel instanceof TextSelection);
  assert.equal(
    result.state.doc.textBetween(sel.from, sel.to, '|'),
    'First line|Second line'
  );
  assert.ok(result.state.doc.eq(before.doc));
});
test('triple-click empty cell is a collapsed text selection', () => {
  const state = stateAt('Four', 0);
  const empty = state.apply(
    state.tr.delete(state.selection.from, state.selection.from + 4)
  );
  const result = apply(empty, (state, dispatch) =>
    selectCellText(state, dispatch, state.selection.from)
  );
  assert.ok(result.state.selection instanceof TextSelection);
  assert.equal(result.state.selection.empty, true);
  assert.ok(result.state.doc.eq(empty.doc));
});
test('triple-click override does not handle text outside a table', () => {
  const state = stateAt('Alpha', 2);
  const result = apply(state, (state, dispatch) =>
    selectCellText(state, dispatch, state.selection.from)
  );
  assert.equal(result.handled, false);
  assert.equal(result.state, state);
});
