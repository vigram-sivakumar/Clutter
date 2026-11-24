import { describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { Folder } from '@core/vault/models/Folder';
import type { FolderOperations } from '@core/application/folder/FolderOperations';

import { createWikiLinkResolver } from './resolveWikiLink';

function vaultWithInbox(): Vault {
  const inbox: Folder = {
    id: 'inbox', path: '/vault/Inbox', name: 'Inbox', parentId: null,
    metadata: {
      defaultTemplateId: null, icon: null, favorite: false, description: '', cover: null,
      coverHidden: false, coverLayout: 'side', coverPositionAbove: 50, coverPositionSide: 50,
      status: 'active', archivedAt: null, originalPath: null, originalParentId: null,
    },
  };
  return new Vault('/vault', [], [inbox], new TagBuilder().build([]), [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('activating an unresolved wiki link whose note cannot be created', () => {
  it('tells the caller, instead of dropping the failure', async () => {
    const boom = new Error('disk full');
    const pageOperations = { create: vi.fn().mockRejectedValue(boom), open: vi.fn() } as unknown as PageOperations;
    const onCreateFailed = vi.fn();
    const resolve = createWikiLinkResolver(vaultWithInbox(), pageOperations, {} as FolderOperations, undefined, {
      onCreateFailed,
    });

    resolve('Meeting notes', null).activate();
    await settle();

    expect(pageOperations.create).toHaveBeenCalledWith({ folderId: 'inbox', title: 'Meeting notes', activate: true });
    expect(onCreateFailed).toHaveBeenCalledWith(boom);
  });

  it('logs the failure when nobody asked to be told', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pageOperations = { create: vi.fn().mockRejectedValue(new Error('boom')), open: vi.fn() } as unknown as PageOperations;
    const resolve = createWikiLinkResolver(vaultWithInbox(), pageOperations, {} as FolderOperations);

    resolve('Meeting notes', null).activate();
    await settle();

    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
