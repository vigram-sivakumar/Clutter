import { describe, expect, it } from 'vitest';

import { Application } from '@core/application/Application';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';

/**
 * A backslash hard break (the editor's Shift+Enter) is ordinary body text: it is saved byte for byte,
 * and survives switching notes and reading the note back. No serializer step rewrites it.
 */
function makeApplication(): Application {
  const vault = new Vault('/vault', [], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder(), new Map(), []);
  const application = new Application(vault, new InMemoryVaultFileSystem(), new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return application;
}

describe('a backslash hard break in a note body', () => {
  const body = 'First line\\\nSecond line\n\n- item\\\n  more\n\n> quote\\\n> more';

  it('is saved verbatim, and still there after switching to another note and back', async () => {
    const application = makeApplication();
    const first = await application.pageOperations.openDraft({ folderId: null, title: 'First' });
    application.pageOperations.commitEdit(first, body);
    await application.pageOperations.requestSave(first);

    const second = await application.pageOperations.openDraft({ folderId: null, title: 'Second' });
    application.pageOperations.commitEdit(second, 'other');
    await application.pageOperations.requestSave(second);
    await application.pageOperations.open(first);

    expect(application.vault.getPage(first)!.source.markdown).toBe(body);
    expect(application.pageOperations.getSession(first)!.currentRevision.markdown).toBe(body);
  });
});
