// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { dateDecorations } from './dateDecorations';
import { hopLeft, hopRight } from './dateKeymap';
import type { ResolveDate } from './dateResolution';

/**
 * Test document throughout: 'x @2026-08-20 y' — the Date spans [2, 13)
 * (11 characters: `@2026-08-20`).
 */
function mountView(doc: string, cursorPos: number, resolver?: ResolveDate): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdownLanguageExtension(), dateDecorations(() => resolver)],
  });
  return new EditorView({ state, parent });
}

const resolved = (): ResolveDate => () => ({ activate: vi.fn() });

describe('hopRight / hopLeft — Date', () => {
  it('one position before an at-rest Date, hopRight hops in from the left (near) boundary', () => {
    const view = mountView('x @2026-08-20 y', 1, resolved());

    const handled = hopRight(view);

    expect(handled).toBe(true);
    expect(view.state.selection.main.head).toBe(2);
  });

  it('one position after an at-rest Date, hopLeft hops in from the right (near) boundary', () => {
    const view = mountView('x @2026-08-20 y', 14, resolved());

    const handled = hopLeft(view);

    expect(handled).toBe(true);
    expect(view.state.selection.main.head).toBe(13);
  });

  it('hopRight does nothing when not adjacent to a Date', () => {
    const view = mountView('x @2026-08-20 y', 0, resolved());

    expect(hopRight(view)).toBe(false);
  });

  it('the hop lands the caret in an engaged (revealed) position', () => {
    const view = mountView('x @2026-08-20 y', 1, resolved());

    hopRight(view);

    expect(view.dom.querySelector('[data-date-status]')).toBeNull();
    expect(view.dom.textContent).toContain('@2026-08-20');
  });
});
