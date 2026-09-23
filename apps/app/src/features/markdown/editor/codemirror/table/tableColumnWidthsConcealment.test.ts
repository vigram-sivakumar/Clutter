// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { normalizeAllTablesInMarkdown } from './tableColumnNormalization';
import { resolveTableColumnWidths } from './tableColumnWidthMetadata';
import { tableColumnWidthsConcealment } from './tableColumnWidthsConcealment';
import { findAllTables } from './tableGeometry';

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), tableColumnWidthsConcealment()],
  });
  return new EditorView({ state, parent });
}

function visibleText(view: EditorView): string {
  return view.dom.textContent ?? '';
}

function hiddenLineElements(view: EditorView): NodeListOf<Element> {
  return view.dom.querySelectorAll('.cm-table-col-widths-hidden-line');
}

const TABLE = '| Name | Role |\n| ---- | ---- |\n| Vik  | UI   |';
const TABLE_WITH_WIDTHS = `${TABLE}\n{table-col-widths="120,200"}`;

describe('tableColumnWidthsConcealment — visual concealment', () => {
  it('conceals a valid attribute line — no attribute text in the rendered view', () => {
    const view = mountView(TABLE_WITH_WIDTHS);

    expect(visibleText(view)).not.toContain('table-col-widths');
    expect(visibleText(view)).not.toContain('120');
    expect(visibleText(view)).not.toContain('200');
  });

  it('leaves the rendered table itself fully visible', () => {
    const view = mountView(TABLE_WITH_WIDTHS);

    const text = visibleText(view);
    expect(text).toContain('Name');
    expect(text).toContain('Role');
    expect(text).toContain('Vik');
    expect(text).toContain('UI');
  });

  it('gives the concealed line its own zero-height CSS class', () => {
    const view = mountView(TABLE_WITH_WIDTHS);

    expect(hiddenLineElements(view)).toHaveLength(1);
    expect(hiddenLineElements(view)[0]!.textContent).toBe('');
  });

  it('conceals a malformed (invalid-value) attribute line too — still our metadata syntax, never shown', () => {
    const doc = `${TABLE}\n{table-col-widths="70.96875,200"}`;
    const view = mountView(doc);

    expect(visibleText(view)).not.toContain('table-col-widths');
    expect(visibleText(view)).not.toContain('70.96875');
    expect(hiddenLineElements(view)).toHaveLength(1);
  });

  it('a table with no metadata renders completely unchanged', () => {
    const view = mountView(TABLE);

    expect(hiddenLineElements(view)).toHaveLength(0);
    const text = visibleText(view);
    expect(text).toContain('Name');
    expect(text).toContain('Vik');
  });
});

describe('tableColumnWidthsConcealment — document integrity', () => {
  it('the metadata remains in EditorState.doc, byte-for-byte, even though concealed visually', () => {
    const view = mountView(TABLE_WITH_WIDTHS);

    expect(view.state.doc.toString()).toBe(TABLE_WITH_WIDTHS);
  });

  it('remains resolvable by the table width logic — resolveTableColumnWidths is unaffected by concealment', () => {
    const view = mountView(TABLE_WITH_WIDTHS);

    const table = findAllTables(view.state)[0]!;
    expect(resolveTableColumnWidths(view.state, table)?.widths).toEqual([120, 200]);
  });

  it('save-boundary normalization still preserves the metadata, unaffected by concealment (a pure view-layer decoration, never touching document text)', () => {
    const normalized = normalizeAllTablesInMarkdown(TABLE_WITH_WIDTHS);

    expect(normalized).toContain('{table-col-widths="120,200"}');
    const lines = normalized.split('\n');
    expect(lines[lines.length - 1]).toBe('{table-col-widths="120,200"}');
  });
});

describe('tableColumnWidthsConcealment — multiple tables', () => {
  const DOC =
    '# People\n\n' +
    `${TABLE}\n{table-col-widths="120,200"}\n\n` +
    '# Projects\n\n' +
    '| Project | Status |\n| ---- | ---- |\n| Site | Active |\n{table-col-widths="200,100"}';

  it('conceals each table\'s own metadata independently', () => {
    const view = mountView(DOC);

    expect(hiddenLineElements(view)).toHaveLength(2);
    expect(visibleText(view)).not.toContain('table-col-widths');
  });

  it('each table still resolves its own, independent widths from the (still-present) document text', () => {
    const view = mountView(DOC);

    const tables = findAllTables(view.state);
    expect(tables).toHaveLength(2);
    expect(resolveTableColumnWidths(view.state, tables[0]!)?.widths).toEqual([120, 200]);
    expect(resolveTableColumnWidths(view.state, tables[1]!)?.widths).toEqual([200, 100]);
  });

  it('one table without metadata alongside one with — only the one with metadata gets a hidden line', () => {
    const doc = `${TABLE}\n{table-col-widths="120,200"}\n\n# Projects\n\n| Project | Status |\n| ---- | ---- |\n| Site | Active |`;
    const view = mountView(doc);

    expect(hiddenLineElements(view)).toHaveLength(1);
    expect(visibleText(view)).toContain('Site');
  });
});

describe('tableColumnWidthsConcealment — does not conceal lookalikes', () => {
  it('an ordinary {table-col-widths="..."}-shaped paragraph with no table above it is left fully visible', () => {
    const doc = '{table-col-widths="120,200"}';
    const view = mountView(doc);

    expect(hiddenLineElements(view)).toHaveLength(0);
    expect(visibleText(view)).toContain('table-col-widths');
  });

  it('a {table-col-widths="..."}-shaped paragraph separated from a table by a blank line is left visible', () => {
    const doc = `${TABLE}\n\n{table-col-widths="120,200"}`;
    const view = mountView(doc);

    expect(hiddenLineElements(view)).toHaveLength(0);
    expect(visibleText(view)).toContain('table-col-widths');
  });

  it('an unrelated {...} paragraph immediately after a table is left visible', () => {
    const doc = `${TABLE}\n{.some-other-attribute}`;
    const view = mountView(doc);

    expect(hiddenLineElements(view)).toHaveLength(0);
    expect(visibleText(view)).toContain('some-other-attribute');
  });

  it('ordinary prose that happens to mention "table-col-widths" as plain text is left visible', () => {
    const doc = 'Some notes about table-col-widths as a concept, not the syntax.';
    const view = mountView(doc);

    expect(hiddenLineElements(view)).toHaveLength(0);
    expect(visibleText(view)).toContain('table-col-widths');
  });
});

describe('tableColumnWidthsConcealment — updates with the document', () => {
  it('concealing a newly-typed attribute line after a resize-style edit', () => {
    const view = mountView(TABLE);
    expect(view.dom.querySelectorAll('.cm-table-col-widths-hidden-line')).toHaveLength(0);

    view.dispatch({ changes: { from: TABLE.length, to: TABLE.length, insert: '\n{table-col-widths="120,200"}' } });

    expect(view.dom.querySelectorAll('.cm-table-col-widths-hidden-line')).toHaveLength(1);
    expect(visibleText(view)).not.toContain('table-col-widths');
  });

  it('un-concealing when the attribute line is deleted', () => {
    const view = mountView(TABLE_WITH_WIDTHS);
    expect(view.dom.querySelectorAll('.cm-table-col-widths-hidden-line')).toHaveLength(1);

    view.dispatch({ changes: { from: TABLE.length, to: TABLE_WITH_WIDTHS.length, insert: '' } });

    expect(view.dom.querySelectorAll('.cm-table-col-widths-hidden-line')).toHaveLength(0);
  });
});
