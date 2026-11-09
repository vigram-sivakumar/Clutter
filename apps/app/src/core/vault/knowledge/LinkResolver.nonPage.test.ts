import { describe, expect, it } from 'vitest';

import type { Page } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import type { VaultResource } from '@core/vault/models/VaultResource';

import { LinkResolver } from './LinkResolver';
import { PageIndex } from './PageIndex';
import { LINKABLE_SYSTEM_FOLDERS, resolveNonPageLinkTarget, type NonPageLinkTargetSource } from './nonPageLinkTarget';

const ROOT = '/vault';

const page = (path: string, aliases: string[] = []): Page =>
  ({ id: `page:${path}`, path: `${ROOT}/${path}.md`, name: path, analysis: { aliases: aliases.map((value) => ({ value })), headings: [], blockReferences: [] } }) as unknown as Page;

const folder = (path: string): Folder => ({ id: `folder:${path}`, path: `${ROOT}/${path}`, name: path.split('/').pop()! }) as Folder;

const resource = (path: string): VaultResource => ({ id: `resource:${path}`, kind: 'image', name: path.split('/').pop()!, path: `${ROOT}/${path}`, parentId: null });

function sourceOf(folders: Folder[], resources: VaultResource[]): NonPageLinkTargetSource {
  return {
    root: ROOT,
    getFolderByPath: (path) => folders.find((candidate) => candidate.path === path),
    getResourceByPath: (path) => resources.find((candidate) => candidate.path === path),
  };
}

const link = (target: string, extra: { heading?: string } = {}) => ({ sourcePageId: 'src', target, ...extra });

describe('LinkResolver — folder and asset links are not missing', () => {
  const pages = [page('Notes'), page('Alias holder', ['Shared'])];
  const index = new PageIndex(pages, ROOT);
  const source = sourceOf([folder('Projects'), folder('Notes'), folder('Shared')], [resource('Assets/hero.png')]);
  const resolve = (target: string) => new LinkResolver().resolve([link(target)], index, source)[0]!;

  it('an explicit folder link and an asset link are `non-page`, with no target page', () => {
    expect(resolve('Projects/')).toMatchObject({ status: 'non-page' });
    expect(resolve('Projects/').targetPageId).toBeUndefined();
    expect(resolve('Assets/hero.png')).toMatchObject({ status: 'non-page' });
  });

  it('a bare name that no note or alias claims, but a folder has, is `non-page`', () => {
    expect(resolve('Projects')).toMatchObject({ status: 'non-page' });
  });

  it('a note wins a shared name, and an alias wins over a folder of the same name', () => {
    expect(resolve('Notes')).toMatchObject({ status: 'resolved', targetPageId: 'page:Notes' });
    expect(resolve('Shared')).toMatchObject({ status: 'resolved', targetPageId: 'page:Alias holder' });
  });

  it('a target nothing matches is still missing; a #heading on a folder is missing too', () => {
    expect(resolve('Nowhere/')).toMatchObject({ status: 'missing' });
    expect(resolve('Missing.png')).toMatchObject({ status: 'missing' });
    expect(new LinkResolver().resolve([link('Projects', { heading: 'x' })], index, source)[0]).toMatchObject({ status: 'missing' });
  });

  it('without a lookup (an embed’s resolution passes none) nothing changes: these stay missing', () => {
    const withoutLookup = (target: string) => new LinkResolver().resolve([link(target)], index)[0]!;

    expect(withoutLookup('Projects/')).toMatchObject({ status: 'missing' });
    expect(withoutLookup('Assets/hero.png')).toMatchObject({ status: 'missing' });
  });
});

describe('resolveNonPageLinkTarget', () => {
  const source = sourceOf([folder('Projects'), folder('Projects/Work')], [resource('Assets/hero.png')]);

  it('reads a trailing slash as folder-only, and an extension-included path as an asset', () => {
    expect(resolveNonPageLinkTarget(source, 'Projects/Work/')).toMatchObject({ kind: 'folder' });
    expect(resolveNonPageLinkTarget(source, 'Projects/')).toMatchObject({ kind: 'folder' });
    expect(resolveNonPageLinkTarget(source, 'Assets/hero.png/')).toBeUndefined();
    expect(resolveNonPageLinkTarget(source, 'Assets/hero.png')).toMatchObject({ kind: 'asset' });
    expect(resolveNonPageLinkTarget(source, '/')).toBeUndefined();
  });
});

describe('the four system folders (Inbox, Templates, Archive, Assets) with no directory on disk', () => {
  const index = new PageIndex([page('Notes')], ROOT);
  const empty = sourceOf([], []);
  const resolve = (target: string) => new LinkResolver().resolve([link(target)], index, empty)[0]!;

  it.each(['Inbox', 'Templates', 'Archive', 'Assets'])('%s resolves, as `non-page`: never missing, no target page, so no graph edge', (name) => {
    for (const target of [`${name}/`, name]) {
      const resolved = resolve(target);
      expect(resolved).toMatchObject({ status: 'non-page' });
      expect(resolved.targetPageId).toBeUndefined();
    }
  });

  it('Daily Notes, .clutter and nested look-alikes stay missing', () => {
    for (const target of ['Daily Notes/', 'Daily Notes', '.clutter/', '.clutter', 'Projects/Inbox/', 'inbox/', 'Inbox/x']) {
      expect(resolve(target)).toMatchObject({ status: 'missing' });
    }
  });

  it('a note named Inbox wins the bare link; the trailing slash still means the folder', () => {
    const withNote = new PageIndex([page('Inbox')], ROOT);
    expect(new LinkResolver().resolve([link('Inbox')], withNote, empty)[0]).toMatchObject({ status: 'resolved', targetPageId: 'page:Inbox' });
    expect(new LinkResolver().resolve([link('Inbox/')], withNote, empty)[0]).toMatchObject({ status: 'non-page' });
  });

  it('an embed’s resolution passes no lookup, so these stay missing there', () => {
    expect(new LinkResolver().resolve([link('Inbox/')], index)[0]).toMatchObject({ status: 'missing' });
  });

  it('an existing folder is used as it is, ahead of the name-only fallback', () => {
    const inbox = folder('Inbox');
    expect(resolveNonPageLinkTarget(sourceOf([inbox], []), 'Inbox/')).toEqual({ kind: 'folder', folder: inbox });
    expect(resolveNonPageLinkTarget(empty, 'Inbox/')).toEqual({ kind: 'system-folder', id: 'inbox', name: 'Inbox' });
  });

  it('is an explicit allowlist of exactly four, tied to the definitions it stands for', () => {
    expect(LINKABLE_SYSTEM_FOLDERS.map((entry) => entry.name)).toEqual(['Inbox', 'Templates', 'Archive', 'Assets']);
  });
});
