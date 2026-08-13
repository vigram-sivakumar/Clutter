import { describe, expect, it } from 'vitest';
import { buildNoteSidebarMenu } from './noteSidebarMenu.config';

describe('buildNoteSidebarMenu', () => {
  it("includes 'move-to' for a persisted note", () => {
    expect(buildNoteSidebarMenu(false).map((i) => i.id)).toContain('move-to');
  });

  it('returns no items at all for a draft (move-to included in that omission)', () => {
    expect(buildNoteSidebarMenu(true)).toEqual([]);
  });
});
