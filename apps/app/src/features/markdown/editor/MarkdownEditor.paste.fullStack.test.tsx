// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { redo, undo, undoDepth } from '@codemirror/commands';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState, StateEffect, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { MarkdownEditor } from './MarkdownEditor';
import { classifyPaste, type PasteStrategy } from './codemirror/paste/pasteClassification';
import { markdownLanguageExtension } from './codemirror/markdownLanguage';
import { __clearAllCachedEditorHistoryForTests } from './codemirror/editorHistoryCache';
import type { PasteAssets } from './codemirror/paste/assetPaste';
import { findAllTables } from './codemirror/table/tableGeometry';
import { tableSelectionChanged, tableSelectionField } from './codemirror/table/tableSelection';
import { tableCellEditor } from './codemirror/table-engine/tableCellEditor';

/**
 * CHARACTERIZATION of the paste pipeline as the app runs it: a real `<MarkdownEditor>` (so the real
 * `buildEditorExtensions` registration and handler order, the real nested table-cell editor and its
 * `setNestedExtensions` wiring, the real read-only switch and unmount), real `paste` events dispatched on the
 * editor's own DOM, and real CodeMirror transactions, history and undo. Nothing here composes `pasteAssets`,
 * `tableCreatePaste` or `externalPasteNormalization` by hand.
 *
 * It records what the pipeline DOES, so the architecture can be judged on evidence. Each test is tagged:
 *   [intentional]  documented or deliberate behaviour
 *   [behaviour]    how it works today, neither clearly right nor wrong
 *   [defect]       a verified problem, pinned as it is NOW — flip the assertion when it is fixed
 *   [env]          depends on the test environment (jsdom has no layout, and the clipboard is a mock); needs a real
 *                  Tauri/WKWebView check before it is trusted
 *
 * The clipboard is a mock `DataTransfer` (`files`, `getData`): real macOS pasteboard behaviour — which
 * representations an app puts on it, file `type`s, `getData` timing — is NOT reproduced here.
 */
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  localStorage.clear();
  __clearAllCachedEditorHistoryForTests();
});
afterEach(cleanup);

// ── clipboard payloads ─────────────────────────────────────────────────────────────────────────────────

interface Payload {
  readonly text?: string;
  readonly html?: string;
  readonly files?: readonly File[];
  /** `application/x-clutter-table`, what Clutter's own table copy writes. */
  readonly internal?: string;
  /** `text/uri-list`, which CodeMirror's default paste falls back to when there is no plain text. */
  readonly uriList?: string;
}

const png = (name = 'shot.png') => new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'image/png' });
const pdf = (name = 'doc.pdf') => new File([new Uint8Array([5, 6, 7])], name, { type: 'application/pdf' });
const docx = (name = 'notes.docx') =>
  new File([new Uint8Array([9, 9])], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

function pasteEvent(payload: Payload): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  const files = payload.files ?? [];
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files,
      getData: (type: string) =>
        type === 'text/plain' ? (payload.text ?? '') : type === 'text/html' ? (payload.html ?? '') : type === 'application/x-clutter-table' ? (payload.internal ?? '') : type === 'text/uri-list' ? (payload.uriList ?? '') : '',
    },
  });
  return event;
}

const sleep = (ms = 25) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const htmlTable = (rows: readonly (readonly string[])[]): string =>
  `<table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</table>`;
const internalTable = (rows: readonly (readonly string[])[]): string => JSON.stringify({ kind: 'clutter-table-range', rows });

// ── the app's pasteAssets dependency, observable ───────────────────────────────────────────────────────

function fakeAssets(options: { readonly gate?: Promise<void>; readonly fails?: (name: string) => boolean } = {}) {
  const stored: string[] = [];
  const failed: string[][] = [];
  const notInserted: number[] = [];
  const notInsertedReasons: string[] = [];
  const skipped: { names: string[]; reason: string }[] = [];
  let count = 0;
  const assets: PasteAssets = {
    importFile: async (file) => {
      if (options.gate) {
        await options.gate;
      }
      if (options.fails?.(file.name)) {
        throw new Error('import failed');
      }
      count += 1;
      const dot = file.name.lastIndexOf('.');
      const reference = `Assets/${file.name.slice(0, dot)}-${count}${file.name.slice(dot)}`;
      stored.push(reference);
      return reference;
    },
    onFailed: (names) => failed.push([...names]),
    onNotInserted: (n, reason) => {
      notInserted.push(n);
      notInsertedReasons.push(reason);
    },
    onSkipped: (names, reason) => skipped.push({ names: [...names], reason }),
  };
  return { assets, stored, failed, notInserted, notInsertedReasons, skipped };
}

// ── mounting the real editor ───────────────────────────────────────────────────────────────────────────

const rootOf = (container: HTMLElement): EditorView => EditorView.findFromDOM(container.querySelector('.cm-editor') as HTMLElement)!;

function nestedOf(container: HTMLElement): EditorView | null {
  const element = container.querySelector('.cm-table-widget .cm-editor') as HTMLElement | null;
  return element ? EditorView.findFromDOM(element) : null;
}

/** Clicks a rendered cell: the real activation path (mousedown on its wrapper), which mounts the nested cell editor. */
function activateCell(root: EditorView, text: string): void {
  const cell = Array.from(root.dom.querySelectorAll('th, td')).find((element) => element.textContent === text)!;
  const wrapper = cell.querySelector(':scope > .cm-table-cell-wrapper')!;
  act(() => {
    wrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  });
}

function selectRange(root: EditorView, anchor: readonly [number, number], head: readonly [number, number]): void {
  const table = findAllTables(root.state)[0]!;
  act(() =>
    root.dispatch({
      effects: tableSelectionChanged.of({ kind: 'range', tableFrom: table.from, anchor: { row: anchor[0], col: anchor[1] }, head: { row: head[0], col: head[1] } }),
    })
  );
}

const TABLE = '| A | B |\n| --- | --- |\n| a1 | b1 |\n| a2 | b2 |';
const DOC_TABLE = `Intro\n\n${TABLE}\n\nOutro`;

interface Setup {
  readonly markdown: string;
  /** Root caret (default: the end of the document, where the editor mounts it). */
  readonly caret?: number;
  /** Select this span of the root document instead of placing a caret. */
  readonly selection?: readonly [number, number];
  /** Select this body-cell range of the first table (rows are 0 = header). */
  readonly range?: readonly [readonly [number, number], readonly [number, number]];
  /** Activate the cell with this text; the nested editor's caret is collapsed to the end of the cell. */
  readonly cell?: string;
  readonly assets?: Parameters<typeof fakeAssets>[0];
}

interface Observation {
  readonly prevented: boolean;
  readonly before: string;
  readonly doc: string;
  readonly caret: number;
  /** `userEvent` of each document-changing root transaction caused by the paste (null: untagged). */
  readonly userEvents: readonly (string | null)[];
  readonly undoSteps: number;
  readonly undoRestores: boolean;
  readonly redoRestores: boolean;
  readonly stored: readonly string[];
  readonly failed: readonly (readonly string[])[];
  readonly notInserted: readonly number[];
  readonly skipped: readonly { readonly names: readonly string[]; readonly reason: string }[];
}

/** Pastes `payload` into the real editor (`on` the root, or the active cell's nested editor), then undoes and redoes it. */
async function paste(setup: Setup, payload: Payload, on: 'root' | 'cell' = 'root'): Promise<Observation> {
  const fake = fakeAssets(setup.assets);
  const { container } = render(<MarkdownEditor pageId="page" markdown={setup.markdown} pasteAssets={fake.assets} />);
  const root = rootOf(container);

  act(() =>
    root.dispatch({ selection: setup.selection ? { anchor: setup.selection[0], head: setup.selection[1] } : { anchor: setup.caret ?? root.state.doc.length } })
  );
  if (setup.range) {
    selectRange(root, setup.range[0], setup.range[1]);
  }
  let target = root;
  if (setup.cell) {
    activateCell(root, setup.cell);
    const nested = nestedOf(container)!;
    act(() => nested.dispatch({ selection: { anchor: nested.state.doc.length } }));
    if (on === 'cell') {
      target = nested;
    }
  }

  const userEvents: (string | null)[] = [];
  root.dispatch({
    effects: StateEffect.appendConfig.of(
      EditorView.updateListener.of((update) => {
        for (const tr of update.transactions) {
          if (tr.docChanged) {
            userEvents.push(tr.annotation(Transaction.userEvent) ?? null);
          }
        }
      })
    ),
  });

  const before = root.state.doc.toString();
  const depthBefore = undoDepth(root.state);
  const event = pasteEvent(payload);
  act(() => {
    target.contentDOM.dispatchEvent(event);
  });
  await sleep();

  const doc = root.state.doc.toString();
  const caret = root.state.selection.main.head;
  const undoSteps = undoDepth(root.state) - depthBefore;
  const events = [...userEvents];
  act(() => {
    undo(root);
  });
  const undone = root.state.doc.toString();
  act(() => {
    redo(root);
  });
  return {
    prevented: event.defaultPrevented,
    before,
    doc,
    caret,
    userEvents: events,
    undoSteps,
    undoRestores: undone === before,
    redoRestores: root.state.doc.toString() === doc,
    stored: fake.stored,
    failed: fake.failed,
    notInserted: fake.notInserted,
    skipped: fake.skipped,
  };
}

const PLAIN: Setup = { markdown: 'Start\n\nEnd', caret: 5 };
const RICH = '<p>hello <b>bold</b></p><ul><li>a</li></ul>';
const TSV = 'x1\ty1\nx2\ty2';
const FILLED = 'Intro\n\n| A | B |\n| --- | --- |\n| x1 | y1 |\n| x2 | y2 |\n\nOutro';

// ═══ A. a selected range of table cells versus rich HTML and files ═════════════════════════════════════

vi.mock('./codemirror/paste/pasteClassification', async (importOriginal) => {
  const original = await importOriginal<typeof import('./codemirror/paste/pasteClassification')>();
  return { ...original, classifyPaste: vi.fn(original.classifyPaste) };
});

