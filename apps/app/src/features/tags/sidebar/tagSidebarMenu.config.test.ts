import { describe, expect, it } from 'vitest';
import { buildTagSidebarMenu } from './tagSidebarMenu.config';

describe('buildTagSidebarMenu', () => {
  it("includes 'change-icon'", () => {
    expect(buildTagSidebarMenu().map((item) => item.id)).toContain('change-icon');
  });
});
