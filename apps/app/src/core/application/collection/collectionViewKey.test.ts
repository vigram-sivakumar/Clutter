import { describe, expect, it } from 'vitest';

import {
  collectionViewKeyForFolder,
  collectionViewKeyForFilteredView,
  collectionViewKeyForTag,
  deriveCollectionViewKey,
} from './collectionViewKey';
import type { ActiveView } from '../../workspace/Workspace';

describe('deriveCollectionViewKey', () => {
  it('a real folder (including Archive, a real reserved Folder) derives folder:<id>', () => {
    const activeView: ActiveView = { type: 'folder', id: 'folder-123' };
    expect(deriveCollectionViewKey(activeView)).toBe('folder:folder-123');
    expect(deriveCollectionViewKey(activeView)).toBe(collectionViewKeyForFolder('folder-123'));
  });

  it('Workspace-root derives view:workspace', () => {
    const activeView: ActiveView = { type: 'filtered-view', view: { kind: 'workspace' } };
    expect(deriveCollectionViewKey(activeView)).toBe('view:workspace');
    expect(deriveCollectionViewKey(activeView)).toBe(collectionViewKeyForFilteredView('workspace'));
  });

  it('Favorites derives view:favorites', () => {
    const activeView: ActiveView = { type: 'filtered-view', view: { kind: 'favorites' } };
    expect(deriveCollectionViewKey(activeView)).toBe('view:favorites');
    expect(deriveCollectionViewKey(activeView)).toBe(collectionViewKeyForFilteredView('favorites'));
  });

  it('a tag derives tag:<tagName>', () => {
    const activeView: ActiveView = {
      type: 'filtered-view',
      view: { kind: 'tag', tagName: 'project' },
    };
    expect(deriveCollectionViewKey(activeView)).toBe('tag:project');
    expect(deriveCollectionViewKey(activeView)).toBe(collectionViewKeyForTag('project'));
  });

  it('a page has no collection identity — undefined', () => {
    const activeView: ActiveView = { type: 'page', id: 'page-1' };
    expect(deriveCollectionViewKey(activeView)).toBeUndefined();
  });

  it('null activeView (boot, or nothing active yet) — undefined', () => {
    expect(deriveCollectionViewKey(null)).toBeUndefined();
  });

  it('out-of-scope filtered views (tasks-*, assets) — undefined, since they render TasksCollectionBody/AssetsCollectionBody, never CollectionViewMenu', () => {
    const kinds: ActiveView[] = [
      { type: 'filtered-view', view: { kind: 'tasks-today' } },
      { type: 'filtered-view', view: { kind: 'tasks-upcoming' } },
      { type: 'filtered-view', view: { kind: 'tasks-completed' } },
      { type: 'filtered-view', view: { kind: 'tasks-all' } },
      { type: 'filtered-view', view: { kind: 'tasks-unscheduled' } },
      { type: 'filtered-view', view: { kind: 'assets' } },
    ];

    for (const activeView of kinds) {
      expect(deriveCollectionViewKey(activeView)).toBeUndefined();
    }
  });

  it('folder, workspace, favorites, and tag identities never collide with each other, even with adversarial ids/names', () => {
    const keys = new Set<string>([
      deriveCollectionViewKey({ type: 'folder', id: 'workspace' })!,
      deriveCollectionViewKey({ type: 'folder', id: 'favorites' })!,
      deriveCollectionViewKey({ type: 'folder', id: 'tag:project' })!,
      deriveCollectionViewKey({ type: 'filtered-view', view: { kind: 'workspace' } })!,
      deriveCollectionViewKey({ type: 'filtered-view', view: { kind: 'favorites' } })!,
      deriveCollectionViewKey({
        type: 'filtered-view',
        view: { kind: 'tag', tagName: 'workspace' },
      })!,
      deriveCollectionViewKey({
        type: 'filtered-view',
        view: { kind: 'tag', tagName: 'favorites' },
      })!,
    ]);

    // Every one of the seven adversarially-chosen identities above must
    // remain distinct — the folder:/view:/tag: prefixes are what make
    // this true even though the raw ids/names deliberately overlap.
    expect(keys.size).toBe(7);
  });

  it('Archive is identified exactly like any other real folder — folder:<archive.id> — no special-casing', () => {
    const archiveFolderId = 'Archive';
    const activeView: ActiveView = { type: 'folder', id: archiveFolderId };
    expect(deriveCollectionViewKey(activeView)).toBe(`folder:${archiveFolderId}`);
  });
});
