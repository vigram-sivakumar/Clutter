import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

import { Application } from './Application';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { Vault } from '../vault/models/Vault';
import type { Page } from '../vault/models/Page';
import type { TagMetadataEntry } from '../vault/models/Tag';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '../vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../vault/ingest/FrontmatterSerializer';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { PageBuilder } from '../vault/ingest/PageBuilder';
import { TagExtractor } from '../vault/ingest/extractors/TagExtractor';
import { serializeTagMetadataFile } from '../vault/persistence/tagMetadataFile';
import { TagMetadataStore } from '../vault/persistence/TagMetadataStore';
import { DocumentTransaction } from '../engine/DocumentTransaction';

const ROOT = '/vault';
const TAGS_FILE = `${ROOT}/.clutter/tags.json`;
const emptyAnalysis = { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] };

/** A note whose body uses the given tags (`#name`), through the same extractor the parser uses. */
function note(id: string, body: string): Page {
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path: `${ROOT}/${id}.md`,
      directoryPath: ROOT,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: body,
      analysis: { ...emptyAnalysis, tags: new TagExtractor().extract(body) },
    },
  } as never);
}

/**
 * One Space: its notes, and the tags it has *declared* in `.clutter/tags.json` (which is what makes a tag exist with
 * nothing using it). `enabled` is the Space's own saved setting.
 */
async function openSpace(options: { pages: Page[]; declared: Record<string, TagMetadataEntry>; enabled?: boolean }) {
  const declared = new Map(Object.entries(options.declared));
  const fileSystem = new InMemoryVaultFileSystem();
  const serializer = new FrontmatterSerializer();
  for (const page of options.pages) {
    fileSystem.seedFile(page.path, serializer.serializeDocument(page, page.source.markdown));
  }
  fileSystem.seedFile(TAGS_FILE, serializeTagMetadataFile(declared));

  const vault = new Vault(
    ROOT,
    options.pages,
    [],
    new TagBuilder().build(options.pages, declared),
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  // What the Vault's own build does from the scan: its tag index knows the declared definitions, so a page changing
  // later keeps them.
  vault.setTagMetadata(declared);
  const application = new Application(
    vault,
    fileSystem,
    new SelfWriteRegistry(),
    // Everything else is the constructor's own default; only the tag definitions are read from this Space's folder.
    ...([undefined, undefined, undefined, undefined, undefined, undefined, new TagMetadataStore(fileSystem, ROOT)] as const)
  );
  Reflect.set(application, 'rootPath', ROOT);
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  if (options.enabled) await application.spaceProfileStore.setAutoDeleteUnusedTags(true);

  const definitions = async (): Promise<string[]> =>
    Object.keys(JSON.parse(await fileSystem.readFile(TAGS_FILE)).tags ?? {}).sort();

  return { application, vault, fileSystem, definitions };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the Space setting', () => {
  it('is off by default, and then nothing is ever removed', async () => {
    const { application, definitions } = await openSpace({ pages: [], declared: { lonely: {} } });

    expect(application.autoDeleteUnusedTags).toBe(false);
    expect(await application.runUnusedTagCleanupIfEnabled()).toBe(0);
    expect(await definitions()).toEqual(['lonely']);
  });

  it('is saved in the Space, and turning it off stops the cleanup', async () => {
    const { application, definitions } = await openSpace({ pages: [], declared: { lonely: {} }, enabled: true });
    expect(application.autoDeleteUnusedTags).toBe(true);

    await application.setAutoDeleteUnusedTags(false);

    expect(application.autoDeleteUnusedTags).toBe(false);
    expect(await application.runUnusedTagCleanupIfEnabled()).toBe(0);
    expect(await definitions()).toEqual(['lonely']);
  });
});

