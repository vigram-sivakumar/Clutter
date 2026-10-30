// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, redo, undo } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { toggleUnderline } from './toggleUnderline';

const views: EditorView[] = [];
afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.innerHTML = '';
});

/** Mounts `doc` with the selection marked by `[` `]` (removed from the text); no markers means an empty caret at the end. */
function mount(marked: string): EditorView {
  const open = marked.indexOf('«');
  const close = marked.indexOf('»');
  const doc = marked.replace('«', '').replace('»', '');
  const from = open < 0 ? doc.length : open;
  const to = close < 0 ? from : close - 1;
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.range(from, to),
      extensions: [markdownLanguageExtension(), history()],
    }),
    parent,
  });
  views.push(view);
  return view;
}

function run(marked: string): string {
  const view = mount(marked);
  toggleUnderline(view);
  return view.state.doc.toString();
}

function selected(view: EditorView): string {
  const { from, to } = view.state.selection.main;
  return view.state.sliceDoc(from, to);
}

describe('toggleUnderline — applying and removing', () => {
  it('wraps the selection in <u>…</u> and leaves the text around it alone', () => {
    expect(run('This is «underlined text» in a note.')).toBe('This is <u>underlined text</u> in a note.');
  });

  it('keeps the selection on the text, not the tags', () => {
    const view = mount('say «hello world» now');
    toggleUnderline(view);
    expect(selected(view)).toBe('hello world');
  });

  it('handles several words, punctuation and spaces', () => {
    expect(run('«Hi, there — friend!» ok')).toBe('<u>Hi, there — friend!</u> ok');
  });

  it('removes an underline when the selection is exactly its text', () => {
    expect(run('a <u>«word»</u> b')).toBe('a word b');
  });

  it('removes it when the selection takes the tags in too', () => {
    expect(run('a «<u>word</u>» b')).toBe('a word b');
  });

  it('toggling twice restores the original text', () => {
    const view = mount('one «two» three');
    toggleUnderline(view);
    toggleUnderline(view);
    expect(view.state.doc.toString()).toBe('one two three');
    expect(selected(view)).toBe('two');
  });

  it('removing from the middle of an underline splits it', () => {
    expect(run('<u>one «two» three</u>')).toBe('<u>one </u>two<u> three</u>');
  });

  it('removing from one end of an underline shortens it', () => {
    expect(run('<u>«one» two</u>')).toBe('one<u> two</u>');
    expect(run('<u>one «two»</u>')).toBe('<u>one </u>two');
  });

  it('a partly underlined selection becomes one underline over all of it', () => {
    expect(run('<u>on«e</u> two»')).toBe('<u>one two</u>');
    expect(run('«one <u>t»wo</u> three')).toBe('<u>one two</u> three');
  });

  it('a selection holding several underlines and plain text merges them into one', () => {
    expect(run('«<u>a</u> b <u>c</u>»')).toBe('<u>a b c</u>');
  });

  it('a selection next to an underline but not touching it leaves that underline alone', () => {
    expect(run('<u>one</u> t«wo three»')).toBe('<u>one</u> t<u>wo three</u>');
  });

  it('a selection over two underlines and the line break between them joins them into one', () => {
    expect(run('«<u>a</u>\n<u>b</u>»')).toBe('<u>a\nb</u>');
  });
});

describe('toggleUnderline — empty selection', () => {
  it('inserts an empty pair with the caret between the tags, like Bold', () => {
    const view = mount('hello');
    toggleUnderline(view);
    expect(view.state.doc.toString()).toBe('hello<u></u>');
    expect(view.state.selection.main.head).toBe('hello<u>'.length);
  });

  it('removes an empty pair the caret is inside', () => {
    const view = mount('hello<u></u>');
    view.dispatch({ selection: { anchor: 'hello<u>'.length } });
    toggleUnderline(view);
    expect(view.state.doc.toString()).toBe('hello');
    expect(view.state.selection.main.head).toBe(5);
  });

  it('typing inside the pair stays underlined', () => {
    const view = mount('x');
    toggleUnderline(view);
    view.dispatch({ changes: { from: view.state.selection.main.head, insert: 'abc' }, userEvent: 'input.type' });
    expect(view.state.doc.toString()).toBe('x<u>abc</u>');
  });
});

