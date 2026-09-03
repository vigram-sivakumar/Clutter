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

  it("includes 'archive' for a persisted daily note", () => {
    const ids = buildDailyNoteSidebarMenu(false).map((i) => i.id);
    expect(ids).toContain('archive');
  });

  it("never includes 'delete' — deletion-UX product decision withdraws it from the sidebar", () => {
    expect(buildDailyNoteSidebarMenu(false).map((i) => i.id)).not.toContain('delete');
  });

  it('never includes toggle-favorite — Daily Notes do not support favoriting', () => {
    expect(buildDailyNoteSidebarMenu(false).map((i) => i.id)).not.toContain('toggle-favorite');
    expect(buildDailyNoteSidebarMenu(true).map((i) => i.id)).not.toContain('toggle-favorite');
  });

  it('includes Reveal in Finder and a Copy path submenu (with As Markdown) for a persisted daily note, before Archive', () => {
    const items = buildDailyNoteSidebarMenu(false);
    const ids = items.map((i) => i.id);

    expect(ids).toContain('reveal-in-finder');
    expect(ids).toContain('copy-path');
    expect(ids.indexOf('copy-path')).toBeLessThan(ids.indexOf('archive'));

    const copyPath = items.find((i) => i.id === 'copy-path');
    expect(copyPath?.submenu?.map((leaf) => leaf.id)).toContain('copy-path-as-markdown');
  });

  it('a draft omits Reveal in Finder / Copy path along with everything else', () => {
    const ids = buildDailyNoteSidebarMenu(true).map((i) => i.id);
    expect(ids).not.toContain('reveal-in-finder');
    expect(ids).not.toContain('copy-path');
  });
});
