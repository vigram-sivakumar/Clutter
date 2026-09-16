// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { codeFolding } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { foldToggleDecoration } from '../fold/foldToggleDecoration';
import { fencedCodeActionsButtonDecoration } from './fencedCodeActionsButtonDecoration';
import type { OnOpenFencedCodeMenu } from '../fencedCode/FencedCodeActionsButtonWidget';

function mountView(doc: string, onOpen?: OnOpenFencedCodeMenu, extraExtensions: Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), fencedCodeActionsButtonDecoration(() => onOpen), ...extraExtensions],
  });
  return new EditorView({ state, parent });
}

const jsFence = ['```js', 'const hello = "world";', '```'].join('\n');

describe('fencedCodeActionsButtonDecoration', () => {
  it('renders exactly one Actions button per fenced block, regardless of language', () => {
    const view = mountView(jsFence);
    expect(view.dom.querySelectorAll('.cm-code-block-actions')).toHaveLength(1);
  });

  it('renders an Actions button even for a language with no Format support (Python)', () => {
    const view = mountView(['```py', 'x = 1', '```'].join('\n'));
    expect(view.dom.querySelectorAll('.cm-code-block-actions')).toHaveLength(1);
  });

  it('renders an Actions button even for a fence with no language at all', () => {
    const view = mountView(['```', 'plain text', '```'].join('\n'));
    expect(view.dom.querySelectorAll('.cm-code-block-actions')).toHaveLength(1);
  });

  it('renders one button per block when there are multiple fenced blocks', () => {
    const view = mountView([jsFence, '', '```', 'plain', '```'].join('\n'));
    expect(view.dom.querySelectorAll('.cm-code-block-actions')).toHaveLength(2);
  });

  it('clicking Actions calls the injected callback with the anchor element and the exact FencedCode node range', () => {
    const onOpen = vi.fn();
    const view = mountView(jsFence, onOpen);
    const button = view.dom.querySelector<HTMLButtonElement>('.cm-code-block-actions');
    expect(button).not.toBeNull();

    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    const call = onOpen.mock.calls[0]![0];
    expect(call.anchor).toBe(button);
    expect(call.nodeFrom).toBe(0);
    expect(call.nodeTo).toBe(jsFence.length);
  });

  it('clicking Actions does not move the caret or insert anything into the document', () => {
    const view = mountView(jsFence);
    view.dispatch({ selection: { anchor: 3 } });

    const button = view.dom.querySelector<HTMLButtonElement>('.cm-code-block-actions');
    button!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(view.state.doc.toString()).toBe(jsFence);
    expect(view.state.selection.main.head).toBe(3);
  });

  it('tilde fences also get an Actions button', () => {
    const view = mountView(['~~~py', 'print("hi")', '~~~'].join('\n'));
    expect(view.dom.querySelectorAll('.cm-code-block-actions')).toHaveLength(1);
  });

  it('does not throw for an unclosed fence while typing', () => {
    expect(() => mountView(['```js', 'const x = 1;'].join('\n'))).not.toThrow();
  });

  it('folding a block does not duplicate its Actions button — a fold splits view.visibleRanges, and the FencedCode node must only be visited once across them', () => {
    const doc = ['```ts', 'const x = 1', 'const y = 2', '```'].join('\n');
    const view = mountView(doc, undefined, [codeFolding(), foldToggleDecoration()]);
    expect(view.dom.querySelectorAll('.cm-code-block-actions')).toHaveLength(1);

    const toggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(view.dom.querySelectorAll('.cm-code-block-actions')).toHaveLength(1);
  });
});
