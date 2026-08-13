import { describe, expect, it } from 'vitest';
import { buildFolderSidebarMenu } from './folderSidebarMenu.config';

describe('buildFolderSidebarMenu', () => {
  it("includes 'move-to' for an active folder", () => {
    expect(buildFolderSidebarMenu('active').map((i) => i.id)).toContain('move-to');
  });

  it("includes 'move-to' regardless of status (archived is unreachable through this menu)", () => {
    expect(buildFolderSidebarMenu('archived').map((i) => i.id)).toContain('move-to');
  });

  it('never includes duplicate — folders are never duplicable', () => {
    expect(buildFolderSidebarMenu('active').map((i) => i.id)).not.toContain('duplicate');
  });
});
