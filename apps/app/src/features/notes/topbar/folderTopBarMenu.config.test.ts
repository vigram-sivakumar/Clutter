import { describe, expect, it } from 'vitest';
import { buildFolderTopBarMenu } from './folderTopBarMenu.config';

describe('buildFolderTopBarMenu', () => {
  it("includes 'archive', not 'restore', for an active folder", () => {
    const menu = buildFolderTopBarMenu('active');
    const ids = menu.map((item) => item.id);

    expect(ids).toContain('archive');
    expect(ids).not.toContain('restore');
  });

  it("includes 'restore', not 'archive', for an archived folder", () => {
    const menu = buildFolderTopBarMenu('archived');
    const ids = menu.map((item) => item.id);

    expect(ids).toContain('restore');
    expect(ids).not.toContain('archive');
  });

  it("includes an enabled 'move-to' for an active folder", () => {
    const menu = buildFolderTopBarMenu('active');

    expect(menu.find((i) => i.id === 'move-to')?.disabled).toBeFalsy();
  });

  it("disables (never omits) 'move-to' for an archived folder", () => {
    const menu = buildFolderTopBarMenu('archived');
    const ids = menu.map((item) => item.id);

    expect(ids).toContain('move-to');
    expect(menu.find((i) => i.id === 'move-to')?.disabled).toBe(true);
  });

  it('never includes a duplicate item — folders are never duplicable', () => {
    expect(buildFolderTopBarMenu('active').map((i) => i.id)).not.toContain('duplicate');
  });
});
