// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { editorTheme } from './editorTheme';

describe('editorTheme — caret color', () => {
  it('styles .cm-content caret-color via the design-token variable, not a hardcoded color', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({ extensions: [editorTheme()] });
    new EditorView({ state, parent });

    const injectedCss = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');

    // `.cm-cursor` only exists in the DOM when `drawSelection()` is
    // enabled (it isn't, here) — the real, native caret's color is
    // `caret-color` on `.cm-content`, the actual contenteditable element.
    // CM6's own base theme also declares `.cm-content` caret-color rules
    // (hardcoded black/white under its own `&light`/`&dark` scoping,
    // which never applies here since nothing sets `dark: true`) — so this
    // matches our rule specifically by the property/variable it sets,
    // rather than grabbing the first `.cm-content` occurrence in the
    // sheet (which would be CM6's base rule, not ours).
    expect(injectedCss).toMatch(/\.cm-content\s*\{\s*caret-color:\s*var\(--editor-caret-color\)/);
  });
});