describe('Application.runUnusedTagCleanupIfEnabled', () => {
  it('removes a tag nothing uses, and keeps one a note still uses, with its icon and favorite', async () => {
    const { application, vault, definitions } = await openSpace({
      pages: [note('a', 'Plan the #roadmap today')],
      declared: { roadmap: { icon: '🗺️', favorite: true }, lonely: {}, forgotten: { icon: '🕸️' } },
      enabled: true,
    });

    expect(await application.runUnusedTagCleanupIfEnabled()).toBe(2);

    expect(await definitions()).toEqual(['roadmap']);
    expect(vault.getTagByName('roadmap')).toMatchObject({ icon: '🗺️', favorite: true, declared: true, usageCount: 1 });
    expect(vault.getTagByName('lonely')).toBeUndefined();
    expect(vault.getTagByName('forgotten')).toBeUndefined();
  });

  it('never touches a note: its text and frontmatter are exactly what they were', async () => {
    const { application, fileSystem } = await openSpace({
      pages: [note('a', 'Uses #kept and mentions nothing else')],
      declared: { kept: {}, lonely: {} },
      enabled: true,
    });
    const before = await fileSystem.readFile(`${ROOT}/a.md`);

    await application.runUnusedTagCleanupIfEnabled();

    expect(await fileSystem.readFile(`${ROOT}/a.md`)).toBe(before);
  });

  it('keeps a tag used only in an archived note, which is still a note in this Space', async () => {
    const { application, vault, definitions } = await openSpace({
      pages: [note('a', 'About #later')],
      declared: { later: { icon: '⏳' } },
      enabled: true,
    });
    await application.pageOperations.archive('a');

    expect(await application.runUnusedTagCleanupIfEnabled()).toBe(0);

    expect(await definitions()).toEqual(['later']);
    // The Vault's index counts active notes only, so it reads as unused there: the cleanup looks at archived notes itself.
    expect(vault.getTagByName('later')?.usageCount).toBe(0);
    expect(vault.getTagByName('later')?.declared).toBe(true);
  });

  it('keeps the tag through archiving and restoring a note, so restoring it finds the tag as it was', async () => {
    const { application, vault, definitions } = await openSpace({
      pages: [note('a', 'About #later')],
      declared: { later: { icon: '⏳' } },
      enabled: true,
    });

    await application.pageOperations.archive('a');
    expect(await application.runUnusedTagCleanupIfEnabled()).toBe(0);
    await application.pageOperations.restore('a');
    expect(await application.runUnusedTagCleanupIfEnabled()).toBe(0);

    expect(await definitions()).toEqual(['later']);
    expect(vault.getTagByName('later')).toMatchObject({ icon: '⏳', declared: true, usageCount: 1 });
  });

  it('removes the tag once its last note is gone for good, and not before', async () => {
    const { application, definitions } = await openSpace({
      pages: [note('a', 'About #later'), note('b', 'Also #later')],
      declared: { later: {} },
      enabled: true,
    });
    await application.pageOperations.archive('a');
    await application.pageOperations.delete('a');

    expect(await application.runUnusedTagCleanupIfEnabled()).toBe(0); // 'b' still uses it
    expect(await definitions()).toEqual(['later']);

    await application.pageOperations.archive('b');
    await application.pageOperations.delete('b');

    expect(await application.runUnusedTagCleanupIfEnabled()).toBe(1);
    expect(await definitions()).toEqual([]);
  });

  it('keeps a tag a note regained: usage is read at the moment of the write', async () => {
    const { application, vault, definitions } = await openSpace({
      pages: [note('a', 'Nothing here')],
      declared: { sooner: {} },
      enabled: true,
    });
    // The note gains the tag while the cleanup is being started (as an edit saved just then would).
    const first = application.tagOperations.deleteUnusedTags;
    vi.spyOn(application.tagOperations, 'deleteUnusedTags').mockImplementation(async (options) => {
      vault.replacePage(note('a', 'Now about #sooner'));
      return first.call(application.tagOperations, options);
    });

    expect(await application.runUnusedTagCleanupIfEnabled()).toBe(0);

    expect(await definitions()).toEqual(['sooner']);
  });

  it('keeps a tag that appears in an open note’s text even though no saved note has it yet', async () => {
    const { application, definitions } = await openSpace({
      pages: [note('a', 'Nothing here')],
      declared: { typing: { icon: '⌨️' }, lonely: {} },
      enabled: true,
    });
    const session = application.documentRegistry.open('a', 'Nothing here');
    session.commit(new DocumentTransaction('Now typing #typing'));
    // Isolate this rule from the "nothing unsaved" one below: the text is open, whatever has been saved.
    vi.spyOn(application.pageOperations, 'hasUnsavedWork').mockReturnValue(false);

    expect(await application.runUnusedTagCleanupIfEnabled()).toBe(1);

    expect(await definitions()).toEqual(['typing']);
  });

  it.each([
    ['a note with an unsaved change', (a: Application) => vi.spyOn(a.pageOperations, 'hasUnsavedWork').mockReturnValue(true)],
    ['a folder change being saved', (a: Application) => vi.spyOn(a.folderOperations, 'hasUnsavedWork').mockReturnValue(true)],
    [
      'an operation queued in the Persistence Gate',
      (a: Application) =>
        vi.spyOn(Reflect.get(a, 'persistenceCoordinator') as { hasPendingOperations(): boolean }, 'hasPendingOperations').mockReturnValue(true),
    ],
  ])('removes nothing while there is %s, and does it after the next change', async (_label, makeBusy) => {
    const { application, definitions } = await openSpace({ pages: [], declared: { lonely: {} }, enabled: true });
    const busy = makeBusy(application);

    expect(await application.runUnusedTagCleanupIfEnabled()).toBe(0);
    expect(await definitions()).toEqual(['lonely']);

    busy.mockReturnValue(false);
    expect(await application.runUnusedTagCleanupIfEnabled()).toBe(1);
    expect(await definitions()).toEqual([]);
  });

  it('removes nothing once the Application is closed, or while it is being prepared for a rename', async () => {
    const closing = await openSpace({ pages: [], declared: { lonely: {} }, enabled: true });
    await closing.application.close();
    expect(await closing.application.runUnusedTagCleanupIfEnabled()).toBe(0);
    expect(await closing.definitions()).toEqual(['lonely']);

    const renaming = await openSpace({ pages: [], declared: { lonely: {} }, enabled: true });
    Reflect.set(renaming.application, 'writeAdmission', 'quiescing');
    expect(await renaming.application.runUnusedTagCleanupIfEnabled()).toBe(0);
    expect(await renaming.definitions()).toEqual(['lonely']);
  });

  it('a failure leaves the definitions as they were and is not thrown', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { application, definitions } = await openSpace({ pages: [], declared: { lonely: {} }, enabled: true });
    vi.spyOn(application.tagOperations, 'deleteUnusedTags').mockRejectedValue(new Error('disk full'));

    await expect(application.runUnusedTagCleanupIfEnabled()).resolves.toBe(0);
    expect(await definitions()).toEqual(['lonely']);
  });

  it('is isolated between Spaces: one Space’s setting and cleanup never reach another', async () => {
    const on = await openSpace({ pages: [], declared: { lonely: {} }, enabled: true });
    const off = await openSpace({ pages: [], declared: { lonely: {} } });

    expect(await on.application.runUnusedTagCleanupIfEnabled()).toBe(1);
    expect(await off.application.runUnusedTagCleanupIfEnabled()).toBe(0);

    expect(await on.definitions()).toEqual([]);
    expect(await off.definitions()).toEqual(['lonely']);
    expect(on.application.autoDeleteUnusedTags).toBe(true);
    expect(off.application.autoDeleteUnusedTags).toBe(false);
  });
});

