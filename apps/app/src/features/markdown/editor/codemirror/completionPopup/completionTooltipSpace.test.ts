// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, showTooltip, tooltips } from '@codemirror/view';

import { COLLISION_PADDING } from '@components/overlay/collisionPadding';
import { completionPopupDOM, completionTooltipSpace } from './completionTooltipSpace';

describe('completionTooltipSpace', () => {
  it('is the window inset by the shared overlay collision padding', () => {
    const view = { dom: document.createElement('div') } as unknown as EditorView;
    expect(completionTooltipSpace(view)).toEqual({
      top: COLLISION_PADDING,
      left: COLLISION_PADDING,
      right: window.innerWidth - COLLISION_PADDING,
      bottom: window.innerHeight - COLLISION_PADDING,
    });
  });

  it('uses the same 16px the Overlay keeps', () => {
    expect(COLLISION_PADDING).toBe(16);
  });
});

describe('completionPopupDOM', () => {
  it('ignores absent tooltip facet entries and resolves the actual view-owned popup', () => {
    const parent = document.body.appendChild(document.createElement('div'));
    const popup = document.createElement('div');
    popup.className = 'cm-tooltip-autocomplete';
    const view = new EditorView({
      parent,
      state: EditorState.create({ extensions: [
        tooltips({ parent: document.body }),
        showTooltip.of(null),
        showTooltip.of({ pos: 0, create: () => ({ dom: popup }) }),
      ] }),
    });
    try {
      expect(completionPopupDOM(view)).toBe(popup);
    } finally {
      view.destroy();
      parent.remove();
    }
    expect(popup.isConnected).toBe(false);
  });
});
