import { describe, expect, it } from 'vitest';
import { buildNoteSidebarMenu } from './noteSidebarMenu.config';

describe('buildNoteSidebarMenu', () => {
  it("includes 'move-to' for a persisted note", () => {
    expect(buildNoteSidebarMenu(false).map((i) => i.id)).toContain('move-to');
  });

  it('returns no items at all for a draft (move-to included in that omission)', () => {
    expect(buildNoteSidebarMenu(true)).toEqual([]);
  });

  it("labels 'toggle-favorite' as 'Add to Favorites' when isFavorite is false (or omitted)", () => {
    expect(
      buildNoteSidebarMenu(false, false).find((i) => i.id === 'toggle-favorite')?.label
    ).toBe('Add to Favorites');
    expect(buildNoteSidebarMenu(false).find((i) => i.id === 'toggle-favorite')?.label).toBe(
      'Add to Favorites'
    );
  });

  it("labels 'toggle-favorite' as 'Remove from Favorites' when isFavorite is true", () => {
    expect(
      buildNoteSidebarMenu(false, true).find((i) => i.id === 'toggle-favorite')?.label
    ).toBe('Remove from Favorites');
  });
});