describe('A. table range selection — which handler takes the paste', () => {
  const SELECTED: Setup = { markdown: DOC_TABLE, range: [[1, 0], [2, 1]] };

  it('[intentional] an HTML table of plain cells fills the selected cells (tablePaste), without input.paste', async () => {
    const o = await paste(SELECTED, { html: htmlTable([['x1', 'y1'], ['x2', 'y2']]), text: TSV });

    expect(o.doc).toBe(FILLED);
    expect(o.userEvents).toEqual([null]);
    expect(o.stored).toEqual([]);
  });

  it('[intentional] tab-separated text, and Clutter\'s own table MIME, fill the selected cells', async () => {
    expect((await paste(SELECTED, { text: TSV })).doc).toBe(FILLED);
    expect((await paste(SELECTED, { internal: internalTable([['x1', 'y1'], ['x2', 'y2']]), text: TSV })).doc).toBe(FILLED);
  });

  it('[intentional] an HTML table whose cells hold links or bold fills the selected cells too (pasteAssets yields to tablePaste); the cells receive the plain text', async () => {
    const o = await paste(SELECTED, { html: htmlTable([['<a href="https://e.com">x1</a>', '<b>y1</b>'], ['x2', 'y2']]), text: TSV });

    expect(o.doc).toBe(FILLED);
    expect(o.stored).toEqual([]);
    expect(o.userEvents).toEqual([null]);
  });

  it('[behaviour] rich HTML that is not a table fills the selected cells with its plain text', async () => {
    const o = await paste(SELECTED, { html: '<p>hello <b>bold</b></p>', text: 'hello bold' });

    expect(o.doc).toBe(DOC_TABLE.replace('| a1 | b1 |\n| a2 | b2 |', '| hello bold | hello bold |\n| hello bold | hello bold |'));
    expect(o.undoRestores).toBe(true);
    expect(o.redoRestores).toBe(true);
    expect(o.stored).toEqual([]);
  });

  it('[behaviour] an image with cells selected is not stored or embedded (tablePaste has no grid in it, and nothing gives a file a place in a table range); the cells are untouched', async () => {
    const o = await paste(SELECTED, { files: [png()], text: '' });

    expect(o.doc).toBe(o.before);
    expect(o.stored).toEqual([]);
    expect(o.userEvents).toEqual([]);
  });

  it('[intentional] a file alongside an HTML table (a spreadsheet copy) with cells selected: the table fills the cells and the file is not stored', async () => {
    const o = await paste(SELECTED, { files: [png()], html: htmlTable([['x1', 'y1'], ['x2', 'y2']]), text: TSV });

    expect(o.doc).toBe(FILLED);
    expect(o.stored).toEqual([]);
  });

  it('[behaviour] a file with rich HTML and cells selected: no embed; plain text fills the selection', async () => {
    const o = await paste(SELECTED, { files: [png()], html: '<p>hi <b>b</b></p>', text: 'hi b' });

    expect(o.doc).toBe(DOC_TABLE.replace('| a1 | b1 |\n| a2 | b2 |', '| hi b | hi b |\n| hi b | hi b |'));
    expect(o.skipped).toEqual([{ names: ['shot.png'], reason: 'target' }]);
    expect(o.stored).toEqual([]);
  });

  it('[behaviour] a whole row selection is also a table paste target: plain text fills only that row', async () => {
    const fake = fakeAssets();
    const { container } = render(<MarkdownEditor pageId="page" markdown={DOC_TABLE} pasteAssets={fake.assets} />);
    const root = rootOf(container);
    const table = findAllTables(root.state)[0]!;
    act(() => root.dispatch({ effects: tableSelectionChanged.of({ kind: 'row', tableFrom: table.from, rowIndex: 1 }) }));

    act(() => {
      root.contentDOM.dispatchEvent(pasteEvent({ html: '<p>hello <b>bold</b></p>', text: 'hello bold' }));
    });
    await sleep();

    expect(root.state.doc.toString()).toBe(DOC_TABLE.replace('| a1 | b1 |', '| hello bold | hello bold |'));
    expect(fake.stored).toEqual([]);
    expect(root.state.field(tableSelectionField)).toMatchObject({ kind: 'row', rowIndex: 1 });
  });

  it('[behaviour] plain text with no tabs fills the entire selected range', async () => {
    const o = await paste(SELECTED, { text: 'just text' });

    expect(o.doc).toBe(DOC_TABLE.replace('| a1 | b1 |\n| a2 | b2 |', '| just text | just text |\n| just text | just text |'));
    expect(o.undoRestores).toBe(true);
  });
});

// ═══ B. clipboard format combinations at the root caret ════════════════════════════════════════════════

describe('B. clipboard format combinations — which representation wins', () => {
  it('[intentional] text only: the external-paste compaction runs (blank lines between blocks are dropped)', async () => {
    expect((await paste(PLAIN, { text: 'one\n\ntwo\n\n- a\n\n- b' })).doc).toBe('Startone\ntwo\n- a\n- b\n\nEnd');
  });

  it('[behaviour] HTML with structure and plain text: the HTML wins and the text is not used', async () => {
    const o = await paste(PLAIN, { html: RICH, text: 'PLAINFALLBACK' });

    expect(o.doc).toBe('Starthello **bold**\n- a\n\nEnd');
    expect(o.doc).not.toContain('PLAINFALLBACK');
  });

  it('[behaviour] HTML with only plain wrappers (div/span) and plain text: the text wins', async () => {
    expect((await paste(PLAIN, { html: '<div><span>hello</span></div>', text: 'PLAINFALLBACK' })).doc).toBe('StartPLAINFALLBACK\n\nEnd');
  });

  it('[behaviour] a file with plain text: the text comes first, then the embed', async () => {
    expect((await paste(PLAIN, { files: [png()], text: 'caption text' })).doc).toBe('Startcaption text\n![[Assets/shot-1.png]]\n\nEnd');
  });

  it('[intentional] a file with only its own name as text: the name is not inserted', async () => {
    expect((await paste(PLAIN, { files: [png('shot.png')], text: 'shot.png' })).doc).toBe('Start![[Assets/shot-1.png]]\n\nEnd');
  });

  it('[defect] a file with rich HTML: the HTML is DISCARDED. The formatting is lost; only the plain text and the embed remain', async () => {
    const o = await paste(PLAIN, { files: [png()], html: RICH, text: 'PLAINFALLBACK' });

    expect(o.doc).toBe('StartPLAINFALLBACK\n![[Assets/shot-1.png]]\n\nEnd');
    expect(o.doc).not.toContain('**bold**');
  });

  it('[behaviour] an HTML table with tab-separated text creates a Markdown table', async () => {
    const o = await paste(PLAIN, { html: htmlTable([['a', 'b'], ['c', 'd']]), text: 'a\tb\nc\td' });

    expect(o.doc).toContain('| a | b |');
    expect(o.doc).toContain('| c | d |');
  });

  it('[behaviour] Clutter\'s own table MIME wins over HTML and text, and its cells are taken as already-escaped Markdown', async () => {
    const o = await paste(PLAIN, { internal: internalTable([['i1', 'j\\|1'], ['i2', 'j2']]), html: htmlTable([['HTML']]), text: 'TEXT' });

    expect(o.doc).toContain('| i1 | j\\|1 |');
    expect(o.doc).not.toContain('HTML');
    expect(o.doc).not.toContain('TEXT');
  });

  it('[defect] a file alongside an HTML table (a spreadsheet copy with a preview image): the table wins and the file is SILENTLY discarded — no embed, no import, no notice', async () => {
    const o = await paste(PLAIN, { files: [png()], html: htmlTable([['a', 'b'], ['c', 'd']]), text: 'a\tb\nc\td' });

    expect(o.doc).toContain('| a | b |');
    expect(o.doc).not.toContain('![[');
    expect(o.stored).toEqual([]);
    expect(o.failed).toEqual([]);
    expect(o.notInserted).toEqual([]);
  });

  it('[defect] a supported file together with an unsupported one: the unsupported file is SILENTLY dropped (no notice)', async () => {
    const o = await paste(PLAIN, { files: [png(), docx()], text: '' });

    expect(o.doc).toBe('Start![[Assets/shot-1.png]]\n\nEnd');
    expect(o.stored).toEqual(['Assets/shot-1.png']);
    expect(o.failed).toEqual([]);
  });

  it('[behaviour] an unsupported file alone: its name (the clipboard text) is pasted as text, with no notice', async () => {
    const o = await paste(PLAIN, { files: [docx()], text: 'notes.docx' });

    expect(o.doc).toBe('Startnotes.docx\n\nEnd');
    expect(o.stored).toEqual([]);
    expect(o.failed).toEqual([]);
  });

  it('[behaviour] a PDF alone is stored and embedded like an image', async () => {
    expect((await paste(PLAIN, { files: [pdf()], text: '' })).doc).toBe('Start![[Assets/doc-1.pdf]]\n\nEnd');
  });

  it('[intentional] two HTML tables with no other markup are classified as rich HTML and converted: both tables\' rows arrive as Markdown', async () => {
    const o = await paste({ markdown: '', caret: 0 }, { html: htmlTable([['a']]) + htmlTable([['b']]), text: 'a\nb' });

    expect(o.doc).toContain('| a |');
    expect(o.doc).toContain('| b |');
    expect(o.userEvents).toEqual(['input.paste']);
  });

  it('[behaviour] a table next to a heading is converted by the rich-HTML path (a heading makes the HTML rich)', async () => {
    const o = await paste(PLAIN, { html: `<h2>T</h2>${htmlTable([['a', 'b']])}`, text: 'T\na\tb' });

    expect(o.doc).toContain('## T');
    expect(o.doc).toContain('| a | b |');
  });

  it('[behaviour] tab-separated text alone creates a table, even one row', async () => {
    expect((await paste(PLAIN, { text: 'a\tb' })).doc).toContain('| a | b |');
  });
});

// ═══ C. the root editor versus an active table cell ════════════════════════════════════════════════════

describe('C. the root editor versus the active nested cell editor', () => {
  const CELL: Setup = { markdown: DOC_TABLE, cell: 'a1' };
  const cellRow = (doc: string) => doc.split('\n')[4];

  it('[behaviour] plain text replaces the entire active cell value', async () => {
    expect(cellRow((await paste(CELL, { text: 'plain' }, 'cell')).doc)).toBe('| plain | b1 |');
  });

  it('[intentional] multi-line text is flattened to one line in a cell (the root keeps the newline)', async () => {
    expect(cellRow((await paste(CELL, { text: 'line one\nline two' }, 'cell')).doc)).toBe('| line one line two | b1 |');
    expect((await paste(PLAIN, { text: 'line one\nline two' })).doc).toBe('Startline one\nline two\n\nEnd');
  });

  it('[defect] Markdown text is NOT compacted in a cell (the root compacts it): blank lines become double spaces and the Markdown is flattened', async () => {
    expect(cellRow((await paste(CELL, { text: 'one\n\ntwo\n\n- a\n\n- b' }, 'cell')).doc)).toBe('| one  two  - a  - b | b1 |');
    expect((await paste(PLAIN, { text: 'one\n\ntwo\n\n- a\n\n- b' })).doc).toBe('Startone\ntwo\n- a\n- b\n\nEnd');
  });

  it('[defect] rich HTML is NOT converted in a cell (the root converts it): the plain-text fallback is pasted and the formatting is lost', async () => {
    expect(cellRow((await paste(CELL, { html: '<p>hello <b>bold</b></p>', text: 'PLAINFALLBACK' }, 'cell')).doc)).toBe('| PLAINFALLBACK | b1 |');
    expect((await paste(PLAIN, { html: '<p>hello <b>bold</b></p>', text: 'PLAINFALLBACK' })).doc).toBe('Starthello **bold**\n\nEnd');
  });

  it('[defect] an image or PDF pasted into a cell is IGNORED: nothing is inserted, nothing is stored, no notice (the root stores and embeds it)', async () => {
    for (const files of [[png()], [pdf()]]) {
      const o = await paste(CELL, { files, text: '' }, 'cell');

      expect(o.doc).toBe(o.before);
      expect(o.stored).toEqual([]);
      expect(o.failed).toEqual([]);
      expect(o.notInserted).toEqual([]);
    }
  });

  it('[intentional] an HTML table or tab-separated text pasted in a cell fills the table from that cell (tableCellPaste)', async () => {
    expect((await paste(CELL, { html: htmlTable([['x1', 'y1'], ['x2', 'y2']]), text: TSV }, 'cell')).doc).toBe(FILLED);
    expect((await paste(CELL, { text: TSV }, 'cell')).doc).toBe(FILLED);
  });
});

describe('C. a cell whose whole text is selected on activation', () => {
  it('[env] clicking a cell in jsdom selects its whole text; an image-only paste (no text) then leaves the cell as it was. Whether activation selects the whole cell in the real app must still be checked in Tauri', async () => {
    const fake = fakeAssets();
    const { container } = render(<MarkdownEditor pageId="page" markdown={DOC_TABLE} pasteAssets={fake.assets} />);
    const root = rootOf(container);
    activateCell(root, 'a1');
    const nested = nestedOf(container)!;
    const selection = nested.state.selection.main;
    expect([selection.from, selection.to]).toEqual([0, 2]);

    act(() => {
      nested.contentDOM.dispatchEvent(pasteEvent({ files: [png()], text: '' }));
    });
    await sleep();

    expect(root.state.doc.toString()).toBe(DOC_TABLE);
    expect(fake.stored).toEqual([]);
  });

  it('an unsupported file or an empty clipboard pasted over a whole selected cell leaves the cell as it was', async () => {
    for (const payload of [{ files: [docx()], text: '' }, {}] as const) {
      const fake = fakeAssets();
      const { container } = render(<MarkdownEditor pageId="page" markdown={DOC_TABLE} pasteAssets={fake.assets} />);
      const root = rootOf(container);
      activateCell(root, 'a1');
      const nested = nestedOf(container)!;

      act(() => {
        nested.contentDOM.dispatchEvent(pasteEvent(payload));
      });
      await sleep();

      expect(root.state.doc.toString()).toBe(DOC_TABLE);
      cleanup();
    }
  });
});

