// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { ensureSyntaxTree } from '@codemirror/language';

import { formatShortcutsKeymap } from '../format/formatShortcutsKeymap';
import { markdownLanguageExtension } from '../markdownLanguage';
import { normalizeExternalPaste } from '../paste/externalPaste';
import { renderInlineMarkdown } from './renderInlineMarkdown';
import { TableActiveCellController } from './tableActiveCellController';

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
    state: EditorState.create({ doc, extensions: [markdownLanguageExtension(), history()] }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  mounted.push(view);
  return view;
}

/** Activates the cell whose text is `cell` (first occurrence) with the real format keymap on the nested editor. */
function activate(root: EditorView, cell: string) {
  const controller = new TableActiveCellController();
  controller.setNestedExtensions([formatShortcutsKeymap()]);
  const from = root.state.doc.toString().indexOf(cell);
  controller.activate(root, document.body.appendChild(document.createElement('div')), from, from + cell.length, from);
  mounted.push(controller.nestedView!);
  return controller;
}

/** Cell padding is cosmetic (the table widget re-pads); compare content only. */
const squash = (text: string): string => text.replace(/ +/g, ' ');

function press(view: EditorView, key: string) {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true }));
}

function select(controller: TableActiveCellController, from: number, to: number) {
  controller.nestedView!.dispatch({ selection: { anchor: from, head: to } });
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
    press(controller.nestedView!, key);

    expect(root.state.doc.toString()).toBe(TABLE.replace('alpha', `${marker}alpha${marker}`));
  });

  it('toggles a marker back off, and works in a header cell', () => {
    const root = mountRoot(TABLE);

    let controller = activate(root, 'Name');
    select(controller, 0, 4);
    press(controller.nestedView!, 'b');
    expect(root.state.doc.toString()).toBe(TABLE.replace('Name', '**Name**'));

    controller.nestedView!.destroy();
    controller = activate(root, '**Name**');
    select(controller, 2, 6);
    press(controller.nestedView!, 'b');
    expect(squash(root.state.doc.toString())).toBe(TABLE);
  });

  it('combines formats in one cell, and undo (root history) reverts them', () => {
    const root = mountRoot(TABLE);

    let controller = activate(root, 'alpha');
    select(controller, 0, 5);
    press(controller.nestedView!, 'b');
    controller.nestedView!.destroy();

    controller = activate(root, '**alpha**');
    select(controller, 0, 9);
    press(controller.nestedView!, 'i');
    expect(root.state.doc.toString()).toContain('| ***alpha*** |');

    undo(root);
    undo(root);
    expect(squash(root.state.doc.toString())).toBe(TABLE);
  });

  it('formats several cells of one table independently', () => {
    const root = mountRoot(TABLE);

    let controller = activate(root, 'alpha');
    select(controller, 0, 5);
    press(controller.nestedView!, 'b');
    controller.nestedView!.destroy();

    controller = activate(root, 'delta');
    select(controller, 0, 5);
    press(controller.nestedView!, 'e');

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
    expect(renderInlineMarkdown(cells[0]!, { styled: true })).toBe('<strong class="tok-strong">Bold</strong>');
    expect(renderInlineMarkdown(cells[1]!, { styled: true })).toBe('<em class="tok-emphasis">Italic</em>');
    expect(renderInlineMarkdown(cells[2]!, { styled: true })).toBe('<code class="tok-code cm-table-cell-code">code</code>');
    expect(renderInlineMarkdown(cells[3]!, { styled: true })).toBe('<mark class="tok-highlight cm-table-cell-highlight">Mark</mark>');
    expect(renderInlineMarkdown(cells[4]!, { styled: true })).toBe('plain <strong class="tok-strong">b</strong> and <em class="tok-emphasis">i</em>');
    expect(renderInlineMarkdown(cells[5]!, { styled: true })).toBe('<code class="tok-code cm-table-cell-code">a</code> <mark class="tok-highlight cm-table-cell-highlight">m</mark>');
    expect(renderInlineMarkdown(cells[6]!, { styled: true })).toBe('<strong class="tok-strong">bold <em class="tok-emphasis">both</em></strong>');
  });
});
