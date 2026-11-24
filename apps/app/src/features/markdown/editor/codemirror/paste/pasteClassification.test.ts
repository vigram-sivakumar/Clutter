// @vitest-environment jsdom
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableSelectionChanged, tableSelectionField } from '../table/tableSelection';
import { classifyPaste, type PasteStrategy } from './pasteClassification';

const png = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
const pdf = new File([new Uint8Array([2])], 'b.pdf', { type: 'application/pdf' });
const docx = new File([new Uint8Array([3])], 'c.docx', { type: 'application/msword' });

const TABLE_HTML = '<table><tr><td>a</td><td>b</td></tr></table>';
const TWO_TABLES = '<table><tr><td>a</td></tr></table><table><tr><td>b</td></tr></table>';
const RICH = '<p>x <b>y</b></p>';

function clipboard(payload: { text?: string; html?: string; files?: File[]; uriList?: string; internal?: string }): DataTransfer {
  return {
    files: payload.files ?? [],
    getData: (type: string) =>
      type === 'text/plain' ? (payload.text ?? '') : type === 'text/html' ? (payload.html ?? '') : type === 'text/uri-list' ? (payload.uriList ?? '') : type === 'application/x-clutter-table' ? (payload.internal ?? '') : '',
  } as unknown as DataTransfer;
}

function stateAt(doc: string, caret: number, options: { range?: boolean; readOnly?: boolean } = {}): EditorState {
  let state = EditorState.create({
    doc,
    selection: { anchor: caret },
    extensions: [markdownLanguageExtension(), tableSelectionField, EditorState.readOnly.of(options.readOnly === true)],
  });
  ensureSyntaxTree(state, doc.length, 5000);
  if (options.range) {
    state = state.update({ effects: tableSelectionChanged.of({ kind: 'range', tableFrom: 0, anchor: { row: 0, col: 0 }, head: { row: 0, col: 0 } }) }).state;
  }
  return state;
}

const TSV = 'a\tb\nc\td';

function strategy(payload: Parameters<typeof clipboard>[0], doc = 'Start middle', caret = 5, options: { range?: boolean; readOnly?: boolean; canEmbed?: boolean } = {}): PasteStrategy {
  return classifyPaste(clipboard(payload), { scope: 'root', state: stateAt(doc, caret, options), canEmbed: options.canEmbed ?? true }).strategy;
}