// ═══ D. undo, redo, selection and transaction metadata ═════════════════════════════════════════════════

describe('D. undo, redo, selection and input.paste metadata, per strategy', () => {
  // [name, setup, payload, target, expected userEvent of the paste transaction]
  const STRATEGIES: readonly (readonly [string, Setup, Payload, 'root' | 'cell', string | null])[] = [
    ['plain text (CodeMirror default paste)', PLAIN, { text: 'one\ntwo' }, 'root', 'input.paste'],
    ['rich HTML (pasteAssets)', PLAIN, { html: RICH, text: 'x' }, 'root', 'input.paste'],
    ['a file (pasteAssets, asynchronous)', PLAIN, { files: [png()], text: 'cap' }, 'root', 'input.paste'],
    ['a new table (tableCreatePaste)', PLAIN, { text: 'a\tb\nc\td' }, 'root', null],
    ['a grid into a selected range (tablePaste)', { markdown: DOC_TABLE, range: [[1, 0], [2, 1]] }, { text: TSV }, 'root', null],
    ['a grid from an active cell (tableCellPaste)', { markdown: DOC_TABLE, cell: 'a1' }, { text: TSV }, 'cell', null],
    ['plain text into an active cell (default paste in the nested editor)', { markdown: DOC_TABLE, cell: 'a1' }, { text: 'zz' }, 'cell', null],
  ];

  it.each(STRATEGIES)('one paste is one undo step that restores the exact document, and redo restores the paste: %s', async (_name, setup, payload, target) => {
    const o = await paste(setup, payload, target);

    expect(o.prevented).toBe(true);
    expect(o.doc).not.toBe(o.before);
    expect(o.undoSteps).toBe(1);
    expect(o.undoRestores).toBe(true);
    expect(o.redoRestores).toBe(true);
  });

  // The table strategies (tableCreatePaste, tablePaste, tableCellPaste) dispatch without `input.paste`; the others carry it.
  // Only the URL "Paste as" menu reads the tag today.
  it.each(STRATEGIES)('the transaction metadata: %s', async (_name, setup, payload, target, userEvent) => {
    const o = await paste(setup, payload, target);

    expect(o.userEvents[0]).toBe(userEvent);
  });

  it('the caret is placed after the inserted content for text, rich HTML and file pastes', async () => {
    for (const [setup, payload] of [
      [PLAIN, { text: 'one\ntwo' }],
      [PLAIN, { html: RICH, text: 'x' }],
      [PLAIN, { files: [png()], text: 'cap' }],
    ] as const) {
      const o = await paste(setup, payload);

      expect(o.caret).toBe(5 + (o.doc.length - o.before.length)); // PLAIN puts the caret at 5
      cleanup();
    }
  });

  it('[behaviour] two quick pastes are two undo steps, and one undo removes only the second', async () => {
    const { container } = render(<MarkdownEditor pageId="page" markdown="Start" />);
    const root = rootOf(container);
    act(() => root.dispatch({ selection: { anchor: 5 } }));
    const depth = undoDepth(root.state);

    act(() => {
      root.contentDOM.dispatchEvent(pasteEvent({ text: ' one' }));
    });
    act(() => {
      root.contentDOM.dispatchEvent(pasteEvent({ text: ' two' }));
    });
    expect(root.state.doc.toString()).toBe('Start one two');
    expect(undoDepth(root.state) - depth).toBe(2);

    act(() => {
      undo(root);
    });
    expect(root.state.doc.toString()).toBe('Start one');
  });

  it('[behaviour] an asynchronous file paste is one undo step, and undo leaves the stored asset in place (the file is kept in Assets/)', async () => {
    const o = await paste(PLAIN, { files: [png()], text: '' });

    expect(o.undoSteps).toBe(1);
    expect(o.undoRestores).toBe(true);
    expect(o.stored).toEqual(['Assets/shot-1.png']); // nothing removes it
  });
});

// ═══ E. asynchronous asset lifecycle and read-only behaviour ═══════════════════════════════════════════

describe('E. asynchronous asset import — lifecycle', () => {
  function pending() {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { gate, release };
  }

  it('[intentional] the editor becomes read-only while the import is pending: the asset is stored, nothing is inserted, and the app is told (no orphaned asset)', async () => {
    const { gate, release } = pending();
    const fake = fakeAssets({ gate });
    const { container, rerender } = render(<MarkdownEditor pageId="page" markdown="Start" pasteAssets={fake.assets} />);
    const root = rootOf(container);
    act(() => root.dispatch({ selection: { anchor: 5 } }));
    act(() => {
      root.contentDOM.dispatchEvent(pasteEvent({ files: [png()], text: '' }));
    });

    rerender(<MarkdownEditor pageId="page" markdown="Start" readOnly pasteAssets={fake.assets} />);
    release();
    await sleep(40);

    expect(root.state.readOnly).toBe(true);
    expect(root.state.doc.toString()).toBe('Start');
    expect(fake.stored).toEqual(['Assets/shot-1.png']);
    expect(fake.notInserted).toEqual([1]);
    expect(fake.notInsertedReasons).toEqual(['readOnly']);
    expect(fake.failed).toEqual([]);
  });

  it('[intentional] the editor is destroyed during the import: nothing is inserted, the file stays in Assets/, and the app is told how many were kept', async () => {
    const { gate, release } = pending();
    const fake = fakeAssets({ gate });
    const { container, unmount } = render(<MarkdownEditor pageId="page" markdown="Start" pasteAssets={fake.assets} />);
    const root = rootOf(container);
    act(() => root.dispatch({ selection: { anchor: 5 } }));
    act(() => {
      root.contentDOM.dispatchEvent(pasteEvent({ files: [png()], text: '' }));
    });

    unmount();
    release();
    await sleep(40);

    expect(root.state.doc.toString()).toBe('Start');
    expect(fake.stored).toEqual(['Assets/shot-1.png']);
    expect(fake.notInserted).toEqual([1]);
    expect(fake.notInsertedReasons).toEqual(['closed']);
  });

  it('[intentional] switching pages unmounts the editor (PageHost keys it by page): the embed is not inserted into the next page, and the app is told', async () => {
    const { gate, release } = pending();
    const fake = fakeAssets({ gate });
    const { container, rerender } = render(<MarkdownEditor key="p1" pageId="p1" markdown="Page one" pasteAssets={fake.assets} />);
    const first = rootOf(container);
    act(() => first.dispatch({ selection: { anchor: 8 } }));
    act(() => {
      first.contentDOM.dispatchEvent(pasteEvent({ files: [png()], text: '' }));
    });

    rerender(<MarkdownEditor key="p2" pageId="p2" markdown="Page two" pasteAssets={fake.assets} />);
    release();
    await sleep(40);

    expect(rootOf(container).state.doc.toString()).toBe('Page two');
    expect(first.state.doc.toString()).toBe('Page one');
    expect(fake.notInserted).toEqual([1]);
  });

  it('[inferred] if a host did NOT key the editor by page, the same instance would receive the embed in the next page\'s text (shown here only to document why the key matters)', async () => {
    const { gate, release } = pending();
    const fake = fakeAssets({ gate });
    const { container, rerender } = render(<MarkdownEditor pageId="p1" markdown="Page one" pasteAssets={fake.assets} />);
    const first = rootOf(container);
    act(() => first.dispatch({ selection: { anchor: 8 } }));
    act(() => {
      first.contentDOM.dispatchEvent(pasteEvent({ files: [png()], text: '' }));
    });

    rerender(<MarkdownEditor pageId="p2" markdown="Page two" pasteAssets={fake.assets} />);
    release();
    await sleep(40);

    expect(rootOf(container)).toBe(first);
    expect(first.state.doc.toString()).toBe('Page two![[Assets/shot-1.png]]');
  });

  it('[intentional] the document changes during the import: the content goes in at the caret as it is then, not where the paste started', async () => {
    const { gate, release } = pending();
    const fake = fakeAssets({ gate });
    const { container } = render(<MarkdownEditor pageId="page" markdown="Start end" pasteAssets={fake.assets} />);
    const root = rootOf(container);
    act(() => root.dispatch({ selection: { anchor: 5 } }));
    act(() => {
      root.contentDOM.dispatchEvent(pasteEvent({ files: [png()], text: '' }));
    });

    act(() => root.dispatch({ changes: { from: 0, insert: 'XX ' }, selection: { anchor: 9 } }));
    release();
    await sleep(40);

    expect(root.state.doc.toString()).toBe('XX Start ![[Assets/shot-1.png]]end');
  });

  it('[intentional] text pasted while an import is pending stays, and the embed follows it', async () => {
    const { gate, release } = pending();
    const fake = fakeAssets({ gate });
    const { container } = render(<MarkdownEditor pageId="page" markdown="Start" pasteAssets={fake.assets} />);
    const root = rootOf(container);
    act(() => root.dispatch({ selection: { anchor: 5 } }));
    act(() => {
      root.contentDOM.dispatchEvent(pasteEvent({ files: [png('a.png')], text: '' }));
    });
    act(() => {
      root.contentDOM.dispatchEvent(pasteEvent({ text: ' typed' }));
    });

    release();
    await sleep(40);

    expect(root.state.doc.toString()).toBe('Start typed![[Assets/a-1.png]]');
  });

  it('[intentional] an import failure is reported, and the text that came with the file is still inserted', async () => {
    const o = await paste({ ...PLAIN, markdown: 'Start', caret: 5, assets: { fails: () => true } }, { files: [png()], text: 'caption' });

    expect(o.doc).toBe('Startcaption');
    expect(o.failed).toEqual([['shot.png']]);
    expect(o.stored).toEqual([]);
  });

  it('[intentional] when only some files fail, the others are embedded and the failures reported once', async () => {
    const o = await paste({ markdown: 'Start', caret: 5, assets: { fails: (name) => name === 'a.png' } }, { files: [png('a.png'), png('b.png')], text: '' });

    expect(o.doc).toBe('Start![[Assets/b-1.png]]');
    expect(o.failed).toEqual([['a.png']]);
  });

  it('[intentional] when every file fails and there is no text, the document is unchanged and the failure is reported', async () => {
    const o = await paste({ markdown: 'Start', caret: 5, assets: { fails: () => true } }, { files: [png()], text: '' });

    expect(o.doc).toBe('Start');
    expect(o.failed).toEqual([['shot.png']]);
    expect(o.undoSteps).toBe(0);
  });

  it('[intentional] identical bytes pasted twice are stored once and embedded twice', async () => {
    const o = await paste({ markdown: 'Start', caret: 5 }, { files: [png('a.png'), png('b.png')], text: '' });

    expect(o.doc).toBe('Start![[Assets/a-1.png]]\n![[Assets/a-1.png]]');
    expect(o.stored).toEqual(['Assets/a-1.png']);
  });

  it('[behaviour] the same screenshot pasted in two separate pastes is stored twice (no cross-paste de-duplication)', async () => {
    const fake = fakeAssets();
    const { container } = render(<MarkdownEditor pageId="page" markdown="Start" pasteAssets={fake.assets} />);
    const root = rootOf(container);
    act(() => root.dispatch({ selection: { anchor: 5 } }));
    for (let i = 0; i < 2; i += 1) {
      act(() => {
        root.contentDOM.dispatchEvent(pasteEvent({ files: [png()], text: '' }));
      });
      await sleep();
    }

    expect(fake.stored).toEqual(['Assets/shot-1.png', 'Assets/shot-2.png']);
  });

  it('[intentional] a read-only editor ignores a paste entirely', async () => {
    const fake = fakeAssets();
    const { container } = render(<MarkdownEditor pageId="page" markdown="Start" readOnly pasteAssets={fake.assets} />);
    const root = rootOf(container);

    act(() => {
      root.contentDOM.dispatchEvent(pasteEvent({ files: [png()], text: 'x' }));
    });
    await sleep();

    expect(root.state.doc.toString()).toBe('Start');
    expect(fake.stored).toEqual([]);
  });
});

