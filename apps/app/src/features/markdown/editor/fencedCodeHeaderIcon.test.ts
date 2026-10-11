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

function mount(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);

  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdownLanguageExtension(), fencedCodeBlockLineDecoration(), codeFolding(), foldToggleDecoration()],
    }),
    parent,
  });
}

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

describe('the icon rule in MarkdownEditor.css', () => {
  const css = readFileSync(join(__dirname, 'MarkdownEditor.css'), 'utf8');
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  /** Every declaration block with exactly this selector, joined: a selector can have more than one rule. */
  const ruleFor = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  it('never uses margin, per the permanent fenced-code layout rule', () => {
    expect(ruleFor('.cm-editor .cm-code-block-line--first::before')).not.toMatch(/margin/);
    expect(ruleFor('.cm-editor .cm-code-block-line--first')).not.toMatch(/margin/);
  });

  it("leaves the line-number ::before to the lines between the fences: the first line is excluded from it", () => {
    expect(stripped).toMatch(
      /\.cm-code-block-line:not\(\.cm-code-block-line--first\):not\(\s*\.cm-code-block-line--last\s*\)::before\s*\{[^}]*content:\s*counter/
    );
  });
});
