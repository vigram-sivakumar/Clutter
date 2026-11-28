// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { ensureSyntaxTree } from '@codemirror/language';

import { markdownLanguageExtension } from '../markdownLanguage';
import { normalizeExternalPaste } from '../paste/externalPaste';
import { renderInlineMarkdown } from './renderInlineMarkdown';
import { tableCellEditor, type TableCellEditor } from '../table-engine/tableCellEditor';
import { tableWidgetDecoration } from './tableWidgetField';
import { tableSelectionHistory } from '../table-engine/tableSelectionHistory';
import { findAllTables, getNavigableRows, getRowCellBounds } from './tableGeometry';

const mounted: EditorView[] = [];

afterEach(() => {
  for (const view of mounted.splice(0)) {
    view.destroy();
  }
  document.body.innerHTML = '';
});

const TABLE = '| Name | Note |\n| --- | --- |\n| alpha | beta |\n| gamma | delta |';

function mountRoot(doc: string): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [markdownLanguageExtension(), tableCellEditor, tableWidgetDecoration(true), tableSelectionHistory, history()] }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  mounted.push(view);
  return view;
}

/** Activates the cell whose text is `cell` (first occurrence) with the real format keymap on the nested editor. */
function activate(root: EditorView, cell: string) {
  const controller = root.plugin(tableCellEditor)!;
  const table = findAllTables(root.state)[0]!;
  const rows = getNavigableRows(table.node);
  const from = root.state.doc.toString().indexOf(cell);
  const row = rows.findIndex(r => r.from <= from && r.to >= from);
  const col = getRowCellBounds(rows[row]!).findIndex(bounds => bounds.leftDelimiterTo <= from && bounds.rightDelimiterFrom >= from);
  expect(controller.enterCell(table.from, { row, col }, 'start')).toBe(true);
  return controller;
}

/** Cell padding is cosmetic (the table widget re-pads); compare content only. */
const squash = (text: string): string => text.replace(/ +/g, ' ');

function press(view: EditorView, key: string) {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true }));
}

function select(controller: TableCellEditor, from: number, to: number) {
  controller.nested!.dispatch({ selection: { anchor: from, head: to } });
}

describe('formatting commands inside a table cell', () => {
  it.each([
    ['b', '**'],
    ['i', '*'],
    ['e', '`'],
  ])('Mod-%s wraps the selected cell text in %s, in the root document', (key, marker) => {
    const root = mountRoot(TABLE);
    const controller = activate(root, 'alpha');

    select(controller, 0, 5);
    press(controller.nested!, key);

    expect(root.state.doc.toString()).toBe(TABLE.replace('alpha', `${marker}alpha${marker}`));
  });

  it('toggles a marker back off, and works in a header cell', () => {
    const root = mountRoot(TABLE);

    let controller = activate(root, 'Name');
    select(controller, 0, 4);
    press(controller.nested!, 'b');
    expect(root.state.doc.toString()).toBe(TABLE.replace('Name', '**Name**'));

    controller.close();
    controller = activate(root, '**Name**');
    select(controller, 2, 6);
    press(controller.nested!, 'b');
    expect(squash(root.state.doc.toString())).toBe(TABLE);
  });

  it('combines formats in one cell, and undo (root history) reverts them', () => {
    const root = mountRoot(TABLE);

    let controller = activate(root, 'alpha');
    select(controller, 0, 5);
    press(controller.nested!, 'b');
    controller.close();

    controller = activate(root, '**alpha**');
    select(controller, 0, 9);
    press(controller.nested!, 'i');
    expect(root.state.doc.toString()).toContain('| ***alpha*** |');

    undo(root);
    undo(root);
    expect(squash(root.state.doc.toString())).toBe(TABLE);
  });

  it('formats several cells of one table independently', () => {
    const root = mountRoot(TABLE);

    let controller = activate(root, 'alpha');
    select(controller, 0, 5);
    press(controller.nested!, 'b');
    controller.close();

    controller = activate(root, 'delta');
    select(controller, 0, 5);
    press(controller.nested!, 'e');

    expect(squash(root.state.doc.toString())).toBe(TABLE.replace('alpha', '**alpha**').replace('delta', '`delta`'));
  });
});

describe('a Markdown table with formatted cells', () => {
  const FORMATTED = [
    '| **Bold** | *Italic* | `code` | ==Mark== |',
    '| --- | --- | --- | --- |',
    '| plain **b** and *i* | `a` ==m== | **bold *both*** | text |',
  ].join('\n');

  it('survives paste normalization byte for byte, surrounded by other blocks', () => {
    const doc = `# Title\n\nSome text\n\n${FORMATTED}\n\n- item\n\nAfter`;
    const pasted = normalizeExternalPaste(doc);

    expect(pasted).toContain(FORMATTED);
  });

  it('parses as one table, and every cell renders its formatting', () => {
    const state = EditorState.create({ doc: FORMATTED, extensions: [markdownLanguageExtension()] });
    const cells: string[] = [];
    let tables = 0;
    ensureSyntaxTree(state, state.doc.length, 5000)!.iterate({
      enter: (node) => {
        if (node.name === 'Table') tables++;
        if (node.name === 'TableCell') cells.push(state.sliceDoc(node.from, node.to).trim());
      },
    });

    expect(tables).toBe(1);
    expect(cells).toHaveLength(8);
    const root = mountRoot(FORMATTED);
    const painted = Array.from(root.dom.querySelectorAll('th > .cm-table-cell-wrapper, td > .cm-table-cell-wrapper'));
    expect(painted).toHaveLength(8);
    expect(painted[0]!.innerHTML).toBe('<strong class="tok-strong">Bold</strong>');
    expect(painted[1]!.innerHTML).toBe('<em class="tok-emphasis">Italic</em>');
    expect(painted[2]!.innerHTML).toBe('<code class="tok-code cm-table-cell-code">code</code>');
    expect(painted[3]!.innerHTML).toBe('<span class="tok-highlight">Mark</span>');
    expect(painted[4]!.innerHTML).toBe('plain <strong class="tok-strong">b</strong> and <em class="tok-emphasis">i</em>');
    expect(painted[5]!.innerHTML).toBe('<code class="tok-code cm-table-cell-code">a</code> <span class="tok-highlight">m</span>');
    expect(painted[6]!.innerHTML).toBe('<strong class="tok-strong">bold <em class="tok-emphasis">both</em></strong>');
    expect(root.state.doc.toString()).toBe(FORMATTED);
    // On-screen markup matches Live Preview; clipboard HTML keeps semantic mark.
    expect(renderInlineMarkdown(cells[3]!)).toBe('<mark class="cm-table-cell-highlight">Mark</mark>');
    expect(renderInlineMarkdown(cells[5]!)).toBe('<code class="cm-table-cell-code">a</code> <mark class="cm-table-cell-highlight">m</mark>');
  });
});