// ═══ F. a paste with nothing to insert never deletes the selection ═════════════════════════════════════

describe('F. an empty-text paste leaves the selection alone, and everything with a meaning is still handled', () => {
  const SELECTED_TEXT: Setup = { markdown: 'Keep this text', selection: [0, 14] };

  it('an unsupported file with empty text and no HTML: the document is unchanged and no transaction is dispatched', async () => {
    const o = await paste(SELECTED_TEXT, { files: [docx()], text: '' });

    expect(o.prevented).toBe(true);
    expect(o.doc).toBe('Keep this text');
    expect(o.userEvents).toEqual([]);
    expect(o.undoSteps).toBe(0);
    expect(o.stored).toEqual([]);
  });

  it('an empty clipboard: the selection stays, nothing is dispatched, and nothing throws', async () => {
    const o = await paste(SELECTED_TEXT, {});

    expect(o.doc).toBe('Keep this text');
    expect(o.userEvents).toEqual([]);
    expect(o.undoSteps).toBe(0);
  });

  it('HTML that is not rich and has no plain-text twin: the default paste would have inserted nothing, so nothing happens', async () => {
    const o = await paste(SELECTED_TEXT, { html: '<div><span>hello</span></div>' });

    expect(o.doc).toBe('Keep this text');
    expect(o.userEvents).toEqual([]);
  });

  it('the selection itself is not touched either', async () => {
    const fake = fakeAssets();
    const { container } = render(<MarkdownEditor pageId="page" markdown="Keep this text" pasteAssets={fake.assets} />);
    const root = rootOf(container);
    act(() => root.dispatch({ selection: { anchor: 5, head: 9 } }));

    act(() => {
      root.contentDOM.dispatchEvent(pasteEvent({ files: [docx()], text: '' }));
    });

    expect([root.state.selection.main.from, root.state.selection.main.to]).toEqual([5, 9]);
  });

  it('a supported image in a cell (no asset handler there) does not empty a selected cell either', async () => {
    const fake = fakeAssets();
    const { container } = render(<MarkdownEditor pageId="page" markdown={DOC_TABLE} pasteAssets={fake.assets} />);
    const root = rootOf(container);
    activateCell(root, 'a1');

    act(() => {
      nestedOf(container)!.contentDOM.dispatchEvent(pasteEvent({ files: [png()], text: '' }));
    });
    await sleep();

    expect(root.state.doc.toString()).toBe(DOC_TABLE);
  });

  // What still works: the guard only sees a clipboard no other handler wanted.
  it('normal text still replaces the selection, as one input.paste step', async () => {
    const o = await paste(SELECTED_TEXT, { text: 'new' });

    expect(o.doc).toBe('new');
    expect(o.userEvents[0]).toBe('input.paste');
    expect(o.undoSteps).toBe(1);
    expect(o.undoRestores).toBe(true);
  });

  it('whitespace-only text is still text and replaces the selection', async () => {
    expect((await paste(SELECTED_TEXT, { text: ' ' })).doc).toBe(' ');
  });

  it('a URI list on its own is still pasted (CodeMirror\'s own fallback)', async () => {
    expect((await paste(SELECTED_TEXT, { uriList: 'https://example.com' })).doc).toBe('https://example.com');
  });

  it('a supported file with empty text is still stored and embedded in place of the selection', async () => {
    const o = await paste(SELECTED_TEXT, { files: [png()], text: '' });

    expect(o.doc).toBe('![[Assets/shot-1.png]]');
    expect(o.stored).toEqual(['Assets/shot-1.png']);
  });

  it('rich HTML with empty plain text is still converted', async () => {
    expect((await paste(SELECTED_TEXT, { html: '<p>hi <b>b</b></p>', text: '' })).doc).toBe('hi **b**');
  });

  it('an HTML table with empty plain text still creates a table (tableCreatePaste runs first)', async () => {
    const o = await paste(PLAIN, { html: htmlTable([['a', 'b'], ['c', 'd']]), text: '' });

    expect(o.doc).toContain('| a | b |');
    expect(o.doc).toContain('| c | d |');
  });

  it('an HTML table with empty plain text still fills selected cells (the guard runs after tablePaste)', async () => {
    const o = await paste({ markdown: DOC_TABLE, range: [[1, 0], [2, 1]] }, { html: htmlTable([['x1', 'y1'], ['x2', 'y2']]), text: '' });

    expect(o.doc).toBe(FILLED);
  });

  it('an HTML table with empty plain text still fills the table from an active cell (the guard runs after tableCellPaste)', async () => {
    const o = await paste({ markdown: DOC_TABLE, cell: 'a1' }, { html: htmlTable([['x1', 'y1'], ['x2', 'y2']]), text: '' }, 'cell');

    expect(o.doc).toBe(FILLED);
  });
});

// ═══ G. files that are not added are reported, once per paste ═════════════════════════════════════════

describe('G. skipped files — reported, never silent', () => {
  const SELECTED: Setup = { markdown: DOC_TABLE, range: [[1, 0], [2, 1]] };
  const TABLE_HTML = htmlTable([['x1', 'y1'], ['x2', 'y2']]);

  it('[intentional] a supported file only: embedded, nothing reported', async () => {
    const o = await paste(PLAIN, { files: [png()] });

    expect(o.doc).toContain('![[Assets/shot-1.png]]');
    expect(o.skipped).toEqual([]);
    expect(o.failed).toEqual([]);
  });

  it('[intentional] an unsupported file only: reported as unsupported; the document is untouched', async () => {
    const o = await paste(PLAIN, { files: [docx()] });

    expect(o.doc).toBe(o.before);
    expect(o.stored).toEqual([]);
    expect(o.skipped).toEqual([{ names: ['notes.docx'], reason: 'unsupported' }]);
    expect(o.failed).toEqual([]);
  });

  it('[intentional] supported and unsupported together: the supported one is embedded, only the other is reported', async () => {
    const o = await paste(PLAIN, { files: [png(), docx(), pdf()] });

    expect(o.doc).toContain('![[Assets/shot-1.png]]');
    expect(o.doc).toContain('![[Assets/doc-2.pdf]]');
    expect(o.skipped).toEqual([{ names: ['notes.docx'], reason: 'unsupported' }]);
  });

  it('[intentional] several unsupported files give one consolidated report', async () => {
    const o = await paste(PLAIN, { files: [docx('a.docx'), docx('b.docx'), docx('c.docx')] });

    expect(o.skipped).toEqual([{ names: ['a.docx', 'b.docx', 'c.docx'], reason: 'unsupported' }]);
  });

  it('[intentional] an unsupported file with empty text still changes nothing, and is reported', async () => {
    const o = await paste({ ...PLAIN, selection: [0, 5] }, { files: [docx()], text: '' });

    expect(o.doc).toBe(o.before);
    expect(o.skipped).toHaveLength(1);
  });

  it('[intentional] a file next to an HTML table: the table wins, the file is reported as not added', async () => {
    const o = await paste({ markdown: 'Start\n\nEnd', caret: 5 }, { html: TABLE_HTML, text: TSV, files: [png()] });

    expect(o.doc).toContain('| x1 | y1 |');
    expect(o.doc).not.toContain('![[');
    expect(o.stored).toEqual([]);
    expect(o.skipped).toEqual([{ names: ['shot.png'], reason: 'target' }]);
  });

  it('[intentional] a file next to rich (non-table) HTML: the file is embedded and nothing is reported', async () => {
    const o = await paste(PLAIN, { html: RICH, files: [png()] });

    expect(o.doc).toContain('![[Assets/shot-1.png]]');
    expect(o.skipped).toEqual([]);
  });

  it('[intentional] a file with a table range selected: nothing inserted, one report with every file', async () => {
    const o = await paste(SELECTED, { files: [png(), docx()] });

    expect(o.doc).toBe(o.before);
    expect(o.stored).toEqual([]);
    expect(o.skipped).toEqual([{ names: ['shot.png', 'notes.docx'], reason: 'target' }]);
  });

  it('[intentional] a file with a range selected next to a table still fills the cells and reports the file', async () => {
    const o = await paste(SELECTED, { html: TABLE_HTML, text: TSV, files: [pdf()] });

    expect(o.doc).toBe(FILLED);
    expect(o.skipped).toEqual([{ names: ['doc.pdf'], reason: 'target' }]);
  });

  it('[intentional] an image or PDF pasted into an active cell: nothing inserted, reported as not added', async () => {
    const o = await paste({ markdown: DOC_TABLE, cell: 'a1' }, { files: [png(), pdf()] }, 'cell');

    expect(o.doc).toBe(o.before);
    expect(o.stored).toEqual([]);
    expect(o.skipped).toEqual([{ names: ['shot.png', 'doc.pdf'], reason: 'target' }]);
  });

  it('[intentional] a file next to a grid pasted in a cell: the grid fills, the file is reported', async () => {
    const o = await paste({ markdown: DOC_TABLE, cell: 'a1' }, { text: TSV, files: [png()] }, 'cell');

    expect(o.skipped).toEqual([{ names: ['shot.png'], reason: 'target' }]);
  });

  it('[intentional] a failed import is onFailed, not onSkipped — and an unsupported file beside it is the other', async () => {
    const o = await paste(PLAIN, { files: [png('bad.png'), docx()] }, 'root');
    expect(o.skipped).toEqual([{ names: ['notes.docx'], reason: 'unsupported' }]);

    const failing = await paste({ ...PLAIN, assets: { fails: (name) => name === 'bad.png' } }, { files: [png('bad.png'), docx()] });
    expect(failing.failed).toEqual([['bad.png']]);
    expect(failing.skipped).toEqual([{ names: ['notes.docx'], reason: 'unsupported' }]);

    const onlyFailing = await paste({ ...PLAIN, assets: { fails: () => true } }, { files: [png()] });
    expect(onlyFailing.failed).toEqual([['shot.png']]);
    expect(onlyFailing.skipped).toEqual([]);
  });

  it('[intentional] plain text with no files reports nothing', async () => {
    expect((await paste(PLAIN, { text: 'hello' })).skipped).toEqual([]);
    expect((await paste({ markdown: DOC_TABLE, cell: 'a1' }, { text: 'hello' }, 'cell')).skipped).toEqual([]);
  });
});

// ═══ H. lifecycle after the import: one notice, the right one ═════════════════════════════════════════

const distinct = (name: string, byte: number, type = 'image/png') => new File([new Uint8Array([byte, 7])], name, { type });

