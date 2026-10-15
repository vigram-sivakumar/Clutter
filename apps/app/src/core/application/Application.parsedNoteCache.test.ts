import { afterEach, describe, expect, it, vi } from 'vitest';

import { Application } from './Application';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { Vault } from '../vault/models/Vault';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { InMemoryParsedNoteCacheBackend } from '../vault/testing/InMemoryParsedNoteCacheBackend';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { browserCoverImageUrlResolver } from '../vault/providers/BrowserCoverImageUrlResolver';
import { ParsedNoteCache } from '../vault/persistence/parsedNoteCache';
import { VaultScanner } from '../vault/ingest';

// Same Platform boundary mock as the other Application tests.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

const ROOT = '/vault';

afterEach(() => vi.restoreAllMocks());

/** A cache that has just scanned a small space, as bootstrap() leaves it. */
async function scannedCache(backend: InMemoryParsedNoteCacheBackend) {
  const fileSystem = new InMemoryVaultFileSystem({
    [`${ROOT}/A/note.md`]: '# Note\n\n- [ ] task\n',
  });
  await fileSystem.createDirectory(ROOT);
  await fileSystem.createDirectory(`${ROOT}/A`);
  const cache = await ParsedNoteCache.load(backend, ROOT);
  await new VaultScanner(fileSystem, cache).scan(ROOT);
  return cache;
}

function makeApplication(cache?: ParsedNoteCache) {
  const fileSystem = new InMemoryVaultFileSystem();
  const vault = new Vault(
    ROOT,
    [],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  const application = new Application(
    vault,
    fileSystem,
    new SelfWriteRegistry(),
    browserCoverImageUrlResolver,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    cache
  );
  application.attachVault(
    vault,
    new PageCreator(new UuidGenerator(), new PageFactory()),
    new DailyNoteService()
  );
  return { application, fileSystem };
}

describe('Application and the parsed-note cache', () => {
  it('persists the cache on request, through the backend only — never through the vault filesystem', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    const { application, fileSystem } = makeApplication(
      await scannedCache(backend)
    );
    const vaultWrites = vi.spyOn(fileSystem, 'writeFile');

    await application.persistParsedNoteCache();

    expect(backend.writes).toHaveLength(1);
    expect(vaultWrites).not.toHaveBeenCalled();
    expect(await fileSystem.exists(`${ROOT}/.clutter`)).toBe(false);
  });

  it('does nothing without a cache (the default for every other construction site)', async () => {
    const { application } = makeApplication();
    await expect(application.persistParsedNoteCache()).resolves.toBeUndefined();
  });

  it('never throws when the write fails, and says so', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    backend.writeFailure = new Error('disk full');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { application } = makeApplication(await scannedCache(backend));

    await expect(application.persistParsedNoteCache()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      '[parsed-note-cache] not written:',
      expect.objectContaining({ writeStatus: 'failed' })
    );
  });

  it('close() cancels a write that has not started and never waits on the cache', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    const cache = await scannedCache(backend);
    const slow = vi
      .spyOn(backend, 'write')
      .mockImplementation(() => new Promise(() => {})); // would hang forever
    const { application } = makeApplication(cache);

    await application.close(); // must resolve without touching the backend
    await application.persistParsedNoteCache();

    expect(slow).not.toHaveBeenCalled();
    expect(cache.report().writeStatus).not.toBe('written');
  });

  it('a write already in flight is not waited for by close()', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    const cache = await scannedCache(backend);
    vi.spyOn(backend, 'write').mockImplementation(() => new Promise(() => {}));
    const { application } = makeApplication(cache);

    void application.persistParsedNoteCache(); // starts; never completes
    await Promise.resolve();
    await expect(application.close()).resolves.toBeUndefined();
  });

  it('deleting the cache changes nothing about the vault or its notes', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    const cache = await scannedCache(backend);
    const { application, fileSystem } = makeApplication(cache);
    await application.persistParsedNoteCache();
    const before = JSON.stringify([...application.vault.pages()]);

    await backend.remove(ROOT);

    expect(backend.files.has(ROOT)).toBe(false);
    expect(JSON.stringify([...application.vault.pages()])).toBe(before);
    expect(await fileSystem.exists(`${ROOT}/.clutter`)).toBe(false);
  });
});
