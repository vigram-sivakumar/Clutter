import { describe, expect, it } from 'vitest';
import { buildFolderSidebarMenu } from './folderSidebarMenu.config';

describe('buildFolderSidebarMenu', () => {
  it("includes 'move-to' for an active folder", () => {
    expect(buildFolderSidebarMenu('active').map((i) => i.id)).toContain(
      'move-to'
    );
  });

  it("includes 'move-to' regardless of status (archived is unreachable through this menu)", () => {
    expect(buildFolderSidebarMenu('archived').map((i) => i.id)).toContain(
      'move-to'
    );
  });

  it('never includes duplicate — folders are never duplicable', () => {
    expect(buildFolderSidebarMenu('active').map((i) => i.id)).not.toContain(
      'duplicate'
    );
  });

  it("includes 'change-icon' for an active folder", () => {
    expect(buildFolderSidebarMenu('active').map((i) => i.id)).toContain(
      'change-icon'
    );
  });

  it("labels 'toggle-favorite' as 'Add to Favorites' when isFavorite is false (or omitted)", () => {
    expect(
      buildFolderSidebarMenu('active', false).find(
        (i) => i.id === 'toggle-favorite'
      )?.label
    ).toBe('Add to Favorites');
    expect(
      buildFolderSidebarMenu('active').find((i) => i.id === 'toggle-favorite')
        ?.label
    ).toBe('Add to Favorites');
  });

  it("labels 'toggle-favorite' as 'Remove from Favorites' when isFavorite is true", () => {
    expect(
      buildFolderSidebarMenu('active', true).find(
        (i) => i.id === 'toggle-favorite'
      )?.label
    ).toBe('Remove from Favorites');
  });

  it("never includes 'delete' — deletion-UX product decision withdraws it from the sidebar", () => {
    expect(buildFolderSidebarMenu('active').map((i) => i.id)).not.toContain('delete');
    expect(buildFolderSidebarMenu('archived').map((i) => i.id)).not.toContain('delete');
  });

  it('includes Reveal in Finder and a Copy path submenu WITHOUT As Markdown — no folder-linking syntax exists', () => {
    const items = buildFolderSidebarMenu('active');
    const ids = items.map((i) => i.id);

    expect(ids).toContain('reveal-in-finder');
    expect(ids).toContain('copy-path');

    const copyPath = items.find((i) => i.id === 'copy-path');
    expect(copyPath?.submenu?.map((leaf) => leaf.id)).toEqual([
      'copy-path-at-vault',
      'copy-path-full-path',
    ]);
  });

  it('Copy path/Reveal in Finder come before the conditional Archive item', () => {
    const ids = buildFolderSidebarMenu('active').map((i) => i.id);
    expect(ids.indexOf('copy-path')).toBeLessThan(ids.indexOf('archive'));
  });
});
