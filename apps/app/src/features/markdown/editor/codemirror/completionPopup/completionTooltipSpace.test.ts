// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';

import { COLLISION_PADDING } from '@components/overlay/collisionPadding';
import { completionTooltipSpace } from './completionTooltipSpace';

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
