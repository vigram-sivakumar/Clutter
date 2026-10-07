import { describe, expect, it } from 'vitest';
import { buildTagSidebarMenu } from './tagSidebarMenu.config';

describe('buildTagSidebarMenu', () => {
  it("includes 'change-icon'", () => {
    expect(buildTagSidebarMenu().map((item) => item.id)).toContain('change-icon');
  });

  it("includes 'rename'", () => {
    expect(buildTagSidebarMenu().map((item) => item.id)).toContain('rename');
  });

  it("includes a 'toggle-pin' item with the pin icon, below 'change-icon'", () => {
    const items = buildTagSidebarMenu();
    const ids = items.map((item) => item.id);

    expect(items.find((item) => item.id === 'toggle-pin')).toMatchObject({ label: 'Pin', icon: 'pin' });
    expect(ids.indexOf('toggle-pin')).toBe(ids.indexOf('change-icon') + 1);
  });

  it("the same item reads 'Unpin' for a pinned tag", () => {
    expect(buildTagSidebarMenu(true).find((item) => item.id === 'toggle-pin')?.label).toBe('Unpin');
  });

  it("'rename' appears before 'change-icon'", () => {
    const ids = buildTagSidebarMenu().map((item) => item.id);
    expect(ids.indexOf('rename')).toBeLessThan(ids.indexOf('change-icon'));
  });

  it("ends with a 'delete' item using the trash icon, set apart by a divider above it", () => {
    const items = buildTagSidebarMenu();

    expect(items.at(-1)).toEqual({ id: 'delete', label: 'Delete', icon: 'trash', separatorBefore: true });
  });
});
