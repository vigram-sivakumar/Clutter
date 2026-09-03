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

  it("labels 'toggle-favorite' as 'Add to Favorites' when isFavorite is false (or omitted)", () => {
    expect(
      buildFolderTopBarMenu('active', false).find((i) => i.id === 'toggle-favorite')?.label
    ).toBe('Add to Favorites');
    expect(buildFolderTopBarMenu('active').find((i) => i.id === 'toggle-favorite')?.label).toBe(
      'Add to Favorites'
    );
  });

  it("labels 'toggle-favorite' as 'Remove from Favorites' when isFavorite is true", () => {
    expect(
      buildFolderTopBarMenu('active', true).find((i) => i.id === 'toggle-favorite')?.label
    ).toBe('Remove from Favorites');
  });

  it("omits 'delete' when isDeletable is false (or omitted) — an ordinary workspace folder has no Delete entry point", () => {
    expect(buildFolderTopBarMenu('active').map((i) => i.id)).not.toContain('delete');
    expect(buildFolderTopBarMenu('active', false, false).map((i) => i.id)).not.toContain(
      'delete'
    );
  });

  it("includes 'delete' when isDeletable is true, regardless of status", () => {
    expect(buildFolderTopBarMenu('active', false, true).map((i) => i.id)).toContain('delete');
    expect(buildFolderTopBarMenu('archived', false, true).map((i) => i.id)).toContain('delete');
  });

  it("includes an enabled 'reveal-in-finder' and a Copy path submenu WITHOUT As Markdown", () => {
    const menu = buildFolderTopBarMenu('active');

    expect(menu.find((i) => i.id === 'reveal-in-finder')?.disabled).toBeFalsy();
    const copyPath = menu.find((i) => i.id === 'copy-path');
    expect(copyPath?.disabled).toBeFalsy();
    expect(copyPath?.submenu?.map((leaf) => leaf.id)).toEqual([
      'copy-path-at-vault',
      'copy-path-full-path',
    ]);
  });
});