describe('toggleUnderline — supported blocks', () => {
  it.each([1, 2, 3, 4, 5, 6])('underlines text in an H%i without touching its marker', (level) => {
    const hashes = '#'.repeat(level);
    expect(run(`${hashes} A «heading» here`)).toBe(`${hashes} A <u>heading</u> here`);
  });

  it('keeps the # marker out of the underline when the whole heading line is selected', () => {
    expect(run('«## Whole heading»')).toBe('## <u>Whole heading</u>');
  });

  it('keeps a closing # sequence out of it too', () => {
    expect(run('«## Title ##»')).toBe('## <u>Title</u> ##');
  });

  it('underlines a Setext heading without its underline row', () => {
    expect(run('«Title\n=====»')).toBe('<u>Title</u>\n=====');
    expect(run('«Title\n-----»')).toBe('<u>Title</u>\n-----');
  });

  it('refuses a selection that reaches from a heading into the next paragraph', () => {
    const doc = '# Head\n\nBody';
    expect(run('# «Head\n\nBody»')).toBe(doc);
  });

  it('underlines across a soft line break inside one paragraph', () => {
    expect(run('«one\ntwo»')).toBe('<u>one\ntwo</u>');
  });

  it('keeps a hard-break backslash in place inside the underline', () => {
    expect(run('«one\\\ntwo»')).toBe('<u>one\\\ntwo</u>');
  });
});

describe('toggleUnderline — nested formatting inside a paragraph', () => {
  it('underlines text inside bold without touching the bold markers', () => {
    expect(run('**bold «text»**')).toBe('**bold <u>text</u>**');
  });

  it('underlines text inside italic', () => {
    expect(run('*it«alic» word*')).toBe('*it<u>alic</u> word*');
  });

  it('underlines a whole bold run from outside its markers', () => {
    expect(run('«**bold**»')).toBe('<u>**bold**</u>');
  });

  it('cuts at a bold boundary so the tags nest correctly', () => {
    expect(run('**a«b** c»')).toBe('**a<u>b</u>**<u> c</u>');
    expect(run('«a **b»c**')).toBe('<u>a </u>**<u>b</u>c**');
  });

  it('works inside strikethrough and highlight', () => {
    expect(run('~~«gone»~~')).toBe('~~<u>gone</u>~~');
    expect(run('==«mark»==')).toBe('==<u>mark</u>==');
  });

  it('removing an underline from text inside bold takes the whole bold run out, never splitting its markers', () => {
    expect(run('<u>**«b»**</u>')).toBe('**b**');
    expect(run('<u>x **«b»** y</u>')).toBe('<u>x </u>**b**<u> y</u>');
  });

  it('an underline inside bold stays inside it when part of it is removed', () => {
    expect(run('**<u>one «two» three</u>**')).toBe('**<u>one </u>two<u> three</u>**');
  });
});

