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

  it('never includes toggle-favorite — Daily Notes do not support favoriting', () => {
    expect(buildDailyNoteSidebarMenu(false).map((i) => i.id)).not.toContain('toggle-favorite');
    expect(buildDailyNoteSidebarMenu(true).map((i) => i.id)).not.toContain('toggle-favorite');
  });
});
