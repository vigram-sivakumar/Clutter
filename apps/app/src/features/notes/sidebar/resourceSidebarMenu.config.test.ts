import { describe, expect, it } from 'vitest';
import { buildResourceSidebarMenu } from './resourceSidebarMenu.config';

describe('buildResourceSidebarMenu', () => {
  it('returns Rename/Move to/Reveal in Finder/Copy path/Download/Archive for an image, with Archive last', () => {
    expect(buildResourceSidebarMenu('image').map((item) => item.id)).toEqual([
      'rename',
      'move-to',
      'reveal-in-finder',
      'copy-path',
      'download',
      'archive',
    ]);
  });

  it('returns Rename/Move to/Reveal in Finder/Copy path/Archive for a pdf — no Download', () => {
    expect(buildResourceSidebarMenu('pdf').map((item) => item.id)).toEqual([
      'rename',
      'move-to',
      'reveal-in-finder',
      'copy-path',
      'archive',
    ]);
  });

  it('Copy path opens a submenu of From vault / Full path / As Markdown, in that order', () => {
    const items = buildResourceSidebarMenu('image');
    const copyPath = items.find((item) => item.id === 'copy-path');

    expect(copyPath?.submenu?.map((leaf) => leaf.id)).toEqual([
      'copy-path-at-vault',
      'copy-path-full-path',
      'copy-path-as-markdown',
    ]);
    expect(copyPath?.submenu?.map((leaf) => leaf.label)).toEqual([
      'From vault',
      'Full path',
      'As Markdown',
    ]);
  });

  describe('one menu, adapted to the asset\'s source', () => {
    const ids = (items: ReturnType<typeof buildResourceSidebarMenu>) => items.map((item) => item.id);

    it('a vault image keeps its menu, with Set as cover image just above Archive and Rename optional', () => {
      expect(ids(buildResourceSidebarMenu('image', 'local', { setAsCoverImage: 'enabled', rename: false }))).toEqual([
        'move-to',
        'reveal-in-finder',
        'copy-path',
        'download',
        'set-as-cover-image',
        'archive',
      ]);
      expect(ids(buildResourceSidebarMenu('image', 'local'))).toEqual(ids(buildResourceSidebarMenu('image')));
    });

    it('a remote image gets the same menu in the same order, each file action replaced by its URL counterpart', () => {
      expect(buildResourceSidebarMenu('image', 'remote').map((item) => [item.id, item.label])).toEqual([
        ['save-to-vault', 'Save to vault'],
        ['open-in-browser', 'Open in browser'],
        ['copy-link', 'Copy link'],
        ['download', 'Download'],
      ]);
    });

    it('lists Set as cover image last for a remote image, unavailable when asked', () => {
      const items = buildResourceSidebarMenu('image', 'remote', { setAsCoverImage: 'disabled' });
      const last = items[items.length - 1]!;

      expect(last).toMatchObject({ id: 'set-as-cover-image', label: 'Set as cover image', disabled: true });
      expect(buildResourceSidebarMenu('image', 'remote', { setAsCoverImage: 'enabled' }).pop()?.disabled).toBe(false);
    });

    it('a remote asset has nothing to rename, move, reveal or archive', () => {
      for (const absent of ['rename', 'move-to', 'reveal-in-finder', 'copy-path', 'archive']) {
        expect(ids(buildResourceSidebarMenu('image', 'remote', { setAsCoverImage: 'enabled' }))).not.toContain(absent);
      }
    });
  });
});
