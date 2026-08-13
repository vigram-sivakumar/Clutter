import { describe, expect, it } from 'vitest';
import { buildDailyNoteSidebarMenu } from './dailyNoteSidebarMenu.config';

describe('buildDailyNoteSidebarMenu', () => {
  it("never includes 'move-to' — Daily Notes are entirely outside the Move feature", () => {
    expect(buildDailyNoteSidebarMenu(false).map((i) => i.id)).not.toContain('move-to');
    expect(buildDailyNoteSidebarMenu(true).map((i) => i.id)).not.toContain('move-to');
  });

  it('returns no items at all for a draft', () => {
    expect(buildDailyNoteSidebarMenu(true)).toEqual([]);
  });

  it("includes 'archive' and 'delete' for a persisted daily note", () => {
    const ids = buildDailyNoteSidebarMenu(false).map((i) => i.id);
    expect(ids).toContain('archive');
    expect(ids).toContain('delete');
  });

  it("labels 'toggle-favorite' as 'Add to Favorites' when isFavorite is false (or omitted)", () => {
    expect(
      buildDailyNoteSidebarMenu(false, false).find((i) => i.id === 'toggle-favorite')?.label
    ).toBe('Add to Favorites');
    expect(
      buildDailyNoteSidebarMenu(false).find((i) => i.id === 'toggle-favorite')?.label
    ).toBe('Add to Favorites');
  });

  it("labels 'toggle-favorite' as 'Remove from Favorites' when isFavorite is true", () => {
    expect(
      buildDailyNoteSidebarMenu(false, true).find((i) => i.id === 'toggle-favorite')?.label
    ).toBe('Remove from Favorites');
  });

  it('omits toggle-favorite for a draft, same as every other item', () => {
    expect(buildDailyNoteSidebarMenu(true).map((i) => i.id)).not.toContain('toggle-favorite');
  });
});
