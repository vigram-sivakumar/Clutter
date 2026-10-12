// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';

import {
  externalPasteNormalization,
  normalizeExternalPaste,
  recordInternalClipboardText,
} from './externalPaste';

describe('normalizeExternalPaste', () => {
  it('compacts the Notion example', () => {
    expect(
      normalizeExternalPaste(
        'This is a normal text line\n\nAnother line here\n\n- [ ]  This is a task\n1. This is a ordered list item'
      )
    ).toBe(
      'This is a normal text line\nAnother line here\n- [ ] This is a task\n1. This is a ordered list item'
    );
  });

  it('collapses a run of blank lines to one, and treats whitespace-only lines as blank', () => {
    expect(normalizeExternalPaste('a\n\n\n\nb')).toBe('a\n\nb');
    expect(normalizeExternalPaste('a\n  \n\t\n \nb')).toBe('a\n\nb');
    expect(normalizeExternalPaste('a\n\nb')).toBe('a\nb');
  });

  it('reduces leading and trailing blank lines to one newline, and keeps a lone trailing newline', () => {
    expect(normalizeExternalPaste('\n\n\na')).toBe('\na');
    expect(normalizeExternalPaste('a\n\n\n')).toBe('a\n');
    expect(normalizeExternalPaste('a\n')).toBe('a\n');
    expect(normalizeExternalPaste('\n\n')).toBe('\n\n');
    expect(normalizeExternalPaste('')).toBe('');
  });

  it('normalizes CRLF and CR newlines', () => {
    expect(normalizeExternalPaste('a\r\n\r\nb\r\rc')).toBe('a\nb\nc');
  });

  it('removes extra spaces after a task marker only, for every list marker and checked state', () => {
    expect(
      normalizeExternalPaste(
        '- [ ]   a\n* [x]  b\n+ [X]   c\n1. [ ]  d\n  - [ ]   nested'
      )
    ).toBe('- [ ] a\n* [x] b\n+ [X] c\n1. [ ] d\n  - [ ] nested');
    expect(normalizeExternalPaste('- [ ] a  b\ntext [ ]   x\n- item   y')).toBe(
      '- [ ] a  b\ntext [ ]   x\n- item   y'
    );
  });

  it('keeps a fenced code block exactly, including blank lines, whitespace and task-like text', () => {
    const code = '```ts\n\n\n  - [ ]   not a task\n\n\ttabbed   \n\n```';

    expect(normalizeExternalPaste(`before\n\n${code}\n\nafter`)).toBe(
      `before\n${code}\nafter`
    );
    expect(normalizeExternalPaste('~~~\n\n\nx\n\n~~~')).toBe(
      '~~~\n\n\nx\n\n~~~'
    );
    // A longer fence is only closed by a fence at least as long; a shorter one inside is content.
    expect(normalizeExternalPaste('````\n```\n\n\n```\n````\n\nz')).toBe(
      '````\n```\n\n\n```\n````\nz'
    );
  });

  it('keeps list items, nested lists, headings, quotes and tables as they are, only compacting between blocks', () => {
    expect(
      normalizeExternalPaste(
        '# Title\n\n- a\n\n  - nested\n\n- b\n\n1. one\n\n2. two'
      )
    ).toBe('# Title\n- a\n  - nested\n- b\n1. one\n2. two');
    expect(normalizeExternalPaste('> quote\n\n> more\n\n## H')).toBe(
      '> quote\n> more\n## H'
    );
    expect(
      normalizeExternalPaste(
        '| a | b |\n|---|---|\n| 1 | 2 |\n\n| c |\n|---|\n| 3 |'
      )
    ).toBe('| a | b |\n|---|---|\n| 1 | 2 |\n| c |\n|---|\n| 3 |');
  });

  it('keeps the blank line wherever removing it would change the meaning', () => {
    // A plain line after a list item or a quote line would become its lazy continuation.
    expect(normalizeExternalPaste('- item\n\nparagraph')).toBe(
      '- item\n\nparagraph'
    );
    expect(normalizeExternalPaste('1. item\n\nparagraph')).toBe(
      '1. item\n\nparagraph'
    );
    expect(normalizeExternalPaste('> quote\n\nparagraph')).toBe(
      '> quote\n\nparagraph'
    );
    // A plain line after a table row would become a row; a table after a paragraph is no longer a table.
    expect(normalizeExternalPaste('| a |\n|---|\n| 1 |\n\ntext')).toBe(
      '| a |\n|---|\n| 1 |\n\ntext'
    );
    expect(normalizeExternalPaste('text\n\n| a |\n|---|\n| 1 |')).toBe(
      'text\n\n| a |\n|---|\n| 1 |'
    );
    // `---` / `===` right after a paragraph would make it a heading.
    expect(normalizeExternalPaste('text\n\n---\n\nmore')).toBe(
      'text\n\n---\nmore'
    );
    expect(normalizeExternalPaste('text\n\n===')).toBe('text\n\n===');
    // Blank lines inside indented code belong to the code.
    expect(normalizeExternalPaste('para\n\n    code a\n\n    code b')).toBe(
      'para\n    code a\n\n    code b'
    );
  });

  it('is idempotent on text that has no run of blank lines', () => {
    const once = normalizeExternalPaste(
      'a\n\nb\n\nc\n\n- [ ]  d\n\n```\n\nx\n\n```\n\ntext'
    );

    expect(normalizeExternalPaste(once)).toBe(once);
  });
});