describe('H. after the import — insertion is re-checked against the live editor', () => {
  function pending() {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { gate, release };
  }

  async function start(files: File[], assets: Parameters<typeof fakeAssets>[0], markdown = 'Start') {
    const fake = fakeAssets(assets);
    const view = render(<MarkdownEditor pageId="page" markdown={markdown} pasteAssets={fake.assets} />);
    const root = rootOf(view.container);
    act(() => root.dispatch({ selection: { anchor: 5 } }));
    act(() => {
      root.contentDOM.dispatchEvent(pasteEvent({ files, text: '' }));
    });
    return { fake, root, ...view };
  }

  it('[intentional] read-only during a multiple-file import: every file stored, nothing inserted, ONE notice with the count', async () => {
    const { gate, release } = pending();
    const { fake, root, rerender } = await start([distinct('a.png', 1), distinct('b.pdf', 2, 'application/pdf'), distinct('c.png', 3)], { gate });

    rerender(<MarkdownEditor pageId="page" markdown="Start" readOnly pasteAssets={fake.assets} />);
    release();
    await sleep(60);

    expect(root.state.doc.toString()).toBe('Start');
    expect(fake.stored).toHaveLength(3);
    expect(fake.notInserted).toEqual([3]);
    expect(fake.notInsertedReasons).toEqual(['readOnly']);
    expect(fake.failed).toEqual([]);
  });

  it('[intentional] read-only mid-import with one file failing: the stored ones are not-inserted, the failure is reported separately', async () => {
    const { gate, release } = pending();
    const { fake, rerender } = await start([distinct('a.png', 1), distinct('bad.png', 2)], { gate, fails: (name) => name === 'bad.png' });

    rerender(<MarkdownEditor pageId="page" markdown="Start" readOnly pasteAssets={fake.assets} />);
    release();
    await sleep(60);

    expect(fake.notInserted).toEqual([1]);
    expect(fake.failed).toEqual([['bad.png']]);
  });

  it('[intentional] read-only mid-import and the import fails: only onFailed — nothing was stored, so nothing is "not inserted"', async () => {
    const { gate, release } = pending();
    const { fake, rerender } = await start([png()], { gate, fails: () => true });

    rerender(<MarkdownEditor pageId="page" markdown="Start" readOnly pasteAssets={fake.assets} />);
    release();
    await sleep(60);

    expect(fake.stored).toEqual([]);
    expect(fake.notInserted).toEqual([]);
    expect(fake.failed).toEqual([['shot.png']]);
  });

  it('[intentional] read-only and then editable again before the import finishes: inserted normally, no notice', async () => {
    const { gate, release } = pending();
    const { fake, root, rerender } = await start([png()], { gate });

    rerender(<MarkdownEditor pageId="page" markdown="Start" readOnly pasteAssets={fake.assets} />);
    rerender(<MarkdownEditor pageId="page" markdown="Start" pasteAssets={fake.assets} />);
    release();
    await sleep(60);

    expect(root.state.doc.toString()).toBe('Start![[Assets/shot-1.png]]');
    expect(fake.notInserted).toEqual([]);
    expect(fake.failed).toEqual([]);
  });

  it('[intentional] the editor is detached from the page during the import: nothing inserted, one not-inserted notice', async () => {
    const { gate, release } = pending();
    const { fake, root } = await start([png()], { gate });

    root.dom.remove();
    release();
    await sleep(60);

    expect(root.state.doc.toString()).toBe('Start');
    expect(fake.stored).toEqual(['Assets/shot-1.png']);
    expect(fake.notInserted).toEqual([1]);
    expect(fake.notInsertedReasons).toEqual(['closed']);
  });

  it('[intentional] destroyed during a multiple-file import: one notice with the count', async () => {
    const { gate, release } = pending();
    const { fake, unmount } = await start([distinct('a.png', 1), distinct('b.png', 2)], { gate });

    unmount();
    release();
    await sleep(60);

    expect(fake.notInserted).toEqual([2]);
    expect(fake.notInsertedReasons).toEqual(['closed']);
  });

  it('[intentional] editable throughout and the import succeeds: embedded, no notices, and one undo removes it', async () => {
    const { gate, release } = pending();
    const { fake, root } = await start([distinct('a.png', 1), distinct('b.pdf', 2, 'application/pdf')], { gate });

    release();
    await sleep(60);

    expect(root.state.doc.toString()).toBe('Start![[Assets/a-1.png]]\n![[Assets/b-2.pdf]]');
    expect(fake.notInserted).toEqual([]);
    expect(fake.failed).toEqual([]);
    expect(fake.skipped).toEqual([]);
    act(() => {
      undo(root);
    });
    expect(root.state.doc.toString()).toBe('Start');
  });

  it('[intentional] the import fails before storage while editable: onFailed once, no not-inserted', async () => {
    const { fake, root } = await start([distinct('a.png', 1), distinct('b.png', 2)], { fails: () => true });
    await sleep(60);

    expect(root.state.doc.toString()).toBe('Start');
    expect(fake.failed).toEqual([['a.png', 'b.png']]);
    expect(fake.notInserted).toEqual([]);
  });

  it('[intentional] a partial failure while editable: the rest is inserted, the failure reported once', async () => {
    const { fake, root } = await start([distinct('a.png', 1), distinct('bad.png', 2), distinct('c.pdf', 3, 'application/pdf')], { fails: (name) => name === 'bad.png' });
    await sleep(60);

    expect(root.state.doc.toString()).toBe('Start![[Assets/a-1.png]]\n![[Assets/c-2.pdf]]');
    expect(fake.failed).toEqual([['bad.png']]);
    expect(fake.notInserted).toEqual([]);
  });

  it('[intentional] the document changing during the import keeps the caret fallback and gives no notice', async () => {
    const { gate, release } = pending();
    const { fake, root } = await start([png()], { gate }, 'Start end');

    act(() => root.dispatch({ changes: { from: 0, insert: 'XX ' }, selection: { anchor: 9 } }));
    release();
    await sleep(60);

    expect(root.state.doc.toString()).toBe('XX Start ![[Assets/shot-1.png]]end');
    expect(fake.notInserted).toEqual([]);
  });
});

// ═══ I. a table or rich HTML never corrupts the block it is pasted into ═══════════════════════════════

/** The names of the Lezer nodes of `doc` (top-level and nested), in document order. */
function nodeNames(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  const names: string[] = [];
  ensureSyntaxTree(state, doc.length, 5000)!.iterate({ enter: (node) => void names.push(node.name) });
  return names;
}

describe('I. insertion context — own block, list items, quotes, code', () => {
  const GRID = 'a\tb\nc\td';
  const TABLE_MD = '| a | b |\n| - | - |\n| c | d |';

  it('[intentional] mid-paragraph: the text before and after is kept in its own blocks, the table has exactly its own rows', async () => {
    const o = await paste({ markdown: 'Start middle end', caret: 6 }, { text: GRID });

    expect(o.doc).toBe(`Start \n\n${TABLE_MD}\n\nmiddle end`);
    const names = nodeNames(o.doc);
    expect(names.filter((name) => name === 'Table')).toHaveLength(1);
    expect(names.filter((name) => name === 'TableRow')).toHaveLength(1);
    expect(names.filter((name) => name === 'Paragraph')).toHaveLength(2);
  });

  it('[intentional] at the start of a paragraph: the table goes first, the text follows after a blank line', async () => {
    const o = await paste({ markdown: 'Start middle end', caret: 0 }, { text: GRID });

    expect(o.doc).toBe(`${TABLE_MD}\n\nStart middle end`);
    expect(nodeNames(o.doc).filter((name) => name === 'TableRow')).toHaveLength(1);
  });

  it('[intentional] at the end of a paragraph: the table follows after a blank line, nothing after it', async () => {
    const o = await paste({ markdown: 'Start middle end', caret: 16 }, { text: GRID });

    expect(o.doc).toBe(`Start middle end\n\n${TABLE_MD}\n`);
  });

  it('[intentional] at the end of a line directly followed by another line: that line does not become a row', async () => {
    const o = await paste({ markdown: 'one\ntwo', caret: 3 }, { text: GRID });

    expect(o.doc).toBe(`one\n\n${TABLE_MD}\n\ntwo`);
    expect(nodeNames(o.doc).filter((name) => name === 'TableRow')).toHaveLength(1);
  });

  it('[intentional] a table from HTML (and from Clutter\'s own MIME) lands the same way', async () => {
    expect((await paste({ markdown: 'Start middle end', caret: 6 }, { html: htmlTable([['a', 'b'], ['c', 'd']]), text: GRID })).doc).toBe(`Start \n\n${TABLE_MD}\n\nmiddle end`);
    expect((await paste({ markdown: 'Start middle end', caret: 6 }, { internal: internalTable([['a', 'b'], ['c', 'd']]), text: GRID })).doc).toBe(`Start \n\n${TABLE_MD}\n\nmiddle end`);
  });

  it('[intentional] a selection spanning text is replaced and the table still gets its own block', async () => {
    const o = await paste({ markdown: 'Start middle end', selection: [6, 12] }, { text: GRID });

    expect(o.doc).toBe(`Start \n\n${TABLE_MD}\n\n end`);
  });

  it('[intentional] normal creation outside protected contexts is unchanged: on an empty line, between blocks', async () => {
    expect((await paste({ markdown: '', caret: 0 }, { text: GRID })).doc).toBe(`${TABLE_MD}\n`);
    expect((await paste({ markdown: 'Start\n\n\nEnd', caret: 7 }, { text: GRID })).doc).toBe(`Start\n\n${TABLE_MD}\n\nEnd`);
  });

  it('[intentional] existing-table range paste is unchanged', async () => {
    const o = await paste({ markdown: DOC_TABLE, range: [[1, 0], [2, 1]] }, { text: TSV });

    expect(o.doc).toBe(FILLED);
  });

  // The policy for list items, quotes and code: a table is not created; the clipboard's plain text goes in as it is.
  it.each([
    ['a bullet item', '- item one', 6],
    ['an ordered item', '1. item one', 7],
    ['a blockquote', '> quoted text', 8],
  ])('[intentional] in %s no table is created: the plain text is inserted and the structure is unchanged', async (_name, markdown, caret) => {
    const o = await paste({ markdown, caret }, { text: GRID });

    expect(o.doc).toBe(`${markdown.slice(0, caret)}${GRID}${markdown.slice(caret)}`);
    expect(nodeNames(o.doc)).not.toContain('Table');
    expect(findAllTables(rootStateOf(o.doc))).toHaveLength(0);
  });

  it('[intentional] in a list item an HTML table is not created either', async () => {
    const o = await paste({ markdown: '- item one', caret: 6 }, { html: htmlTable([['a', 'b'], ['c', 'd']]), text: GRID });

    expect(o.doc).toBe(`- item${GRID} one`);
  });

  it('[intentional] in a fenced code block the clipboard is literal: no table, the fence is intact', async () => {
    const o = await paste({ markdown: '```\ncode\n```', caret: 8 }, { text: GRID });

    expect(o.doc).toBe(`\`\`\`\ncode${GRID}\n\`\`\``);
    const names = nodeNames(o.doc);
    expect(names).toContain('FencedCode');
    expect(names).not.toContain('Table');
  });

  it('[intentional] in a fenced code block an HTML table is not created and its text is kept', async () => {
    const o = await paste({ markdown: '```\ncode\n```', caret: 8 }, { html: htmlTable([['a', 'b'], ['c', 'd']]), text: GRID });

    expect(o.doc).toBe(`\`\`\`\ncode${GRID}\n\`\`\``);
  });

  it('[intentional] rich HTML in a fenced code block is not converted: the copied text goes in as it is', async () => {
    const o = await paste({ markdown: '```\ncode\n```', caret: 8 }, { html: '<p>x <b>y</b> <a href="https://e.com">z</a></p>', text: 'x y z' });

    expect(o.doc).toBe('```\ncodex y z\n```');
    const names = nodeNames(o.doc);
    expect(names).toContain('FencedCode');
    expect(names).not.toContain('StrongEmphasis');
    expect(names).not.toContain('Link');
  });

  it('[intentional] HTML tags in copied code stay literal text inside the fence', async () => {
    const o = await paste({ markdown: '```\n\n```', caret: 4 }, { html: '<div><b>x</b></div>', text: '<div><b>x</b></div>' });

    expect(o.doc).toBe('```\n<div><b>x</b></div>\n```');
    expect(nodeNames(o.doc)).not.toContain('HTMLBlock');
  });

  it('[intentional] rich HTML outside code is still converted', async () => {
    expect((await paste(PLAIN, { html: RICH, text: 'hello bold' })).doc).toContain('**bold**');
  });

  it('[intentional] a table in a code block inside a list item is also declined (innermost context wins)', async () => {
    const md = '- item\n\n  ```\n  code\n  ```';
    const o = await paste({ markdown: md, caret: md.indexOf('code') + 4 }, { text: GRID });

    expect(nodeNames(o.doc)).not.toContain('Table');
  });
});

function rootStateOf(doc: string): EditorState {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  ensureSyntaxTree(state, doc.length, 5000);
  return state;
}

// ═══ J. a literal "|" pasted into table cells stays cell content ══════════════════════════════════════

