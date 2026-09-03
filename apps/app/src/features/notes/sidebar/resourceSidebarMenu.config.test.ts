import { describe, expect, it } from 'vitest';
import { buildResourceSidebarMenu } from './resourceSidebarMenu.config';

describe('buildResourceSidebarMenu', () => {
  it('returns Rename/Move to/Reveal in Finder/Copy path/Archive, with Archive last', () => {
    expect(buildResourceSidebarMenu().map((item) => item.id)).toEqual([
      'rename',
      'move-to',
      'reveal-in-finder',
      'copy-path',
      'archive',
    ]);
  });

  it('Copy path opens a submenu of From vault / Full path / As Markdown, in that order', () => {
    const items = buildResourceSidebarMenu();
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
});
