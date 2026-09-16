// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { codeFolding } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { foldToggleDecoration } from '../fold/foldToggleDecoration';
import { fencedCodeCopyButtonDecoration } from './fencedCodeCopyButtonDecoration';

function mountView(doc: string, extraExtensions: Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), fencedCodeCopyButtonDecoration(), ...extraExtensions],
  });
  return new EditorView({ state, parent });
}

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const jsFence = ['```js', 'const hello = "world";', 'console.log(hello);', '```'].join('\n');

describe('fencedCodeCopyButtonDecoration', () => {
  it('renders exactly one Copy button per fenced block', () => {
    const view = mountView(jsFence);
    expect(view.dom.querySelectorAll('.cm-code-block-copy')).toHaveLength(1);
  });

  it('renders one button per block when there are multiple fenced blocks', () => {
    const view = mountView([jsFence, '', '```', 'plain', '```'].join('\n'));
    expect(view.dom.querySelectorAll('.cm-code-block-copy')).toHaveLength(2);
  });

  it('clicking Copy writes exactly the code content — no fences, no info string, newlines preserved', () => {
    const view = mountView(jsFence);
    const button = view.dom.querySelector<HTMLButtonElement>('.cm-code-block-copy');
    expect(button).not.toBeNull();

    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(writeText).toHaveBeenCalledWith('const hello = "world";\nconsole.log(hello);');
  });

  it('an empty fenced block copies the empty string, not an error', () => {
    const view = mountView(['```js', '```'].join('\n'));
    const button = view.dom.querySelector<HTMLButtonElement>('.cm-code-block-copy');

    expect(() => button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
    expect(writeText).toHaveBeenCalledWith('');
  });

  it('reads the current content, not stale content, after the code body is edited', () => {
    const view = mountView(jsFence);

    const insertAt = jsFence.indexOf('console');
    view.dispatch({ changes: { from: insertAt, to: insertAt, insert: 'debugger;\n' } });

    const button = view.dom.querySelector<HTMLButtonElement>('.cm-code-block-copy');
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(writeText).toHaveBeenCalledWith(
      'const hello = "world";\ndebugger;\nconsole.log(hello);'
    );
  });

  it('clicking Copy does not move the caret or insert anything into the document', () => {
    const view = mountView(jsFence);
    view.dispatch({ selection: { anchor: 3 } });

    const button = view.dom.querySelector<HTMLButtonElement>('.cm-code-block-copy');
    button!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(view.state.doc.toString()).toBe(jsFence);
    expect(view.state.selection.main.head).toBe(3);
  });

  it('Copy works identically for a first-expansion-batch language, independent of whether its parser has loaded — Rust', () => {
    // Copy reads `CodeText` directly from the tree regardless of which
    // (or whether any) nested language parser is mounted — it never
    // depends on `LanguageDescription.support`/`.load()`, so a lazily
    // registered language must copy correctly even before its parser has
    // resolved.
    const view = mountView(['```rust', 'fn main() {}', '```'].join('\n'));
    const button = view.dom.querySelector<HTMLButtonElement>('.cm-code-block-copy');

    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(writeText).toHaveBeenCalledWith('fn main() {}');
  });

  it('tilde fences also get a Copy button', () => {
    const view = mountView(['~~~py', 'print("hi")', '~~~'].join('\n'));
    expect(view.dom.querySelectorAll('.cm-code-block-copy')).toHaveLength(1);
  });

  it('does not throw for an unclosed fence while typing', () => {
    expect(() => mountView(['```js', 'const x = 1;'].join('\n'))).not.toThrow();
  });

  it('folding a block does not duplicate its Copy button — a fold splits view.visibleRanges, and the FencedCode node must only be visited once across them', () => {
    const doc = ['```ts', 'const x = 1', 'const y = 2', '```'].join('\n');
    const view = mountView(doc, [codeFolding(), foldToggleDecoration()]);
    expect(view.dom.querySelectorAll('.cm-code-block-copy')).toHaveLength(1);

    const toggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(view.dom.querySelectorAll('.cm-code-block-copy')).toHaveLength(1);
  });
});