/** The number of Lezer `TableCell` nodes in each row of `doc`'s first table (header, then body rows). */
function cellCounts(doc: string): number[] {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  const counts: number[] = [];
  ensureSyntaxTree(state, doc.length, 5000)!.iterate({
    enter: (node) => {
      if (node.name === 'TableHeader' || node.name === 'TableRow') {
        counts.push(0);
      }
      if (node.name === 'TableCell') {
        counts[counts.length - 1]! += 1;
      }
    },
  });
  return counts;
}

describe('J. pipes pasted into cells', () => {
  const CELL: Setup = { markdown: DOC_TABLE, cell: 'a1' };
  const row = (doc: string) => doc.split('\n')[4];

  it('[intentional] plain text with a pipe is escaped; the row keeps its two cells', async () => {
    const o = await paste(CELL, { text: 'a|b' }, 'cell');

    expect(row(o.doc)).toBe('| a\\|b | b1 |');
    expect(cellCounts(o.doc)).toEqual([2, 2, 2]);
  });

  it('[intentional] several pipes in one cell are all escaped', async () => {
    const o = await paste(CELL, { text: 'x|y|z' }, 'cell');

    expect(row(o.doc)).toBe('| x\\|y\\|z | b1 |');
    expect(cellCounts(o.doc)).toEqual([2, 2, 2]);
  });

  it('[intentional] rich HTML with a pipe pastes its text escaped (no conversion in a cell)', async () => {
    const o = await paste(CELL, { html: '<p>a|<b>b</b></p>', text: 'a|b' }, 'cell');

    expect(row(o.doc)).toBe('| a\\|b | b1 |');
    expect(cellCounts(o.doc)).toEqual([2, 2, 2]);
  });

  it('[intentional] an already escaped pipe is not escaped again', async () => {
    const o = await paste(CELL, { text: 'a\\|b' }, 'cell');

    expect(row(o.doc)).toBe('| a\\|b | b1 |');
    expect(cellCounts(o.doc)).toEqual([2, 2, 2]);
  });

  it('[intentional] a backslash run before a pipe: odd means escaped, even means a literal backslash and a pipe that needs escaping', async () => {
    expect(row((await paste(CELL, { text: 'a\\\\|b' }, 'cell')).doc)).toBe('| a\\\\\\|b | b1 |');
    expect(row((await paste(CELL, { text: 'a\\\\\\|b' }, 'cell')).doc)).toBe('| a\\\\\\|b | b1 |');
    const even = await paste(CELL, { text: 'a\\\\|b' }, 'cell');
    expect(cellCounts(even.doc)).toEqual([2, 2, 2]);
  });

  it('[intentional] text without a pipe is unchanged', async () => {
    expect(row((await paste(CELL, { text: 'plain' }, 'cell')).doc)).toBe('| plain | b1 |');
    expect(row((await paste(CELL, { text: 'a\\b' }, 'cell')).doc)).toBe('| a\\b | b1 |');
  });

  it('[intentional] a grid of plain text pasted from a cell has its pipes escaped and the table keeps its shape', async () => {
    const o = await paste(CELL, { text: 'p|q\tr' }, 'cell');

    expect(o.doc).toContain('p\\|q');
    expect(cellCounts(o.doc)).toEqual([2, 2, 2]);
  });

  it('[intentional] an HTML table pasted over selected cells has its pipes escaped', async () => {
    const o = await paste({ markdown: DOC_TABLE, range: [[1, 0], [1, 0]] }, { html: htmlTable([['x|y']]), text: 'x|y' });

    expect(o.doc).toContain('| x\\|y');
    expect(cellCounts(o.doc)).toEqual([2, 2, 2]);
  });

  it('[intentional] Clutter\'s own clipboard is not escaped again', async () => {
    const o = await paste(CELL, { internal: internalTable([['A \\| B']]), text: 'A | B' }, 'cell');

    expect(o.doc).toContain('A \\| B');
    expect(o.doc).not.toContain('\\\\|');
    expect(cellCounts(o.doc)).toEqual([2, 2, 2]);
  });

  it('[intentional] plain range paste without pipes is unchanged', async () => {
    expect((await paste({ markdown: DOC_TABLE, range: [[1, 0], [2, 1]] }, { text: TSV })).doc).toBe(FILLED);
  });

  it('[intentional] table creation keeps escaping plain pipes, and is unchanged for text without them', async () => {
    const o = await paste(PLAIN, { text: 'a|x\tb\nc\td' });

    expect(o.doc).toContain('| a\\|x | b |');
    expect(cellCounts(o.doc)).toEqual([2, 2]);
    expect((await paste(PLAIN, { text: TSV })).doc).toContain('| x1 | y1 |');
  });
});

// ═══ K. one classification decision per paste, one strategy executed ═══════════════════════════════════

describe('K. the paste router', () => {
  const TABLE_HTML = htmlTable([['a', 'b'], ['c', 'd']]);
  const classify = vi.mocked(classifyPaste);

  /** The strategy `classifyPaste` chose for each classification made while `run` ran. */
  async function decisions(run: () => Promise<unknown>): Promise<PasteStrategy[]> {
    classify.mockClear();
    await run();
    return classify.mock.results.map((result) => (result.value as { strategy: PasteStrategy }).strategy);
  }

  it.each<[string, Setup, Payload, 'root' | 'cell', PasteStrategy]>([
    ['a selected range and a grid', { markdown: DOC_TABLE, range: [[1, 0], [2, 1]] }, { text: TSV }, 'root', 'tableRange'],
    ['an active cell and a grid', { markdown: DOC_TABLE, cell: 'a1' }, { text: TSV }, 'cell', 'tableCell'],
    ['an active cell and plain text', { markdown: DOC_TABLE, cell: 'a1' }, { text: 'x' }, 'cell', 'tableCell'],
    ['an active cell and an image', { markdown: DOC_TABLE, cell: 'a1' }, { files: [png()], text: '' }, 'cell', 'empty'],
    ['a grid at a caret', PLAIN, { text: TSV }, 'root', 'tableCreate'],
    ['two bare HTML tables', PLAIN, { html: htmlTable([['a']]) + htmlTable([['b']]), text: 'a\nb' }, 'root', 'richHtml'],
    ['an image', PLAIN, { files: [png()], text: '' }, 'root', 'files'],
    ['an image next to an HTML table', PLAIN, { files: [png()], html: TABLE_HTML, text: TSV }, 'root', 'tableCreate'],
    ['an image next to rich HTML', PLAIN, { files: [png()], html: RICH, text: 'hello bold' }, 'root', 'files'],
    ['rich HTML', PLAIN, { html: RICH, text: 'hello bold' }, 'root', 'richHtml'],
    ['plain text', PLAIN, { text: 'hello' }, 'root', 'default'],
    ['an empty clipboard', PLAIN, {}, 'root', 'empty'],
    ['a grid in a bullet item', { markdown: '- item', caret: 4 }, { text: TSV }, 'root', 'default'],
    ['a grid in a blockquote', { markdown: '> quote', caret: 4 }, { text: TSV }, 'root', 'default'],
    ['a grid in fenced code', { markdown: '```\ncode\n```', caret: 8 }, { text: TSV }, 'root', 'default'],
    ['rich HTML in fenced code', { markdown: '```\ncode\n```', caret: 8 }, { html: RICH, text: 'hello bold' }, 'root', 'default'],
    ['an HTML table in a bullet item', { markdown: '- item', caret: 4 }, { html: TABLE_HTML, text: TSV }, 'root', 'default'],
  ])('%s: one decision, strategy %s', async (_name, setup, payload, on, expected) => {
    expect(await decisions(() => paste(setup, payload, on))).toEqual([expected]);
  });

  it('a table and files are one transaction: the table is created once, no file is stored, the files are reported once', async () => {
    const o = await paste(PLAIN, { files: [png(), docx()], html: TABLE_HTML, text: TSV });

    expect(o.userEvents).toHaveLength(1);
    expect(o.stored).toEqual([]);
    expect(o.skipped).toEqual([{ names: ['shot.png', 'notes.docx'], reason: 'target' }]);
    expect(findAllTables(rootStateFor(o.doc))).toHaveLength(1);
  });

  it('files and rich HTML: the files win and are embedded once, with nothing reported', async () => {
    const o = await paste(PLAIN, { files: [png(), pdf()], html: RICH, text: 'hello bold' });

    expect(o.stored).toHaveLength(2);
    expect(o.userEvents).toEqual(['input.paste']);
    expect(o.skipped).toEqual([]);
  });

  it('a selected range with files is not filled, not embedded, and reported once', async () => {
    const o = await paste({ markdown: DOC_TABLE, range: [[1, 0], [2, 1]] }, { files: [png()], text: '' });

    expect(o.doc).toBe(o.before);
    expect(o.stored).toEqual([]);
    expect(o.skipped).toHaveLength(1);
  });

  it('unsupported files beside a supported one: one embed transaction, one unsupported notice', async () => {
    const o = await paste(PLAIN, { files: [png(), docx(), docx('b.docx')] });

    expect(o.userEvents).toEqual(['input.paste']);
    expect(o.skipped).toEqual([{ names: ['notes.docx', 'b.docx'], reason: 'unsupported' }]);
  });

  it('a grid in a list item with a file: the file is embedded, and is NOT reported as skipped (the grid declined)', async () => {
    const o = await paste({ markdown: '- item', caret: 6 }, { files: [png()], html: TABLE_HTML, text: TSV });

    expect(o.doc).toContain('![[Assets/shot-1.png]]');
    expect(o.skipped).toEqual([]);
  });

  it('an empty clipboard changes nothing and reports nothing, in the root and in a cell', async () => {
    for (const [setup, on] of [[PLAIN, 'root'], [{ markdown: DOC_TABLE, cell: 'a1' }, 'cell']] as const) {
      const o = await paste(setup, {}, on);

      expect(o.doc).toBe(o.before);
      expect(o.userEvents).toEqual([]);
      expect(o.skipped).toEqual([]);
    }
  });

  it('every paste is exactly one decision, however many are made in a row', async () => {
    classify.mockClear();
    await paste(PLAIN, { text: 'a' });
    await paste(PLAIN, { text: TSV });
    await paste(PLAIN, { files: [png()], text: '' });

    expect(classify).toHaveBeenCalledTimes(3);
  });
});

function rootStateFor(doc: string): EditorState {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  ensureSyntaxTree(state, doc.length, 5000);
  return state;
}

// ═══ L. block boundaries of rich HTML ══════════════════════════════════════════════════════════════════

