// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tagDecorations } from './tagDecorations';
import { hopLeft, hopRight } from './tagKeymap';
import type { ResolveTag } from './tagResolution';

/**
 * Calls hopRight/hopLeft directly as plain functions rather than via a
 * simulated keydown — same rationale wikiLinkKeymap.test.ts documents:
 * CM6's own cursorCharRight/Left commands would silently bypass a custom
 * keymap.of(...) binding entirely.
 *
 * Test document throughout: 'x #project y' — the Tag spans [2, 10) (8
 * characters: `#project`).
 */
function mountView(doc: string, cursorPos: number, resolver?: ResolveTag): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdownLanguageExtension(), tagDecorations(() => resolver)],
  });
  return new EditorView({ state, parent });
}

const resolvedTag = (): ResolveTag => () => ({ status: 'resolved', displayLabel: 'project', activate: vi.fn() });

describe('hopRight / hopLeft — Tag', () => {
  it('one position before an at-rest Tag, hopRight hops in from the left (near) boundary', () => {
    // node = [2, 10); one position before its start is 1.
    const view = mountView('x #project y', 1, resolvedTag());

    const handled = hopRight(view);

    expect(handled).toBe(true);
    expect(view.state.selection.main.head).toBe(2);
  });

  it('one position after an at-rest Tag, hopLeft hops in from the right (near) boundary', () => {
    // node = [2, 10); one position after its end is 11.
    const view = mountView('x #project y', 11, resolvedTag());

    const handled = hopLeft(view);

    expect(handled).toBe(true);
    expect(view.state.selection.main.head).toBe(10);
  });

  it('hopRight does nothing when not adjacent to a Tag', () => {
    const view = mountView('x #project y', 0, resolvedTag());

    expect(hopRight(view)).toBe(false);
  });

  it('the hop lands the caret in an engaged (revealed) position', () => {
    const view = mountView('x #project y', 1, resolvedTag());

    hopRight(view);

    expect(view.dom.querySelector('[data-tag-status]')).toBeNull();
    expect(view.dom.textContent).toContain('#project');
  });
});
