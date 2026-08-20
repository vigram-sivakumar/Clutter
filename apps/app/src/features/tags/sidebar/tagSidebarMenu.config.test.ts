import { describe, expect, it } from 'vitest';
import { buildTagSidebarMenu } from './tagSidebarMenu.config';

describe('buildTagSidebarMenu', () => {
  it("includes 'change-icon'", () => {
    expect(buildTagSidebarMenu().map((item) => item.id)).toContain('change-icon');
  });

  it("includes 'rename'", () => {
    expect(buildTagSidebarMenu().map((item) => item.id)).toContain('rename');
  });

  it("'rename' appears before 'change-icon'", () => {
    const ids = buildTagSidebarMenu().map((item) => item.id);
    expect(ids.indexOf('rename')).toBeLessThan(ids.indexOf('change-icon'));
  });
});
