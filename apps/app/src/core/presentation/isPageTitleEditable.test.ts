import { describe, expect, it } from 'vitest';

import { isPageTitleEditable } from './isPageTitleEditable';

describe('isPageTitleEditable', () => {
  it('is true for a regular note', () => {
    expect(isPageTitleEditable('note')).toBe(true);
  });

  it('is false for a Daily Note, always', () => {
    expect(isPageTitleEditable('daily-note')).toBe(false);
  });
});