describe('classifyPaste — one strategy per clipboard and context', () => {
  it.each<[string, Parameters<typeof clipboard>[0], PasteStrategy]>([
    ['tab-separated text', { text: TSV }, 'tableCreate'],
    ['an HTML table', { html: TABLE_HTML, text: TSV }, 'tableCreate'],
    ['Clutter\'s own table', { internal: JSON.stringify({ kind: 'clutter-table-range', rows: [['a', 'b']] }) }, 'tableCreate'],
    ['an image', { files: [png], text: '' }, 'files'],
    ['a PDF with text', { files: [pdf], text: 'caption' }, 'files'],
    ['rich HTML', { html: RICH, text: 'x y' }, 'richHtml'],
    ['two bare HTML tables', { html: TWO_TABLES, text: 'a\nb' }, 'richHtml'],
    ['a table with text around it', { html: `<p>intro</p>${TABLE_HTML}`, text: 'intro' }, 'richHtml'],
    ['plain text', { text: 'hello' }, 'default'],
    ['a URI list', { uriList: 'https://e.com' }, 'default'],
    ['non-rich HTML with text', { html: '<div>x</div>', text: 'x' }, 'default'],
    ['an empty clipboard', {}, 'empty'],
    ['HTML with no text', { html: '<div></div>' }, 'empty'],
    ['an unsupported file with no text', { files: [docx], text: '' }, 'empty'],
    ['an unsupported file with its name as text', { files: [docx], text: 'c.docx' }, 'default'],
  ])('ordinary text: %s', (_name, payload, expected) => {
    expect(strategy(payload)).toBe(expected);
  });

  it('files lose to a grid, but win when the grid cannot be used where the caret is', () => {
    expect(strategy({ files: [png], html: TABLE_HTML, text: TSV })).toBe('tableCreate');
    expect(strategy({ files: [png], html: TABLE_HTML, text: TSV }, '- item', 4)).toBe('files');
  });

  it('a selected range takes a grid or single text cell; files alone are empty', () => {
    const range = { range: true };
    expect(strategy({ text: TSV }, 'Start', 0, range)).toBe('tableRange');
    expect(strategy({ html: TABLE_HTML, text: TSV }, 'Start', 0, range)).toBe('tableRange');
    expect(strategy({ files: [png], text: '' }, 'Start', 0, range)).toBe('empty');
    expect(strategy({ files: [png], text: 'x' }, 'Start', 0, range)).toBe('tableRange');
    expect(strategy({ html: RICH, text: 'x y' }, 'Start', 0, range)).toBe('tableRange');
    expect(strategy({}, 'Start', 0, range)).toBe('empty');
  });

  it.each<[string, string, number]>([
    ['a bullet item', '- item one', 6],
    ['an ordered item', '1. item one', 7],
    ['a blockquote', '> quoted', 5],
  ])('in %s a grid creates no table and a table in HTML is not converted', (_name, doc, caret) => {
    expect(strategy({ text: TSV }, doc, caret)).toBe('default');
    expect(strategy({ html: TABLE_HTML, text: TSV }, doc, caret)).toBe('default');
    expect(strategy({ html: TWO_TABLES, text: 'a\nb' }, doc, caret)).toBe('default');
    expect(strategy({ html: RICH, text: 'x y' }, doc, caret)).toBe('richHtml');
  });

  it('in a fenced code block nothing is converted, but files are still embedded', () => {
    const code = '```\ncode\n```';
    expect(strategy({ text: TSV }, code, 8)).toBe('default');
    expect(strategy({ html: RICH, text: 'x y' }, code, 8)).toBe('default');
    expect(strategy({ html: TABLE_HTML, text: TSV }, code, 8)).toBe('default');
    expect(strategy({ files: [png], text: '' }, code, 8)).toBe('files');
  });

  it('without an importer, files and rich HTML are the plain paste', () => {
    expect(strategy({ files: [png], text: 'x' }, 'Start', 5, { canEmbed: false })).toBe('default');
    expect(strategy({ html: RICH, text: 'x y' }, 'Start', 5, { canEmbed: false })).toBe('default');
    expect(strategy({ text: TSV }, 'Start', 5, { canEmbed: false })).toBe('tableCreate');
  });

  it('a read-only editor is always the plain paste', () => {
    expect(strategy({ text: TSV }, 'Start', 5, { readOnly: true })).toBe('default');
    expect(strategy({ files: [png], text: '' }, 'Start', 5, { readOnly: true })).toBe('default');
  });

  it('the cell editor: a grid or single text value fills from the active cell', () => {
    const cell = (payload: Parameters<typeof clipboard>[0], cellActive = true) =>
      classifyPaste(clipboard(payload), { scope: 'cell', state: stateAt('Start', 0), canEmbed: true, cellActive }).strategy;

    expect(cell({ text: TSV })).toBe('tableCell');
    expect(cell({ html: TABLE_HTML })).toBe('tableCell');
    expect(cell({ text: TSV }, false)).toBe('default');
    expect(cell({ text: 'plain' })).toBe('tableCell');
    expect(cell({ html: RICH, text: 'x y' })).toBe('tableCell');
    expect(cell({ files: [png], text: '' })).toBe('empty');
    expect(cell({})).toBe('empty');
  });
});