describe('L. rich HTML keeps its blocks apart and lands in a block of its own', () => {
  const T = (cell: string) => htmlTable([[cell]]);
  const count = (doc: string, name: string) => nodeNames(doc).filter((node) => node === name).length;
  const EMPTY: Setup = { markdown: '', caret: 0 };

  it('[intentional] two separate HTML tables stay two tables', async () => {
    const o = await paste(EMPTY, { html: T('a') + T('b'), text: 'a\nb' });

    expect(o.doc.trimEnd()).toBe('| a |\n| - |\n|   |\n\n| b |\n| - |\n|   |');
    expect(count(o.doc, 'Table')).toBe(2);
  });

  it('[intentional] three separate HTML tables stay three tables', async () => {
    const o = await paste(EMPTY, { html: T('a') + T('b') + T('c'), text: 'a\nb\nc' });

    expect(count(o.doc, 'Table')).toBe(3);
  });

  it('[intentional] a heading and a paragraph pasted after text: their own block, the heading is still a heading', async () => {
    const o = await paste(PLAIN, { html: '<h1>Heading</h1><p>Paragraph</p>', text: 'Heading\nParagraph' });

    expect(o.doc).toBe('Start\n\n# Heading\nParagraph\n\nEnd');
    expect(nodeNames(o.doc)).toContain('ATXHeading1');
  });

  it('[intentional] at the start, middle and end of a paragraph the blocks are separated from the text on both sides', async () => {
    const html = '<h1>H</h1><ul><li>a</li></ul>';
    const doc = 'Start middle end';

    expect((await paste({ markdown: doc, caret: 0 }, { html, text: 'H a' })).doc).toBe('# H\n- a\n\nStart middle end');
    expect((await paste({ markdown: doc, caret: 6 }, { html, text: 'H a' })).doc).toBe('Start \n\n# H\n- a\n\nmiddle end');
    expect((await paste({ markdown: doc, caret: 16 }, { html, text: 'H a' })).doc).toBe('Start middle end\n\n# H\n- a');
    for (const caret of [0, 6, 16]) {
      const names = nodeNames((await paste({ markdown: doc, caret }, { html, text: 'H a' })).doc);
      expect(names).toContain('ATXHeading1');
      expect(names).toContain('BulletList');
    }
  });

  it('[intentional] a line below is not pulled into the pasted block', async () => {
    const o = await paste({ markdown: 'one\ntwo', caret: 3 }, { html: '<ul><li>a</li><li>b</li></ul>', text: 'a b' });

    expect(o.doc).toBe('one\n\n- a\n- b\n\ntwo');
  });

  it('[behaviour] several headings and paragraphs: adjacent paragraphs are compacted into one paragraph (a line break), like any pasted text', async () => {
    const o = await paste(EMPTY, { html: '<h1>H</h1><p>a</p><p>b</p><h2>I</h2><p>c</p>', text: 'x' });

    expect(o.doc).toBe('# H\na\nb\n## I\nc');
    expect(count(o.doc, 'Paragraph')).toBe(2);
  });

  it('[intentional] lists, quotes and code blocks keep their boundaries', async () => {
    const list = await paste(EMPTY, { html: '<ul><li>a</li></ul><p>after</p>', text: 'x' });
    expect(list.doc).toBe('- a\n\nafter');
    expect(count(list.doc, 'BulletList')).toBe(1);

    const quotes = await paste(EMPTY, { html: '<blockquote><p>q</p></blockquote><blockquote><p>r</p></blockquote>', text: 'x' });
    expect(quotes.doc).toBe('> q\n\n> r');
    expect(count(quotes.doc, 'Blockquote')).toBe(2);

    const code = await paste(PLAIN, { html: '<pre>x</pre><p>y</p>', text: 'x y' });
    expect(code.doc).toBe('Start\n\n```\nx\n```\ny\n\nEnd');
    expect(count(code.doc, 'FencedCode')).toBe(1);
  });

  it('[intentional] one paragraph with inline formatting stays inline in the text it lands in', async () => {
    const o = await paste({ markdown: 'Start middle end', caret: 6 }, { html: '<p>x <b>y</b></p>', text: 'x y' });

    expect(o.doc).toBe('Start x **y**middle end');
  });

  it('[intentional] inside a list item or a quote nothing is added around the content', async () => {
    const o = await paste({ markdown: '- item', caret: 6 }, { html: '<h1>H</h1><ul><li>a</li></ul>', text: 'H a' });

    expect(o.doc.startsWith('- item# H')).toBe(true);
  });

  it('[intentional] plain-text compaction is untouched: blank lines between blocks are still removed as before', async () => {
    expect((await paste(EMPTY, { text: 'a\n\nb' })).doc).toBe('a\nb');
    expect((await paste(EMPTY, { text: '> q\n\n> r' })).doc).toBe('> q\n> r');
    expect((await paste(EMPTY, { text: '# H\n\nparagraph\n\n\n\nnext' })).doc).toBe('# H\nparagraph\n\nnext');
  });
});

// ═══ M. two HTML tables together with their tab-separated text ═════════════════════════════════════════

