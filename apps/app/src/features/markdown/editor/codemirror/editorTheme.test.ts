// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { editorTheme } from './editorTheme';

describe('editorTheme — caret color', () => {
  it('styles .cm-cursor via the design-token variable, not a hardcoded color', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({ extensions: [editorTheme()] });
    new EditorView({ state, parent });

    const injectedCss = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');

    // CM6's own base theme also declares `.cm-cursor` rules (hardcoded
    // black/#ddd), under its own generated scoping class — so this
    // matches our rule specifically by the property it sets, rather than
    // grabbing the first `.cm-cursor` occurrence in the sheet (which
    // would be CM6's base rule, not ours).
    expect(injectedCss).toMatch(/\.cm-cursor\s*\{\s*border-left-color:\s*var\(--foreground-primary\)/);
  });
});
