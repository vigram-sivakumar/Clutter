import { describe, expect, it, vi } from 'vitest';
import type { Folder } from '../../vault/models/Folder';
import { NavigationService } from './NavigationService';
import type { FolderApplicationService } from '../folder/FolderApplicationService';
import type { PageApplicationService } from '../page/PageApplicationService';
import type { Vault } from '../../vault/models/Vault';

function createNavigationService(options: {
  pageService?: Pick<PageApplicationService, 'openPage'>;
  folderService?: Pick<FolderApplicationService, 'openFolder'>;
  vault?: Pick<Vault, 'getReservedFolder'>;
}): NavigationService {
  return new NavigationService(
    options.pageService as PageApplicationService,
    options.folderService as FolderApplicationService,
    options.vault as Vault
  );
}

describe('NavigationService', () => {
  it('openNote delegates to pageService.openPage', () => {
    const openPage = vi.fn();
    const navigation = createNavigationService({
      pageService: { openPage },
      folderService: { openFolder: vi.fn() },
      vault: { getReservedFolder: vi.fn() },
    });

    navigation.openNote('page-1');

    expect(openPage).toHaveBeenCalledWith('page-1');
  });

  it('openDailyNote delegates to pageService.openPage', () => {
    const openPage = vi.fn();
    const navigation = createNavigationService({
      pageService: { openPage },
      folderService: { openFolder: vi.fn() },
      vault: { getReservedFolder: vi.fn() },
    });

    navigation.openDailyNote('daily-1');

    expect(openPage).toHaveBeenCalledWith('daily-1');
  });

  it('openFolder delegates to folderService.openFolder', () => {
    const openFolder = vi.fn();
    const navigation = createNavigationService({
      pageService: { openPage: vi.fn() },
      folderService: { openFolder },
      vault: { getReservedFolder: vi.fn() },
    });

    navigation.openFolder('folder-1');

    expect(openFolder).toHaveBeenCalledWith('folder-1');
  });

  it('openArchive resolves the archive reserved folder and opens it', () => {
    const openFolder = vi.fn();
    const getReservedFolder = vi.fn((id: string) =>
      id === 'archive' ? ({ id: 'folder-archive' } as Folder) : undefined
    );
    const navigation = createNavigationService({
      pageService: { openPage: vi.fn() },
      folderService: { openFolder },
      vault: { getReservedFolder },
    });

    navigation.openArchive();

    expect(getReservedFolder).toHaveBeenCalledWith('archive');
    expect(openFolder).toHaveBeenCalledWith('folder-archive');
  });

  it('openArchive throws when the archive reserved folder is missing', () => {
    const navigation = createNavigationService({
      pageService: { openPage: vi.fn() },
      folderService: { openFolder: vi.fn() },
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
    const navigation = createNavigationService({
      pageService: { openPage: vi.fn() },
      folderService: { openFolder },
      vault: { getReservedFolder },
    });

    navigation.openInbox();

    expect(getReservedFolder).toHaveBeenCalledWith('inbox');
    expect(openFolder).toHaveBeenCalledWith('folder-inbox');
  });

  it('openInbox throws when the inbox reserved folder is missing', () => {
    const navigation = createNavigationService({
      pageService: { openPage: vi.fn() },
      folderService: { openFolder: vi.fn() },
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
    const navigation = createNavigationService({
      pageService: { openPage: vi.fn() },
      folderService: { openFolder },
      vault: { getReservedFolder },
    });

    navigation.openTemplates();

    expect(getReservedFolder).toHaveBeenCalledWith('templates');
    expect(openFolder).toHaveBeenCalledWith('folder-templates');
  });

  it('openFavorites throws until implemented', () => {
    const navigation = createNavigationService({
      pageService: { openPage: vi.fn() },
      folderService: { openFolder: vi.fn() },
      vault: { getReservedFolder: vi.fn() },
    });

    expect(() => navigation.openFavorites()).toThrow(
      /NavigationService\.openFavorites\(\) is not implemented/
    );
  });
});