describe('M. two tables on a real browser-style clipboard', () => {
  const chrome = (rows: string[][]) =>
    `<meta charset='utf-8'><table style="border-collapse: collapse;"><tbody>${rows.map((row, i) => `<tr>${row.map((c) => (i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`).join('')}</tbody></table>`;
  const TWO = chrome([['A', 'B'], ['1', '2']]) + chrome([['C', 'D'], ['3', '4']]);
  const TWO_TEXT = 'A\tB\n1\t2\nC\tD\n3\t4';
  const count = (doc: string, name: string) => nodeNames(doc).filter((node) => node === name).length;
  const classify = vi.mocked(classifyPaste);

  it('[intentional] two tables stay two Markdown tables even though the plain text is tab-separated', async () => {
    classify.mockClear();
    const o = await paste({ markdown: '', caret: 0 }, { html: TWO, text: TWO_TEXT });

    expect(o.doc.trimEnd()).toBe('| A | B |\n| - | - |\n| 1 | 2 |\n\n| C | D |\n| - | - |\n| 3 | 4 |');
    expect(count(o.doc, 'Table')).toBe(2);
    expect(classify).toHaveBeenCalledTimes(1);
    expect((classify.mock.results[0]!.value as { strategy: string }).strategy).toBe('richHtml');
  });

  it('[intentional] one table with its tab-separated text is still created as one table', async () => {
    const o = await paste({ markdown: '', caret: 0 }, { html: chrome([['A', 'B'], ['1', '2']]), text: 'A\tB\n1\t2' });

    expect(o.doc.trimEnd()).toBe('| A | B |\n| - | - |\n| 1 | 2 |');
    expect(count(o.doc, 'Table')).toBe(1);
  });

  it('[intentional] tab-separated text alone still creates a table', async () => {
    const o = await paste({ markdown: '', caret: 0 }, { text: TWO_TEXT });

    expect(count(o.doc, 'Table')).toBe(1);
    expect(o.doc.trimEnd()).toBe('| A | B |\n| - | - |\n| 1 | 2 |\n| C | D |\n| 3 | 4 |');
  });

  it('[intentional] pasted between two paragraphs the tables get their own blocks', async () => {
    const o = await paste({ markdown: 'Start\n\nEnd', caret: 5 }, { html: TWO, text: TWO_TEXT });

    expect(o.doc.startsWith('Start\n\n| A | B |')).toBe(true);
    expect(o.doc.endsWith('| 3 | 4 |\n\nEnd')).toBe(true);
    expect(count(o.doc, 'Table')).toBe(2);
  });

  it('[intentional] into an active cell the tabular text still fills the table from that cell', async () => {
    const o = await paste({ markdown: DOC_TABLE, cell: 'a1' }, { html: TWO, text: TWO_TEXT }, 'cell');

    expect(o.doc).toContain('| A | B |');
    expect(o.doc).toContain('| C | D |');
    expect(count(o.doc, 'Table')).toBe(1);
  });

  it('[intentional] over a selected range the tabular text still fills the cells', async () => {
    const o = await paste({ markdown: DOC_TABLE, range: [[1, 0], [2, 1]] }, { html: TWO, text: 'x1\ty1\nx2\ty2' });

    expect(o.doc).toBe(FILLED);
    expect(o.stored).toEqual([]);
  });
});

// ═══ O. plain text pasted inside code is literal ═══════════════════════════════════════════════════════

describe('O. code blocks keep pasted text exactly', () => {
  const FENCE = '```\ncode\n```';
  const AT_END_OF_CODE = 8;
  const inFence = (text: string) => `\`\`\`\ncode${text}\n\`\`\``;
  const fencedCode = (doc: string) => nodeNames(doc).filter((node) => node === 'FencedCode').length;

  it('[intentional] consecutive blank lines are kept', async () => {
    const o = await paste({ markdown: FENCE, caret: AT_END_OF_CODE }, { text: '\na\n\n\n\nb\n' });

    expect(o.doc).toBe(inFence('\na\n\n\n\nb\n'));
    expect(fencedCode(o.doc)).toBe(1);
  });

  it('[intentional] indentation, tabs and trailing whitespace are kept', async () => {
    const text = '\nfunction f() {\n  if (x) {\n\treturn 1;   \n  }\n}';
    const o = await paste({ markdown: FENCE, caret: AT_END_OF_CODE }, { text });

    expect(o.doc).toBe(inFence(text));
  });

  it('[intentional] Markdown-looking text is not reshaped: lists, tasks and fences inside the pasted code stay as written', async () => {
    const text = '\n- one\n\n\n    - nested\n- [ ]  task\n\n```\ninner\n```';
    const o = await paste({ markdown: FENCE, caret: AT_END_OF_CODE }, { text });

    expect(o.doc).toBe(inFence(text));
  });

  it('[intentional] rich HTML is not converted: its plain text goes in literally, blank lines included', async () => {
    const o = await paste(
      { markdown: FENCE, caret: AT_END_OF_CODE },
      { html: '<h1>Heading</h1><p>First <b>bold</b></p><p>Second</p>', text: '\nHeading\n\nFirst bold\n\nSecond' }
    );

    expect(o.doc).toBe(inFence('\nHeading\n\nFirst bold\n\nSecond'));
    const names = nodeNames(o.doc);
    expect(names).not.toContain('ATXHeading1');
    expect(names).not.toContain('StrongEmphasis');
  });

  it('[intentional] the opening and closing fences stay intact and one block remains', async () => {
    const o = await paste({ markdown: 'Start\n\n```ts\nlet a = 1;\n```\n\nEnd', caret: 'Start\n\n```ts\nlet a = 1;'.length }, { text: '\n\n\nlet b = 2;' });

    expect(o.doc).toBe('Start\n\n```ts\nlet a = 1;\n\n\nlet b = 2;\n```\n\nEnd');
    expect(fencedCode(o.doc)).toBe(1);
  });

  it('[intentional] outside a code block plain text is still compacted exactly as before', async () => {
    expect((await paste({ markdown: '', caret: 0 }, { text: 'a\n\nb' })).doc).toBe('a\nb');
    expect((await paste({ markdown: '', caret: 0 }, { text: 'a\n\n\n\nb' })).doc).toBe('a\n\nb');
    expect((await paste({ markdown: 'Start\n\nEnd', caret: 5 }, { text: '\n- x\n\n- y' })).doc).toBe('Start\n- x\n- y\n\nEnd');
  });

  it('[intentional] text pasted after a code block is not treated as code', async () => {
    const doc = `${FENCE}\n\nEnd`;
    const o = await paste({ markdown: doc, caret: doc.length }, { text: 'p\n\nq' });

    expect(o.doc).toBe(`${doc}p\nq`);
    expect(fencedCode(o.doc)).toBe(1);
  });
});


// The legacy characterization above remains deliberately unflagged. These
// cases exercise the real React editor with the staged projection enabled.
describe('M10b — flagged table engine integration in MarkdownEditor', () => {
  let originalUrl: string;
  beforeEach(() => {
    originalUrl = window.location.href;
    const url = new URL(originalUrl);
    url.searchParams.set('tableEngineCells', '');
    window.history.replaceState(null, '', url.href);
  });
  afterEach(() => window.history.replaceState(null, '', originalUrl));

  const engineWidgets = (root: EditorView) => root.dom.querySelectorAll<HTMLElement>('[data-table-engine-cells="true"]');
  const assertEngine = (root: EditorView) => {
    expect(root.plugin(tableCellEditor)).not.toBeNull();
    expect(engineWidgets(root).length).toBeGreaterThan(0);
  };

  it('enables staged editable tables using the native development environment opt-in without a URL flag', () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('tableEngineCells');
    window.history.replaceState(null, '', url.href);
    try {
      vi.stubEnv('VITE_CLUTTER_TABLE_ENGINE_CELLS', '0');
      const legacy = render(<MarkdownEditor pageId="native-flag-off" markdown={DOC_TABLE} />);
      expect(engineWidgets(rootOf(legacy.container))).toHaveLength(0);
      expect(rootOf(legacy.container).plugin(tableCellEditor)).toBeNull();
      legacy.unmount();
      vi.stubEnv('VITE_CLUTTER_TABLE_ENGINE_CELLS', '1');
      const enabled = render(<MarkdownEditor pageId="native-flag-on" markdown={DOC_TABLE} />);
      assertEngine(rootOf(enabled.container));
      activateCell(rootOf(enabled.container), 'a1');
      expect(nestedOf(enabled.container)!.state.doc.toString()).toBe('a1');
      enabled.unmount();
      const readonly = render(<MarkdownEditor pageId="native-flag-readonly" markdown={DOC_TABLE} readOnly />);
      expect(engineWidgets(rootOf(readonly.container))).toHaveLength(0);
      expect(rootOf(readonly.container).plugin(tableCellEditor)).toBeNull();
      readonly.unmount();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('enters the engine cell from adjacent root Markdown using the original boundary keymap', () => {
    const { container } = render(<MarkdownEditor pageId="engine-boundary" markdown={DOC_TABLE} />);
    const root = rootOf(container);
    assertEngine(root);
    const press = (key: string) => act(() => {
      root.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
    act(() => { root.dispatch({ selection: { anchor: DOC_TABLE.indexOf(TABLE) - 1 } }); root.focus(); });
    press('ArrowDown');
    const controller = root.plugin(tableCellEditor)!;
    expect(controller.nested).toBe(nestedOf(container));
    expect(controller.nested!.state.doc.toString()).toBe('A');
    expect(controller.nested!.state.selection.main.head).toBe(0);
    act(() => { controller.close(); root.dispatch({ selection: { anchor: DOC_TABLE.indexOf(TABLE) + TABLE.length + 1 } }); root.focus(); });
    press('ArrowLeft');
    expect(controller.nested).toBe(nestedOf(container));
    expect(controller.nested!.state.doc.toString()).toBe('b2');
    expect(controller.nested!.state.selection.main.head).toBe(2);
    expect(root.state.doc.toString()).toBe(DOC_TABLE);
  });

  it('reuses one nested engine editor across two tables and reports exact root source through onEdit', () => {
    const markdown = DOC_TABLE + '\n\n| C | D |\n| --- | --- |\n| c1 | d1 |';
    const onEdit = vi.fn();
    const { container } = render(<MarkdownEditor pageId="engine-two" markdown={markdown} onEdit={onEdit} />);
    const root = rootOf(container);
    assertEngine(root);
    expect(engineWidgets(root)).toHaveLength(2);
    activateCell(root, 'a1');
    const nested = nestedOf(container)!;
    act(() => nested.dispatch({ changes: { from: 2, insert: '!' }, userEvent: 'input.type' }));
    activateCell(root, 'd1');
    expect(nestedOf(container)).toBe(nested);
    act(() => nested.dispatch({ changes: { from: 2, insert: '?' }, userEvent: 'input.type' }));
    const edited = markdown.replace('a1', 'a1!').replace('d1', 'd1?');
    expect(root.state.doc.toString()).toBe(edited);
    expect(onEdit).toHaveBeenLastCalledWith(edited);
    expect(container.querySelectorAll('.cm-table-widget .cm-editor')).toHaveLength(1);
    act(() => undo(root));
    expect(root.state.doc.toString()).toBe(markdown.replace('a1', 'a1!'));
    act(() => redo(root));
    expect(root.state.doc.toString()).toBe(edited);
  });

  it('maps external prefix refreshes but closes editing when an earlier row changes the logical address', () => {
    const { container, rerender } = render(<MarkdownEditor pageId="engine-external" markdown={DOC_TABLE} />);
    const root = rootOf(container);
    assertEngine(root);
    activateCell(root, 'b2');
    const nested = nestedOf(container)!;
    const prefix = 'New paragraph\n\n' + DOC_TABLE;
    rerender(<MarkdownEditor pageId="engine-external" markdown={prefix} />);
    expect(nestedOf(container)).toBe(nested);
    expect(nested.state.doc.toString()).toBe('b2');
    const removedRow = prefix.replace('| a1 | b1 |\n', '');
    rerender(<MarkdownEditor pageId="engine-external" markdown={removedRow} />);
    expect(root.state.doc.toString()).toBe(removedRow);
    expect(nestedOf(container)).toBeNull();
    activateCell(root, 'b2');
    expect(nestedOf(container)!.state.doc.toString()).toBe('b2');
    rerender(<MarkdownEditor pageId="engine-external" markdown="Replacement" />);
    expect(root.state.doc.toString()).toBe('Replacement');
    expect(nestedOf(container)).toBeNull();
    expect(engineWidgets(root)).toHaveLength(0);
  });

  it('switches the real editor to read-only and back without retaining editable controls or changing source', () => {
    const markdown = TABLE + '\n{table-col-widths="120,260"}';
    const { container, rerender } = render(<MarkdownEditor pageId="engine-mode" markdown={markdown} />);
    const root = rootOf(container);
    assertEngine(root);
    activateCell(root, 'b1');
    const nested = nestedOf(container)!;
    rerender(<MarkdownEditor pageId="engine-mode" markdown={markdown} readOnly />);
    expect(rootOf(container)).toBe(root);
    expect(root.state.readOnly).toBe(true);
    expect(nested.dom.isConnected).toBe(false);
    expect(nestedOf(container)).toBeNull();
    expect(engineWidgets(root)).toHaveLength(0);
    expect(root.dom.querySelector('.cm-table-quick-add, .cm-table-column-resize-hit, .cm-table-row-handle-hit')).toBeNull();
    expect(root.state.doc.toString()).toBe(markdown);
    rerender(<MarkdownEditor pageId="engine-mode" markdown={markdown} />);
    expect(rootOf(container)).toBe(root);
    assertEngine(root);
    activateCell(root, 'b1');
    expect(nestedOf(container)!.state.doc.toString()).toBe('b1');
    expect(root.state.doc.toString()).toBe(markdown);
  });

  it('routes active-cell plain text, grid and file-only clipboard events without leaking to root paste', async () => {
    const fake = fakeAssets();
    const { container } = render(<MarkdownEditor pageId="engine-paste" markdown={DOC_TABLE} pasteAssets={fake.assets} />);
    const root = rootOf(container);
    assertEngine(root);
    activateCell(root, 'a1');
    const nested = nestedOf(container)!;
    act(() => nested.dispatch({ selection: { anchor: 1 } }));
    const scalar = pasteEvent({ text: '!' });
    act(() => nested.contentDOM.dispatchEvent(scalar));
    expect(scalar.defaultPrevented).toBe(true);
    expect(root.state.doc.toString()).toBe(DOC_TABLE.replace('a1', 'a!1'));
    const file = pasteEvent({ files: [png()] });
    act(() => nested.contentDOM.dispatchEvent(file));
    await sleep();
    expect(file.defaultPrevented).toBe(true);
    expect(fake.stored).toEqual([]);
    expect(fake.skipped).toEqual([{ names: ['shot.png'], reason: 'target' }]);
    expect(root.state.doc.toString()).toBe(DOC_TABLE.replace('a1', 'a!1'));
    const grid = pasteEvent({ text: TSV });
    act(() => nested.contentDOM.dispatchEvent(grid));
    expect(grid.defaultPrevented).toBe(true);
    expect(root.state.doc.toString()).toBe(FILLED);
    expect(nestedOf(container)).toBeNull();
    act(() => undo(root));
    expect(root.state.doc.toString()).toBe(DOC_TABLE.replace('a1', 'a!1'));
  });

  it('enters from below an explicitly sized table without treating width metadata as a visible line', () => {
    const markdown = TABLE + '\n{table-col-widths="120,260"}\n\nAfter';
    const { container } = render(<MarkdownEditor pageId="engine-width-entry" markdown={markdown} />);
    const root = rootOf(container);
    assertEngine(root);
    const enter = (key: string) => act(() => {
      root.dispatch({ selection: { anchor: markdown.indexOf('\n\nAfter') + 1 } });
      root.focus();
      root.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
    enter('ArrowUp');
    const controller = root.plugin(tableCellEditor)!;
    expect(nestedOf(container)).toBe(controller.nested);
    expect(controller.nested!.state.doc.toString()).toBe('a2');
    expect(controller.nested!.state.selection.main.head).toBe(0);
    act(() => controller.close());
    enter('ArrowLeft');
    expect(controller.nested!.state.doc.toString()).toBe('b2');
    expect(controller.nested!.state.selection.main.head).toBe(2);
    expect(root.state.doc.toString()).toBe(markdown);
  });

  it('hands active editing from compatibility to supported tables and back without two mounted editors', () => {
    const overflow = '| C | D |\n| --- | --- |\n| compat-a | compat-b | extra |';
    const markdown = TABLE + '\n\n' + overflow;
    const { container } = render(<MarkdownEditor pageId="engine-mixed" markdown={markdown} />);
    const root = rootOf(container);
    assertEngine(root);
    expect(engineWidgets(root)).toHaveLength(1);
    expect(root.dom.querySelectorAll('.cm-table-widget')).toHaveLength(2);
    activateCell(root, 'compat-a');
    const legacy = nestedOf(container)!;
    expect(legacy.state.doc.toString()).toBe('compat-a');
    activateCell(root, 'a1');
    const engine = nestedOf(container)!;
    expect(engine).toBe(root.plugin(tableCellEditor)!.nested);
    expect(engine).not.toBe(legacy);
    expect(legacy.dom.isConnected).toBe(false);
    expect(container.querySelectorAll('.cm-table-widget .cm-editor')).toHaveLength(1);
    activateCell(root, 'compat-b');
    expect(engine.dom.isConnected).toBe(false);
    expect(nestedOf(container)).toBe(legacy);
    expect(legacy.state.doc.toString()).toBe('compat-b');
    expect(container.querySelectorAll('.cm-table-widget .cm-editor')).toHaveLength(1);
    expect(root.state.doc.toString()).toBe(markdown);
  });

  it('reports files skipped once for a selected engine axis and still pastes a companion grid', () => {
    const fake = fakeAssets();
    const { container } = render(<MarkdownEditor pageId="engine-file-feedback" markdown={TABLE} pasteAssets={fake.assets} />);
    const root = rootOf(container);
    assertEngine(root);
    const controller = root.plugin(tableCellEditor)!;
    act(() => { expect(controller.selectAxis(0, { row: 1, col: 0 }, 'row')).toBe(true); });
    const host = engineWidgets(root)[0]!.querySelector('[data-cell="1,0"]')!;
    const fileOnly = pasteEvent({ files: [pdf(), docx()] });
    act(() => host.dispatchEvent(fileOnly));
    expect(fileOnly.defaultPrevented).toBe(true);
    expect(root.state.doc.toString()).toBe(TABLE);
    expect(fake.skipped).toEqual([{ names: ['doc.pdf', 'notes.docx'], reason: 'target' }]);
    const combined = pasteEvent({ files: [png()], text: TSV });
    act(() => host.dispatchEvent(combined));
    expect(combined.defaultPrevented).toBe(true);
    expect(root.state.doc.toString()).toBe(FILLED.slice('Intro\n\n'.length, -'\n\nOutro'.length));
    expect(fake.stored).toEqual([]);
    expect(fake.skipped).toEqual([
      { names: ['doc.pdf', 'notes.docx'], reason: 'target' },
      { names: ['shot.png'], reason: 'target' },
    ]);
  });

  it('unmounts the active nested editor on note switch and restores the saved source on reopening', () => {
    const onEdit = vi.fn();
    const { container, rerender } = render(<MarkdownEditor key="engine-a" pageId="engine-a" markdown={DOC_TABLE} onEdit={onEdit} />);
    const root = rootOf(container);
    assertEngine(root);
    activateCell(root, 'a1');
    const nested = nestedOf(container)!;
    act(() => nested.dispatch({ changes: { from: 2, insert: '!' }, userEvent: 'input.type' }));
    const saved = root.state.doc.toString();
    expect(onEdit).toHaveBeenLastCalledWith(saved);
    rerender(<MarkdownEditor key="engine-b" pageId="engine-b" markdown="Other note" />);
    expect(nested.dom.isConnected).toBe(false);
    expect(root.dom.isConnected).toBe(false);
    expect(rootOf(container).state.doc.toString()).toBe('Other note');
    rerender(<MarkdownEditor key="engine-a" pageId="engine-a" markdown={saved} onEdit={onEdit} />);
    const reopened = rootOf(container);
    assertEngine(reopened);
    expect(reopened.state.doc.toString()).toBe(DOC_TABLE.replace('a1', 'a1!'));
    expect(nestedOf(container)).toBeNull();
    activateCell(reopened, 'a1!');
    expect(nestedOf(container)!.state.doc.toString()).toBe('a1!');
  });
});
