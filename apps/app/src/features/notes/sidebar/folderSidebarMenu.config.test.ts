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

describe('buildFolderSidebarMenu — Sort by', () => {
  const sortMenu = { sort: { key: 'created', direction: 'up' } } as const;

  it('has no Sort by rows without a sort menu', () => {
    expect(buildFolderSidebarMenu('active').some((i) => i.id.startsWith('sort:'))).toBe(false);
  });

  it("lists the collection views' labels under a Sort by title, before Archive", () => {
    const items = buildFolderSidebarMenu('active', false, sortMenu);
    const ids = items.map((i) => i.id);

    expect(items.filter((i) => i.id.startsWith('sort:')).map((i) => i.label)).toEqual([
      'Name',
      'Kind',
      'Created',
      'Last edited',
    ]);
    expect(items.find((i) => i.id === 'sort:name')).toMatchObject({
      groupTitle: 'Sort by',
      separatorBefore: true,
    });
    expect(ids.indexOf('sort:updated')).toBeLessThan(ids.indexOf('archive'));
  });

  it('marks only the active key, with its direction arrow', () => {
    const items = buildFolderSidebarMenu('active', false, sortMenu);

    expect(items.find((i) => i.id === 'sort:created')?.icon).toBe('tick');
    expect(items.find((i) => i.id === 'sort:created')?.trailing).toBeTruthy();
    expect(items.find((i) => i.id === 'sort:name')?.trailing).toBeUndefined();
  });
});

describe('buildFolderSidebarMenu — order and groups', () => {
  it('lists Rename, Change icon, Favorite | Sort by | Reveal, Copy path | Move to, Trash, divided into those groups', () => {
    const items = buildFolderSidebarMenu('active', false, { sort: { key: 'name', direction: 'down' } });

    expect(items.map((i) => i.id)).toEqual([
      'rename',
      'change-icon',
      'toggle-favorite',
      'sort:name',
      'sort:kind',
      'sort:created',
      'sort:updated',
      'reveal-in-finder',
      'copy-path',
      'move-to',
      'archive',
    ]);
    expect(items.filter((i) => i.separatorBefore).map((i) => i.id)).toEqual([
      'sort:name',
      'reveal-in-finder',
      'move-to',
    ]);
  });
});
