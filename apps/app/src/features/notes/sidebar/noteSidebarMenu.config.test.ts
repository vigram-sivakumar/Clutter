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
      buildNoteSidebarMenu(false, false).find((i) => i.id === 'toggle-favorite')
        ?.label
    ).toBe('Add to Favorites');
    expect(
      buildNoteSidebarMenu(false).find((i) => i.id === 'toggle-favorite')?.label
    ).toBe('Add to Favorites');
  });

  it("includes 'change-icon' for a persisted note", () => {
    expect(buildNoteSidebarMenu(false).map((i) => i.id)).toContain(
      'change-icon'
    );
  });

  it("labels 'toggle-favorite' as 'Remove from Favorites' when isFavorite is true", () => {
    expect(
      buildNoteSidebarMenu(false, true).find((i) => i.id === 'toggle-favorite')
        ?.label
    ).toBe('Remove from Favorites');
  });

  it("never includes 'delete' — deletion-UX product decision withdraws it from the sidebar", () => {
    expect(buildNoteSidebarMenu(false).map((i) => i.id)).not.toContain('delete');
    expect(buildNoteSidebarMenu(false, true).map((i) => i.id)).not.toContain('delete');
  });

  it('includes Reveal in Finder and a Copy path submenu (with As Markdown) for a persisted note, before Archive', () => {
    const items = buildNoteSidebarMenu(false);
    const ids = items.map((i) => i.id);

    expect(ids).toContain('reveal-in-finder');
    expect(ids).toContain('copy-path');
    expect(ids.indexOf('copy-path')).toBeLessThan(ids.indexOf('archive'));

    const copyPath = items.find((i) => i.id === 'copy-path');
    expect(copyPath?.submenu?.map((leaf) => leaf.id)).toContain('copy-path-as-markdown');
  });

  it('a draft omits Reveal in Finder / Copy path along with everything else — no Vault entry, no path yet', () => {
    const ids = buildNoteSidebarMenu(true).map((i) => i.id);
    expect(ids).not.toContain('reveal-in-finder');
    expect(ids).not.toContain('copy-path');
  });
});