/** Every one of these must leave the document and the selection exactly as they were. */
describe('toggleUnderline — refused contexts', () => {
  function refused(marked: string): void {
    const view = mount(marked);
    const before = view.state.doc.toString();
    const selection = view.state.selection.main;
    const handled = toggleUnderline(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe(before);
    expect(view.state.selection.main.from).toBe(selection.from);
    expect(view.state.selection.main.to).toBe(selection.to);
  }

  it('inline code', () => {
    refused('a `«code»` b');
    refused('a «`code`» b');
    refused('a `co«de` b');
  });

  it('fenced code blocks', () => {
    refused('```\n«code»\n```');
    refused('```ts\nlet «x» = 1\n```');
  });

  it('wiki links, including a selection that also holds ordinary text', () => {
    refused('go to [[Li«sts]] now');
    refused('«go to [[Lists]]» now');
    refused('«[[Lists]]»');
    refused('[[Pa«ge|ali»as]]');
  });

  it('Markdown links: label, syntax and destination', () => {
    refused('[«label»](https://example.com)');
    refused('[label](https://exam«ple».com)');
    refused('«see [label](https://example.com)»');
    refused('<https://exa«mple».com>');
    refused('visit https://exa«mple».com now');
  });

  it('images and embeds', () => {
    refused('«![alt](pic.png)»');
    refused('![a«lt](pic.png)');
    refused('«![[note.md]]»');
    refused('![[no«te]]');
  });

  it('tags and dates', () => {
    refused('a «#tag» b');
    refused('a «@2026-08-20» b');
  });

  it('tables and table cells', () => {
    refused('| a | b |\n| - | - |\n| «c» | d |');
    refused('«| a | b |\n| - | - |\n| c | d |»');
  });

  it('blockquotes', () => {
    refused('> «quoted» text');
    refused('«> quoted»');
  });

  it('unordered and ordered lists', () => {
    refused('- «item» one');
    refused('«- one\n- two»');
    refused('1. «item» one');
  });

  it('task lists and their checkboxes', () => {
    refused('- [ ] «task» text');
    refused('- «[ ]» task');
  });

  it.each([
    ['---'],
    ['***'],
    ['---Title---'],
    ['~---~'],
    ['~---Title---~'],
    ['=---Title---='],
    ['.---.'],
    ['.---Title---.'],
  ])('the divider %s, selected whole or in part', (divider) => {
    refused(`«${divider}»`);
    refused(`${divider.slice(0, 2)}«${divider.slice(2)}»`);
  });

  it('a Setext underline row and a heading marker on their own', () => {
    refused('Title\n«=====»');
    refused('«##» Heading');
  });

  it('a selection that crosses a paragraph boundary', () => {
    refused('one «two\n\nthree» four');
  });

  it('a selection that crosses from a paragraph into a heading', () => {
    refused('one «two\n\n# Head»ing');
  });

  it('a selection that mixes a paragraph with a list', () => {
    refused('one «two\n\n- item» x');
  });

  it('an empty selection inside any of these, so a pair is never started there', () => {
    for (const doc of ['a `co«de` b', 'go to [[Li«sts]]', '[la«bel](http://a.b)', '> qu«ote', '- it«em', '- [ ] ta«sk', '---Ti«tle---', '| a«b |\n| - |']) {
      refused(doc);
    }
  });

  it('does not consume the key into history: nothing to undo afterwards', () => {
    const view = mount('a `«code»` b');
    toggleUnderline(view);
    expect(undo(view)).toBe(false);
  });

  it('removing a pre-existing underline is refused in a list too', () => {
    refused('- <u>«word»</u>');
  });
});

describe('toggleUnderline — empty selection in supported blocks', () => {
  it('starts a pair in a heading', () => {
    const view = mount('# Title');
    toggleUnderline(view);
    expect(view.state.doc.toString()).toBe('# Title<u></u>');
    expect(view.state.selection.main.head).toBe('# Title<u>'.length);
  });
});

describe('toggleUnderline — parsing the result', () => {
  function names(doc: string): string[] {
    const found: string[] = [];
    const view = mount(doc);
    syntaxTree(view.state).iterate({ enter: (n) => void found.push(n.name) });
    return found;
  }

  it('the saved text parses as an Underline with two marks', () => {
    expect(names(run('«word»'))).toEqual(expect.arrayContaining(['Underline', 'UnderlineMark']));
  });

  it('survives save and reload: the same text parses to the same underline in a fresh editor', () => {
    const saved = run('a «b c» d');
    const reopened = mount(saved);
    const ranges: [number, number][] = [];
    syntaxTree(reopened.state).iterate({
      enter: (n) => {
        if (n.name === 'Underline') {
          ranges.push([n.from, n.to]);
        }
      },
    });
    expect(saved).toBe('a <u>b c</u> d');
    expect(ranges).toEqual([[2, 12]]);
  });

  it('an unpaired <u> is ordinary text, not an underline', () => {
    expect(names('a <u> b')).not.toContain('Underline');
  });

  it('<u> in a code span stays literal', () => {
    expect(names('`<u>x</u>`')).not.toContain('Underline');
  });

  it('nests with bold in either order', () => {
    expect(names('**<u>x</u>**')).toEqual(expect.arrayContaining(['StrongEmphasis', 'Underline']));
    expect(names('<u>**x**</u>')).toEqual(expect.arrayContaining(['StrongEmphasis', 'Underline']));
  });
});

describe('toggleUnderline — undo and redo', () => {
  it('undo restores the text and redo applies the underline again', () => {
    const view = mount('one «two» three');
    toggleUnderline(view);
    expect(view.state.doc.toString()).toBe('one <u>two</u> three');
    undo(view);
    expect(view.state.doc.toString()).toBe('one two three');
    redo(view);
    expect(view.state.doc.toString()).toBe('one <u>two</u> three');
  });

  it('undoing a removal brings the tags back in one step', () => {
    const view = mount('<u>«two»</u>');
    toggleUnderline(view);
    expect(view.state.doc.toString()).toBe('two');
    undo(view);
    expect(view.state.doc.toString()).toBe('<u>two</u>');
  });
});
