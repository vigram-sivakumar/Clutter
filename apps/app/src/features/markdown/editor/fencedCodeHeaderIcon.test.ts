// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { codeFolding, forceParsing } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from './codemirror/markdownLanguage';
import { fencedCodeBlockLineDecoration } from './codemirror/highlight/fencedCodeBlockLineDecoration';
import { foldToggleDecoration } from './codemirror/fold/foldToggleDecoration';

/**
 * The fenced-code header's icon is the `::before` of the block's first line (`.cm-code-block-line--first`), in
 * `MarkdownEditor.css`. jsdom applies no real CSS, so this checks the two things it rests on: every block's first
 * line really carries that class (with or without a language, `~~~` or backticks, expanded or folded), and the
 * rule's text — the shared `code.svg`, the same tokens an embed header's icon uses, padding and never margin.
 */

function mount(doc: string, options: { caret?: number; readOnly?: boolean } = {}): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);

  return new EditorView({
    state: EditorState.create({
      doc,
      selection: options.caret === undefined ? undefined : { anchor: options.caret },
      extensions: [
        markdownLanguageExtension(),
        fencedCodeBlockLineDecoration(),
        codeFolding(),
        foldToggleDecoration(),
        ...(options.readOnly ? [EditorState.readOnly.of(true)] : []),
      ],
    }),
    parent,
  });
}

/** The `--first` lines that are being edited as Markdown (their icon steps aside). */
const editingFence = (view: EditorView) =>
  Array.from(view.dom.querySelectorAll('.cm-code-block-line--editing-fence')).map((line) => line.textContent);

const firstLines = (view: EditorView) =>
  Array.from(view.dom.querySelectorAll('.cm-code-block-line--first')).map((line) => line.textContent);

describe('the header icon has a line to hang on: every fenced block\'s first line carries --first', () => {
  it('a block with a language', () => {
    expect(firstLines(mount('```html\n<p>x</p>\n```'))).toEqual(['```html']);
  });

  it('a block without a language', () => {
    expect(firstLines(mount('```\nplain\n```'))).toEqual(['```']);
  });

  it('a tilde fence, with and without a language', () => {
    expect(firstLines(mount('~~~js\nx\n~~~\n\n~~~\ny\n~~~'))).toEqual(['~~~js', '~~~']);
  });

  it('an unclosed fence', () => {
    expect(firstLines(mount('```'))).toEqual(['```']);
  });

  it('each of several blocks', () => {
    expect(firstLines(mount('```js\na\n```\n\ntext\n\n```\nb\n```'))).toEqual(['```js', '```']);
  });

  it('a block that is collapsed: its first line is the one that stays', () => {
    const view = mount('```html\nline one\nline two\n```');
    forceParsing(view);
    expect(view.dom.querySelectorAll('.cm-code-block-line')).toHaveLength(4);

    view.dom.querySelector<HTMLButtonElement>('.cm-fold-toggle')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const lines = view.dom.querySelectorAll('.cm-code-block-line');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.classList.contains('cm-code-block-line--first')).toBe(true);
  });
});

describe('the icon steps aside only while the opening fence itself is being edited', () => {
  const doc = 'before\n\n```html\n<p>x</p>\nmore\n```\n\nafter';
  const at = (needle: string, offset = 0) => doc.indexOf(needle) + offset;

  it('is shown with the caret outside the block', () => {
    expect(editingFence(mount(doc, { caret: at('before') }))).toEqual([]);
    expect(editingFence(mount(doc, { caret: at('after', 2) }))).toEqual([]);
  });

  it('is shown with the caret in the code body, writing or editing code', () => {
    expect(editingFence(mount(doc, { caret: at('<p>', 1) }))).toEqual([]);
    expect(editingFence(mount(doc, { caret: at('more', 4) }))).toEqual([]);
  });

  it('is shown with the caret on the closing fence', () => {
    expect(editingFence(mount(doc, { caret: at('```\n\nafter', 1) }))).toEqual([]);
  });

  it('steps aside with the caret on the opening fence line: at its start, in its language, at its end', () => {
    const fenceStart = at('```html');

    expect(editingFence(mount(doc, { caret: fenceStart }))).toEqual(['```html']);
    expect(editingFence(mount(doc, { caret: fenceStart + 5 }))).toEqual(['```html']);
    expect(editingFence(mount(doc, { caret: fenceStart + '```html'.length }))).toEqual(['```html']);
  });

  it('steps aside for a block without a language too', () => {
    expect(editingFence(mount('```\ncode\n```', { caret: 1 }))).toEqual(['```']);
    expect(editingFence(mount('```\ncode\n```', { caret: 6 }))).toEqual([]);
  });

  it('only the block being edited steps aside, not its neighbours', () => {
    const two = '```js\na\n```\n\n```css\nb\n```';
    const view = mount(two, { caret: two.indexOf('```css') + 2 });

    expect(editingFence(view)).toEqual(['```css']);
    expect(firstLines(view)).toEqual(['```js', '```css']);
  });

  it('follows the caret: moving it from the header into the body brings the icon back, and back again', () => {
    const view = mount(doc, { caret: at('```html', 1) });
    expect(editingFence(view)).toEqual(['```html']);

    view.dispatch({ selection: { anchor: at('more', 1) } });
    expect(editingFence(view)).toEqual([]);

    view.dispatch({ selection: { anchor: at('```html', 2) } });
    expect(editingFence(view)).toEqual(['```html']);
  });

  it('typing code in the body keeps it shown', () => {
    const view = mount(doc, { caret: at('more', 4) });

    view.dispatch({ changes: { from: at('more', 4), insert: ' text' }, selection: { anchor: at('more', 9) } });

    expect(editingFence(view)).toEqual([]);
  });

  it('is never set in a read-only editor, where the raw fence is never shown', () => {
    expect(editingFence(mount(doc, { caret: at('```html', 2), readOnly: true }))).toEqual([]);
  });

  it('a collapsed block keeps its icon unless its own opening fence is being edited', () => {
    const collapsedDoc = '```html\nline one\nline two\n```\n\nafter';
    const view = mount(collapsedDoc, { caret: collapsedDoc.length });
    forceParsing(view);
    view.dom.querySelector<HTMLButtonElement>('.cm-fold-toggle')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(view.dom.querySelectorAll('.cm-code-block-line')).toHaveLength(1);
    expect(editingFence(view)).toEqual([]);

    view.dispatch({ selection: { anchor: 3 } });
    expect(editingFence(view)).toEqual(['```html…']);
  });
});