describe('external versus internal paste, through CodeMirror', () => {
  const views: EditorView[] = [];

  afterEach(() => {
    for (const view of views.splice(0)) {
      view.destroy();
    }
  });

  function mount(doc = ''): EditorView {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [history(), externalPasteNormalization()],
      }),
      parent,
    });
    views.push(view);
    view.focus();
    return view;
  }

  /** A real `paste` event: CodeMirror's own handler reads `clipboardData` and applies its default insertion. */
  function paste(view: EditorView, text: string, html?: string): void {
    const data = new Map<string, string>([['text/plain', text]]);
    if (html) data.set('text/html', html);
    const event = new Event('paste', {
      bubbles: true,
      cancelable: true,
    }) as Event & { clipboardData: unknown };
    event.clipboardData = { getData: (type: string) => data.get(type) ?? '' };
    view.contentDOM.dispatchEvent(event);
  }

  /** A real copy or cut: CodeMirror builds the text (through `clipboardOutputFilter`) and writes it to `clipboardData`. */
  function copyOrCut(view: EditorView, type: 'copy' | 'cut'): string {
    let written = '';
    const event = new Event(type, {
      bubbles: true,
      cancelable: true,
    }) as Event & { clipboardData: unknown };
    event.clipboardData = {
      clearData: () => undefined,
      setData: (_type: string, value: string) => {
        written = value;
      },
    };
    view.contentDOM.dispatchEvent(event);
    return written;
  }

  const NOTION =
    'This is a normal text line\n\nAnother line here\n\n- [ ]  This is a task\n1. This is a ordered list item';
  const COMPACT =
    'This is a normal text line\nAnother line here\n- [ ] This is a task\n1. This is a ordered list item';

  it('compacts an external paste, with or without HTML on the clipboard', () => {
    const view = mount();
    paste(
      view,
      NOTION,
      '<p>This is a normal text line</p><p>Another line here</p>'
    );
    expect(view.state.doc.toString()).toBe(COMPACT);

    const second = mount();
    paste(second, NOTION);
    expect(second.state.doc.toString()).toBe(COMPACT);
  });

  it('collapses multiple blank lines from an external app', () => {
    const view = mount();
    paste(view, 'one\n\n\n\n\ntwo');
    expect(view.state.doc.toString()).toBe('one\n\ntwo');
  });

  it('pastes text copied in the same note exactly as it was, blank lines included', () => {
    const doc = 'keep\n\nthis   spacing\n\n\n- [ ]  odd\n';
    const view = mount(doc);
    view.dispatch({ selection: { anchor: 0, head: doc.length } });
    expect(copyOrCut(view, 'copy')).toBe(doc);

    view.dispatch({ selection: { anchor: doc.length } });
    paste(view, doc);

    expect(view.state.doc.toString()).toBe(doc + doc);
  });

  it('pastes text copied in one note into another note exactly as it was', () => {
    const source = mount('a\n\nb\n\n\n```\n\nx\n\n```');
    source.dispatch({
      selection: { anchor: 0, head: source.state.doc.length },
    });
    const copied = copyOrCut(source, 'copy');

    const target = mount();
    paste(target, copied);

    expect(target.state.doc.toString()).toBe(source.state.doc.toString());
  });

  it('keeps formatting through cut and paste, and the cut text is gone from the source', () => {
    const doc = 'one\n\ntwo';
    const view = mount(doc);
    view.dispatch({ selection: { anchor: 0, head: doc.length } });
    const cut = copyOrCut(view, 'cut');
    expect(view.state.doc.toString()).toBe('');

    paste(view, cut);

    expect(view.state.doc.toString()).toBe(doc);
  });

  it("normalizes again once an external copy replaces Clutter's", () => {
    const view = mount('a\n\nb');
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    copyOrCut(view, 'copy');

    const target = mount();
    paste(target, 'x\n\ny');

    expect(target.state.doc.toString()).toBe('x\ny');
  });

  it("treats text recorded by a Copy button (a code block's own text) as internal", () => {
    recordInternalClipboardText('line\n\n\nafter blanks');
    const view = mount();
    paste(view, 'line\n\n\nafter blanks');

    expect(view.state.doc.toString()).toBe('line\n\n\nafter blanks');
  });

  it('replaces the selection, and one undo and redo reverse and reapply each paste', () => {
    const view = mount('start SEL end');
    const from = 'start '.length;
    view.dispatch({ selection: { anchor: from, head: from + 3 } });

    paste(view, 'p\n\nq');
    expect(view.state.doc.toString()).toBe('start p\nq end');

    undo(view);
    expect(view.state.doc.toString()).toBe('start SEL end');
    redo(view);
    expect(view.state.doc.toString()).toBe('start p\nq end');

    // Internal paste, too.
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    const copied = copyOrCut(view, 'copy');
    view.dispatch({
      selection: { anchor: 0 },
      annotations: Transaction.addToHistory.of(false),
    });
    paste(view, copied);
    const afterInternal = view.state.doc.toString();
    expect(afterInternal).toBe(copied + 'start p\nq end');
    undo(view);
    expect(view.state.doc.toString()).toBe('start p\nq end');
    redo(view);
    expect(view.state.doc.toString()).toBe(afterInternal);
  });

  it('keeps fenced code, nested and ordered lists, headings, quotes and tables from an external paste', () => {
    const view = mount();
    paste(
      view,
      '# H\n\n> quote\n\n- a\n\n  - nested\n\n1. one\n\n```\n\n- [ ]   code\n\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |'
    );

    expect(view.state.doc.toString()).toBe(
      // A table keeps the blank line before it (see `blankSeparates`); everything else is compacted.
      '# H\n> quote\n- a\n  - nested\n1. one\n```\n\n- [ ]   code\n\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |'
    );
  });
});