describe('classifyPaste — the files a strategy leaves out', () => {
  const skipped = (payload: Parameters<typeof clipboard>[0], doc = 'Start', caret = 5, options: { range?: boolean; canEmbed?: boolean } = {}) =>
    classifyPaste(clipboard(payload), { scope: 'root', state: stateAt(doc, caret, options), canEmbed: options.canEmbed ?? true }).skipped;

  it('reports nothing when every file is embedded, or there are no files', () => {
    expect(skipped({ files: [png, pdf], text: '' })).toBeNull();
    expect(skipped({ text: 'x' })).toBeNull();
  });

  it('reports unsupported files by name, once, while the supported ones are embedded', () => {
    expect(skipped({ files: [png, docx, pdf], text: '' })).toEqual({ names: ['c.docx'], reason: 'unsupported' });
  });

  it('reports every file as a target problem when a table takes the paste', () => {
    expect(skipped({ files: [png, docx], html: TABLE_HTML, text: TSV })).toEqual({ names: ['a.png', 'c.docx'], reason: 'target' });
    expect(skipped({ files: [png], text: '' }, 'Start', 0, { range: true })).toEqual({ names: ['a.png'], reason: 'target' });
  });

  it('a table that cannot be created here does not claim the files: they are embedded and not reported', () => {
    expect(skipped({ files: [png], html: TABLE_HTML, text: TSV }, '- item', 4)).toBeNull();
  });

  it('reports nothing when nothing can store files', () => {
    expect(skipped({ files: [docx], text: '' }, 'Start', 5, { canEmbed: false })).toBeNull();
  });
});

describe('classifyPaste — HTML tables next to tab-separated text', () => {
  // What a browser puts on the clipboard for a selection across two adjacent tables, and for one.
  const chromeTable = (rows: string[][]) =>
    `<meta charset='utf-8'><table style="border-collapse: collapse;"><tbody>${rows.map((row, i) => `<tr>${row.map((c) => (i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`).join('')}</tbody></table>`;
  const TWO = chromeTable([['A', 'B'], ['1', '2']]) + chromeTable([['C', 'D'], ['3', '4']]);
  const TWO_TEXT = 'A\tB\n1\t2\nC\tD\n3\t4';
  const ONE = chromeTable([['A', 'B'], ['1', '2']]);
  const ONE_TEXT = 'A\tB\n1\t2';

  const at = (payload: Parameters<typeof clipboard>[0], options: { range?: boolean; canEmbed?: boolean; doc?: string; caret?: number } = {}) =>
    classifyPaste(clipboard(payload), {
      scope: 'root',
      state: stateAt(options.doc ?? 'Start', options.caret ?? 0, { range: options.range }),
      canEmbed: options.canEmbed ?? true,
    });

  it('two tables with their tab-separated text: the HTML wins (richHtml), not one merged grid', () => {
    const c = at({ html: TWO, text: TWO_TEXT });

    expect(c.strategy).toBe('richHtml');
    expect(c.table?.source).toBe('text');
  });

  it('one table with its tab-separated text is still a grid from the HTML', () => {
    const c = at({ html: ONE, text: ONE_TEXT });

    expect(c.strategy).toBe('tableCreate');
    expect(c.table?.source).toBe('html');
  });

  it('tab-separated text alone, or beside non-table HTML, still creates a table', () => {
    expect(at({ text: TWO_TEXT }).strategy).toBe('tableCreate');
    expect(at({ html: '<div>A</div>', text: TWO_TEXT }).strategy).toBe('tableCreate');
    expect(at({ html: '<span>A</span>', text: ONE_TEXT }).strategy).toBe('tableCreate');
  });

  it('without an importer there is no conversion: the grid from the text is what is left', () => {
    expect(at({ html: TWO, text: TWO_TEXT }, { canEmbed: false }).strategy).toBe('tableCreate');
  });

  it('a selected range and an active cell keep using the tabular text', () => {
    expect(at({ html: TWO, text: TWO_TEXT }, { range: true }).strategy).toBe('tableRange');
    expect(
      classifyPaste(clipboard({ html: TWO, text: TWO_TEXT }), { scope: 'cell', state: stateAt('Start', 0), canEmbed: true, cellActive: true }).strategy
    ).toBe('tableCell');
  });

  it('in a list item, a quote or code the tables are not converted and no table is created', () => {
    expect(at({ html: TWO, text: TWO_TEXT }, { doc: '- item', caret: 4 }).strategy).toBe('default');
    expect(at({ html: TWO, text: TWO_TEXT }, { doc: '> quote', caret: 4 }).strategy).toBe('default');
    expect(at({ html: TWO, text: TWO_TEXT }, { doc: '```\ncode\n```', caret: 8 }).strategy).toBe('default');
  });

  it('a supported file beside the two tables keeps the existing priority: files before rich HTML', () => {
    expect(at({ html: TWO, text: TWO_TEXT, files: [png] }).strategy).toBe('files');
  });
});