describe('when the cleanup runs by itself', () => {
  it('turning the setting on tidies up shortly afterwards', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { application, definitions } = await openSpace({ pages: [], declared: { lonely: {} } });

    await application.setAutoDeleteUnusedTags(true);
    expect(await definitions()).toEqual(['lonely']); // not instantly

    await vi.advanceTimersByTimeAsync(2500);

    expect(await definitions()).toEqual([]);
  });

  it('a change in the Space, even one that comes in a burst, makes one look a little later', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { application, vault, definitions } = await openSpace({
      pages: [note('a', 'About #fading')],
      declared: { fading: {} },
      enabled: true,
    });
    const cleanup = vi.spyOn(application, 'runUnusedTagCleanupIfEnabled');

    // The note stops using the tag, three times in quick succession (saves, as they would arrive).
    vault.replacePage(note('a', 'Nothing now'));
    vault.replacePage(note('a', 'Nothing now either'));
    vault.replacePage(note('a', 'Still nothing'));
    expect(cleanup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2500);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(await definitions()).toEqual([]);
  });

  it('does nothing by itself when the setting is off', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { application, vault, definitions } = await openSpace({
      pages: [note('a', 'About #fading')],
      declared: { fading: {} },
    });
    const cleanup = vi.spyOn(application, 'runUnusedTagCleanupIfEnabled');

    vault.replacePage(note('a', 'Nothing now'));
    await vi.advanceTimersByTimeAsync(5000);

    expect(cleanup).not.toHaveBeenCalled();
    expect(await definitions()).toEqual(['fading']);
  });

  it('a Space that is closed never has a tag removed on its behalf', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { application, vault, definitions } = await openSpace({
      pages: [note('a', 'About #fading')],
      declared: { fading: {} },
      enabled: true,
    });
    vault.replacePage(note('a', 'Nothing now'));

    await application.close();
    await vi.advanceTimersByTimeAsync(5000);

    expect(await definitions()).toEqual(['fading']);
  });
});
