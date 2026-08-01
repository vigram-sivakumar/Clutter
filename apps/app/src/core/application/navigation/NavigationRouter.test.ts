import { describe, expect, it, vi } from 'vitest';
import type { Folder } from '../../vault/models/Folder';
import { NavigationRouter } from './NavigationRouter';
import type { FolderOperations } from '../folder/FolderOperations';
import type { Vault } from '../../vault/models/Vault';

function createNavigationRouter(options: {
  folderOperations?: Pick<FolderOperations, 'open'>;
  vault?: Pick<Vault, 'getReservedFolder'>;
}): NavigationRouter {
  return new NavigationRouter(
    options.folderOperations as FolderOperations,
    options.vault as Vault
  );
}

describe('NavigationRouter', () => {
  it('openArchive resolves the archive reserved folder and opens it', () => {
    const openFolder = vi.fn();
    const getReservedFolder = vi.fn((id: string) =>
      id === 'archive' ? ({ id: 'folder-archive' } as Folder) : undefined
    );
    const navigation = createNavigationRouter({
      folderOperations: { open: openFolder },
      vault: { getReservedFolder },
    });

    navigation.openArchive();

    expect(getReservedFolder).toHaveBeenCalledWith('archive');
    expect(openFolder).toHaveBeenCalledWith('folder-archive');
  });

  it('openArchive throws when the archive reserved folder is missing', () => {
    const navigation = createNavigationRouter({
      folderOperations: { open: vi.fn() },
      vault: { getReservedFolder: vi.fn(() => undefined) },
    });

    expect(() => navigation.openArchive()).toThrow(
      /Reserved archive folder not found in vault/
    );
  });

  it('openInbox resolves the inbox reserved folder and opens it', () => {
    const openFolder = vi.fn();
    const getReservedFolder = vi.fn((id: string) =>
      id === 'inbox' ? ({ id: 'folder-inbox' } as Folder) : undefined
    );
    const navigation = createNavigationRouter({
      folderOperations: { open: openFolder },
      vault: { getReservedFolder },
    });

    navigation.openInbox();

    expect(getReservedFolder).toHaveBeenCalledWith('inbox');
    expect(openFolder).toHaveBeenCalledWith('folder-inbox');
  });

  it('openInbox throws when the inbox reserved folder is missing', () => {
    const navigation = createNavigationRouter({
      folderOperations: { open: vi.fn() },
      vault: { getReservedFolder: vi.fn(() => undefined) },
    });

    expect(() => navigation.openInbox()).toThrow(
      /Reserved inbox folder not found in vault/
    );
  });

  it('openTemplates resolves the templates reserved folder and opens it', () => {
    const openFolder = vi.fn();
    const getReservedFolder = vi.fn((id: string) =>
      id === 'templates' ? ({ id: 'folder-templates' } as Folder) : undefined
    );
    const navigation = createNavigationRouter({
      folderOperations: { open: openFolder },
      vault: { getReservedFolder },
    });

    navigation.openTemplates();

    expect(getReservedFolder).toHaveBeenCalledWith('templates');
    expect(openFolder).toHaveBeenCalledWith('folder-templates');
  });

  it('openFavorites throws until implemented', () => {
    const navigation = createNavigationRouter({
      folderOperations: { open: vi.fn() },
      vault: { getReservedFolder: vi.fn() },
    });

    expect(() => navigation.openFavorites()).toThrow(
      /NavigationRouter\.openFavorites\(\) is not implemented/
    );
  });
});