describe('the icon rule in MarkdownEditor.css', () => {
  const css = readFileSync(join(__dirname, 'MarkdownEditor.css'), 'utf8');
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  /** Every declaration block with exactly this selector, joined: a selector can have more than one rule. */
  const ruleFor = (selector: string): string => {
    // Whitespace between the selector's parts is any whitespace: a formatter may wrap a long selector across lines.
    const escaped = selector
      .split(' ')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+');
    const matches = [...stripped.matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
    expect(matches.length, `${selector} rule not found`).toBeGreaterThan(0);

    return matches.map((m) => m[1] ?? '').join('\n');
  };

  it("is the first line's ::before, absolutely positioned so it takes no part in layout", () => {
    const rule = ruleFor('.cm-editor .cm-code-block-line--first::before');

    expect(rule).toMatch(/content:\s*''/);
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/pointer-events:\s*none/);
    expect(rule).toMatch(/user-select:\s*none/);
  });

  it("uses the embed icon's box and colour tokens, at an embed header's inset", () => {
    const rule = ruleFor('.cm-editor .cm-code-block-line--first::before');

    expect(rule).toMatch(/width:\s*var\(--md-marker-width\)/);
    expect(rule).toMatch(/height:\s*var\(--md-marker-height\)/);
    expect(rule).toMatch(/left:\s*var\(--space-6\)/);
    expect(rule).toMatch(/background-color:\s*var\(--foreground-tertiary\)/);
    // The glyph is `--icon-md`, centred in the box, like an embed icon in its wrap.
    expect(rule).toMatch(/center\s*\/\s*var\(--icon-md\)\s+var\(--icon-md\)\s+no-repeat/);
  });

  it("masks the shared code.svg itself, which exists, in both the prefixed and unprefixed property", () => {
    const rule = ruleFor('.cm-editor .cm-code-block-line--first::before');
    const urls = [...rule.matchAll(/mask:\s*url\('([^']+)'\)/g)].map((m) => m[1]!);

    expect(urls).toHaveLength(2);
    for (const url of urls) {
      expect(url).toMatch(/shared\/icon\/svg\/code\.svg$/);
      expect(existsSync(join(__dirname, url))).toBe(true);
    }
  });

  it('makes room for the icon with padding on the first line — icon box, then the embed icon-to-text gap', () => {
    const rule = ruleFor('.cm-editor .cm-code-block-line--first');

    expect(rule).toMatch(
      /padding-inline-start:\s*calc\(\s*var\(--space-6\)\s*\+\s*var\(--md-marker-width\)\s*\+\s*var\(--md-marker-text-gap\)\s*\)/
    );
  });

  it('that padding comes after the shared first/last padding rule, so it wins by source order', () => {
    const shared = stripped.indexOf('.cm-editor .cm-code-block-line--first,\n.cm-editor .cm-code-block-line--last {');
    const override = stripped.search(/\.cm-editor \.cm-code-block-line--first \{\s*padding-inline-start:\s*calc/);

    expect(shared).toBeGreaterThan(-1);
    expect(override).toBeGreaterThan(shared);
  });

  it('while the opening fence is being edited the icon is hidden and the line gets its old padding back', () => {
    const editing = '.cm-editor .cm-code-block-line--first.cm-code-block-line--editing-fence';

    expect(ruleFor(editing)).toMatch(/padding-inline-start:\s*var\(--space-12\)/);
    expect(ruleFor(`${editing}::before`)).toMatch(/display:\s*none/);
    // Declared after the rules they override (they are two-class selectors, so they win either way).
    expect(stripped.indexOf(editing)).toBeGreaterThan(stripped.indexOf('.cm-editor .cm-code-block-line--first::before'));
  });

  it('never uses margin, per the permanent fenced-code layout rule', () => {
    expect(ruleFor('.cm-editor .cm-code-block-line--first::before')).not.toMatch(/margin/);
    expect(ruleFor('.cm-editor .cm-code-block-line--first')).not.toMatch(/margin/);
    expect(ruleFor('.cm-editor .cm-code-block-line--first.cm-code-block-line--editing-fence')).not.toMatch(/margin/);
  });

  it("leaves the line-number ::before to the lines between the fences: the first line is excluded from it", () => {
    expect(stripped).toMatch(
      /\.cm-code-block-line:not\(\.cm-code-block-line--first\):not\(\s*\.cm-code-block-line--last\s*\)::before\s*\{[^}]*content:\s*counter/
    );
  });
});
