import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '../Application';
import { PageCreator } from '../page/PageCreator';
import { PageFactory } from '../page/PageFactory';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { Vault } from '../../vault/models/Vault';
import type { Folder } from '../../vault/models/Folder';
import type { Page } from '../../vault/models/Page';
import type { VaultResource } from '../../vault/models/VaultResource';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../../vault/providers/SelfWriteRegistry';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { VaultRootMissingError } from '../../vault/providers/VaultRootMissingError';
import { ImageReferenceExtractor } from '../../vault/ingest/extractors/ImageReferenceExtractor';
import { DocumentTransaction } from '../../engine/DocumentTransaction';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

const ROOT = '/vault';
const emptyAnalysis = { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] };
const folderMetadata = {
  defaultTemplateId: null,
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  status: 'active' as const,
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

const folder = (id: string, name: string, parent: Folder | null = null): Folder => ({
  id,
  name,
  path: `${parent?.path ?? ROOT}/${name}`,
  parentId: parent?.id ?? null,
  metadata: folderMetadata,
});

function page(
  id: string,
  path: string,
  parentId: string | null,
  options: { frontmatter?: Record<string, unknown>; embeds?: string[]; markdown?: string } = {}
): Page {
  return new PageBuilder(ROOT).build({
    parentId,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id, ...options.frontmatter },
      frontmatterAnalysis: { aliases: [] },
      content: options.markdown ?? 'Body',
      analysis: { ...emptyAnalysis, embeds: (options.embeds ?? []).map((target) => ({ target })) },
    },
  } as never);
}

/** A day at local noon. */
const day = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12, 0, 0);

const projects = folder('projects', 'Projects');
const inner = folder('inner', 'Inner', projects);
const assets = folder('assets', 'Assets');

async function setup(
  extra: { pages?: Page[]; folders?: Folder[]; resources?: VaultResource[]; embedding?: Page[] } = {}
) {
  const pages = [
    page('note-a', `${ROOT}/Note A.md`, null),
    page('note-b', `${ROOT}/Note B.md`, null),
    page('nested', `${ROOT}/Projects/Inner/Nested.md`, 'inner'),
    ...(extra.pages ?? []),
    ...(extra.embedding ?? []),
  ];
  const resources = extra.resources ?? [];
  const fileSystem = new InMemoryVaultFileSystem();
  const serializer = new FrontmatterSerializer();

  for (const seeded of pages) {
    fileSystem.seedFile(seeded.path, serializer.serializeDocument(seeded, seeded.source.markdown));
  }
  for (const resource of resources) {
    fileSystem.seedFile(resource.path, 'binary');
  }
  await fileSystem.createDirectory(`${ROOT}/Archive`);
  await fileSystem.createDirectory(`${ROOT}/Assets`);
  await fileSystem.createDirectory(`${ROOT}/Projects`);
  await fileSystem.createDirectory(`${ROOT}/Projects/Inner`);
  for (const created of extra.folders ?? []) {
    // Parents are listed before their children, and Projects already exists.
    if (!(await fileSystem.exists(created.path))) {
      await fileSystem.createDirectory(created.path);
    }
  }

  const vault = new Vault(
    ROOT,
    pages,
    [projects, inner, assets, folder('archive', 'Archive'), ...(extra.folders ?? [])],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
  );
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  Reflect.set(application, 'rootPath', ROOT);
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());

  return { application, vault, fileSystem };
}

const image = (id: string, name: string): VaultResource => ({
  id,
  kind: 'image',
  name,
  path: `${ROOT}/Assets/${name}`,
  parentId: 'assets',
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Application.purgeExpiredArchivedItems', () => {
  it('deletes a note archived 30 calendar days ago, and not one archived 29 days ago', async () => {
    const { application, vault } = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await application.pageOperations.archive('note-a');
    vi.setSystemTime(day(2026, 6, 2));
    await application.pageOperations.archive('note-b');

    // 29 days after note-a; 28 after note-b.
    expect(await application.purgeExpiredArchivedItems(day(2026, 6, 30))).toBe(0);
    expect(vault.getPage('note-a')).toBeDefined();

    // 30 days after note-a; 29 after note-b.
    expect(await application.purgeExpiredArchivedItems(day(2026, 7, 1))).toBe(1);
    expect(vault.getPage('note-a')).toBeUndefined();
    expect(vault.getPage('note-b')).toBeDefined();

    // 31 days after note-a would have been enough too; and note-b is due the next day.
    expect(await application.purgeExpiredArchivedItems(day(2026, 7, 2))).toBe(1);
    expect(vault.getPage('note-b')).toBeUndefined();
  });

  it('removes the file from disk, not just the vault', async () => {
    const { application, vault, fileSystem } = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await application.pageOperations.archive('note-a');
    const archivedPath = vault.getPage('note-a')!.path;
    expect(await fileSystem.exists(archivedPath)).toBe(true);

    await application.purgeExpiredArchivedItems(day(2026, 7, 1));

    expect(await fileSystem.exists(archivedPath)).toBe(false);
  });

  it('crosses month, year and leap-day boundaries by the calendar', async () => {
    const { application, vault } = await setup();
    vi.setSystemTime(day(2027, 1, 31));
    await application.pageOperations.archive('note-a'); // 30 days later: 2 March 2027 (28-day February)
    vi.setSystemTime(day(2025, 12, 15));
    await application.pageOperations.archive('note-b'); // 30 days later: 14 January 2026

    expect(await application.purgeExpiredArchivedItems(day(2026, 1, 13))).toBe(0);
    expect(await application.purgeExpiredArchivedItems(day(2026, 1, 14))).toBe(1);
    expect(vault.getPage('note-b')).toBeUndefined();

    expect(await application.purgeExpiredArchivedItems(day(2027, 3, 1))).toBe(0);
    expect(await application.purgeExpiredArchivedItems(day(2027, 3, 2))).toBe(1);
    expect(vault.getPage('note-a')).toBeUndefined();
  });

  it('never deletes active notes, folders or files, whatever the date', async () => {
    const { application, vault } = await setup({ resources: [image('img', 'active.png')] });

    expect(await application.purgeExpiredArchivedItems(day(2099, 1, 1))).toBe(0);

    expect(vault.getPage('note-a')).toBeDefined();
    expect(vault.getPage('nested')).toBeDefined();
    expect(vault.getFolder('projects')).toBeDefined();
    expect(vault.getResource('img')).toBeDefined();
  });

  it('a restored note is no longer eligible, and archiving it again records a new date', async () => {
    const { application, vault } = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await application.pageOperations.archive('note-a');
    await application.pageOperations.restore('note-a');

    // Restored: not in Archive/, so even far in the future it is not touched.
    expect(await application.purgeExpiredArchivedItems(day(2026, 12, 1))).toBe(0);
    expect(vault.getPage('note-a')).toBeDefined();

    vi.setSystemTime(day(2026, 6, 20));
    await application.pageOperations.archive('note-a');

    // 30 days after the FIRST archive, only 11 after the second.
    expect(await application.purgeExpiredArchivedItems(day(2026, 7, 1))).toBe(0);
    expect(vault.getPage('note-a')).toBeDefined();
    expect(await application.purgeExpiredArchivedItems(day(2026, 7, 20))).toBe(1);
    expect(vault.getPage('note-a')).toBeUndefined();
  });

  it('leaves an item with no archive date alone: placed in Archive/ from outside Clutter, or with an unreadable date', async () => {
    const external = page('external', `${ROOT}/Archive/External.md`, 'archive');
    const garbled = page('garbled', `${ROOT}/Archive/Garbled.md`, 'archive', {
      frontmatter: { status: 'archived', archivedAt: 'not-a-date' },
    });
    const { application, vault } = await setup({ pages: [external, garbled] });

    expect(await application.purgeExpiredArchivedItems(day(2099, 1, 1))).toBe(0);

    expect(vault.getPage('external')).toBeDefined();
    expect(vault.getPage('garbled')).toBeDefined();
  });

  it('does not infer an archive date from when the note was created or modified', async () => {
    const old = page('old', `${ROOT}/Archive/Old.md`, 'archive', {
      frontmatter: { status: 'archived', created: '2001-01-01T00:00:00.000Z', modified: '2001-01-01T00:00:00.000Z' },
    });
    const { application, vault } = await setup({ pages: [old] });

    expect(await application.purgeExpiredArchivedItems(day(2099, 1, 1))).toBe(0);
    expect(vault.getPage('old')).toBeDefined();
  });

  it('deletes an archived folder with everything inside it, once the folder is 30 days old', async () => {
    const { application, vault } = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await application.folderOperations.archive('projects');
    expect(vault.getPage('nested')).toBeDefined();

    expect(await application.purgeExpiredArchivedItems(day(2026, 6, 30))).toBe(0);
    expect(vault.getFolder('projects')).toBeDefined();

    expect(await application.purgeExpiredArchivedItems(day(2026, 7, 1))).toBe(1);
    expect(vault.getFolder('projects')).toBeUndefined();
    expect(vault.getFolder('inner')).toBeUndefined();
    expect(vault.getPage('nested')).toBeUndefined();
  });

  it('a note inside an archived folder is deleted with the folder, never on its own older date', async () => {
    // Marked archived long ago, but it never left its folder, so it is not an item of Archive/ itself.
    const oldNested = page('old-nested', `${ROOT}/Projects/Inner/Old.md`, 'inner', {
      frontmatter: { status: 'archived', archivedAt: day(2026, 5, 1).toISOString() },
    });
    const { application, vault } = await setup({ pages: [oldNested] });
    vi.setSystemTime(day(2026, 6, 20));
    await application.folderOperations.archive('projects');

    // The note's own date is long past, but it sits inside the folder: only the folder's date counts.
    expect(await application.purgeExpiredArchivedItems(day(2026, 7, 1))).toBe(0);
    expect(vault.getPage('old-nested')).toBeDefined();

    expect(await application.purgeExpiredArchivedItems(day(2026, 7, 20))).toBe(1);
    expect(vault.getFolder('projects')).toBeUndefined();
    expect(vault.getPage('old-nested')).toBeUndefined();
  });

  it('deletes an archived asset nothing active uses, and keeps one an active note still embeds', async () => {
    const embedder = page('embedder', `${ROOT}/Embedder.md`, null, { embeds: ['Assets/shared.png'] });
    const { application, vault } = await setup({
      resources: [image('shared', 'shared.png'), image('free', 'free.png')],
      embedding: [embedder],
    });
    vi.setSystemTime(day(2026, 6, 1));
    await application.resourceOperations.archiveResource('shared');
    await application.resourceOperations.archiveResource('free');

    expect(await application.purgeExpiredArchivedItems(day(2026, 7, 1))).toBe(1);

    expect(vault.getResource('free')).toBeUndefined();
    expect(vault.getResource('shared')).toBeDefined();
    expect(vault.getPage('embedder')).toBeDefined();
  });

  it('deletes the shared asset once the note that embeds it is itself archived and gone', async () => {
    const embedder = page('embedder', `${ROOT}/Embedder.md`, null, { embeds: ['Assets/shared.png'] });
    const { application, vault } = await setup({ resources: [image('shared', 'shared.png')], embedding: [embedder] });
    vi.setSystemTime(day(2026, 6, 1));
    await application.resourceOperations.archiveResource('shared');
    await application.pageOperations.archive('embedder');

    expect(await application.purgeExpiredArchivedItems(day(2026, 7, 1))).toBe(2);
    expect(vault.getResource('shared')).toBeUndefined();
  });

  it('is idempotent: a second run, and a run racing the first, delete nothing more', async () => {
    const { application } = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await application.pageOperations.archive('note-a');

    const [first, concurrent] = await Promise.all([
      application.purgeExpiredArchivedItems(day(2026, 7, 1)),
      application.purgeExpiredArchivedItems(day(2026, 7, 1)),
    ]);

    expect(first).toBe(1);
    expect(concurrent).toBe(1); // joined the same run, so it is the same count — not a second deletion
    expect(await application.purgeExpiredArchivedItems(day(2026, 7, 1))).toBe(0);
  });

  it('leaves an item that cannot be deleted in place and carries on with the rest, without throwing', async () => {
    const { application, vault } = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await application.folderOperations.archive('projects');
    await application.pageOperations.archive('note-a');
    vi.spyOn(application.folderOperations, 'delete').mockRejectedValue(new Error('disk is read-only'));

    await expect(application.purgeExpiredArchivedItems(day(2026, 7, 1))).resolves.toBe(1);

    expect(vault.getFolder('projects')).toBeDefined();
    expect(vault.getPage('note-a')).toBeUndefined();
  });

  it('stops, and recreates nothing, when the vault root is missing', async () => {
    const { application, vault, fileSystem } = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await application.pageOperations.archive('note-a');
    await application.pageOperations.archive('note-b');
    const delete_ = vi
      .spyOn(application.pageOperations, 'delete')
      .mockRejectedValue(new VaultRootMissingError(ROOT));
    const createDirectory = vi.spyOn(fileSystem, 'createDirectory');

    await expect(application.purgeExpiredArchivedItems(day(2026, 7, 1))).resolves.toBe(0);

    expect(delete_).toHaveBeenCalledTimes(1); // the first failure ended the run
    expect(createDirectory).not.toHaveBeenCalled();
    expect(vault.getPage('note-a')).toBeDefined();
    expect(vault.getPage('note-b')).toBeDefined();
  });

  it('stays inside its own vault: another Space’s archive is never touched', async () => {
    const one = await setup();
    const two = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await one.application.pageOperations.archive('note-a');
    await two.application.pageOperations.archive('note-a');

    expect(await one.application.purgeExpiredArchivedItems(day(2026, 7, 1))).toBe(1);

    expect(one.vault.getPage('note-a')).toBeUndefined();
    expect(two.vault.getPage('note-a')).toBeDefined();
  });

  it('a restore queued ahead of a stale delete wins: the restored note is not deleted', async () => {
    const { application, vault } = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await application.pageOperations.archive('note-a');

    // The user restores it just as cleanup fires: the restore is already queued when cleanup asks to delete.
    const restoring = application.pageOperations.restore('note-a');
    const purged = application.purgeExpiredArchivedItems(day(2026, 7, 1));
    await Promise.all([restoring, purged]);

    expect(vault.getPage('note-a')).toBeDefined();
    expect(vault.isPageEffectivelyArchived(vault.getPage('note-a')!)).toBe(false);
  });

  it('a restore queued ahead of a stale folder delete wins too', async () => {
    const { application, vault } = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await application.folderOperations.archive('projects');

    const restoring = application.folderOperations.restore('projects');
    const purged = application.purgeExpiredArchivedItems(day(2026, 7, 1));
    await Promise.all([restoring, purged]);

    expect(vault.getFolder('projects')).toBeDefined();
    expect(vault.isFolderEffectivelyArchived('projects')).toBe(false);
    expect(vault.getPage('nested')).toBeDefined();
  });

  it('deleting still works for an item that stays archived (the guard only protects what was restored)', async () => {
    const { application, vault } = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await application.pageOperations.archive('note-a');
    await application.folderOperations.archive('projects');

    expect(await application.purgeExpiredArchivedItems(day(2026, 7, 1))).toBe(2);
    expect(vault.getPage('note-a')).toBeUndefined();
    expect(vault.getFolder('projects')).toBeUndefined();
  });

  it('an Application that has been closed (the Space was switched away from) deletes nothing', async () => {
    const { application, vault } = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await application.pageOperations.archive('note-a');
    await application.close();

    await expect(application.purgeExpiredArchivedItems(day(2026, 7, 1))).resolves.toBe(0);

    expect(vault.getPage('note-a')).toBeDefined();
  });

  it('a run that is under way stops deleting once the Application closes', async () => {
    const { application, vault } = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await application.pageOperations.archive('note-a');
    await application.pageOperations.archive('note-b');
    const realDelete = application.pageOperations.delete.bind(application.pageOperations);
    let deleted = 0;
    vi.spyOn(application.pageOperations, 'delete').mockImplementation(async (id, options) => {
      deleted += 1;
      // Closing happens while the first delete is in progress.
      void application.close();
      await realDelete(id, options);
    });

    await application.purgeExpiredArchivedItems(day(2026, 7, 1));

    expect(deleted).toBe(1);
    expect(['note-a', 'note-b'].filter((id) => vault.getPage(id) !== undefined)).toHaveLength(1);
  });

  it('keeps an archived folder while an active note still embeds a file inside it, and deletes it once nothing does', async () => {
    const picture: VaultResource = {
      id: 'pic',
      kind: 'image',
      name: 'pic.png',
      path: `${ROOT}/Projects/pic.png`,
      parentId: 'projects',
    };
    const embedder = page('embedder', `${ROOT}/Embedder.md`, null, { embeds: ['pic.png'] });
    const { application, vault } = await setup({ resources: [picture], embedding: [embedder] });
    vi.setSystemTime(day(2026, 6, 1));
    await application.folderOperations.archive('projects');

    expect(await application.purgeExpiredArchivedItems(day(2026, 7, 1))).toBe(0);
    expect(vault.getFolder('projects')).toBeDefined();
    expect(vault.getResource('pic')).toBeDefined();

    await application.pageOperations.archive('embedder');
    expect(await application.purgeExpiredArchivedItems(day(2026, 7, 1))).toBe(2);
    expect(vault.getFolder('projects')).toBeUndefined();
  });
});

describe('Application.purgeExpiredArchivedItems — files that active notes still point at', () => {
  const folderA = folder('folder-a', 'A', projects);
  const folderB = folder('folder-b', 'B', projects);
  const logo = (id: string, parent: Folder): VaultResource => ({
    id,
    kind: 'image',
    name: 'logo.png',
    path: `${parent.path}/logo.png`,
    parentId: parent.id,
  });
  const logoA = logo('logo-a', folderA);
  const logoB = logo('logo-b', folderB);

  /** Archives `logoA` on 1 June 2026, so it is due on 1 July. */
  async function archivedLogoA(extra: Parameters<typeof setup>[0] = {}) {
    const space = await setup({
      folders: [folderA, folderB, ...(extra.folders ?? [])],
      resources: [logoA, logoB, ...(extra.resources ?? [])],
      embedding: extra.embedding,
    });
    vi.setSystemTime(day(2026, 6, 1));
    await space.application.resourceOperations.archiveResource('logo-a');
    return space;
  }
  const due = day(2026, 7, 1);

  it('deletes it when nothing at all points at it', async () => {
    const { application, vault } = await archivedLogoA();

    expect(await application.purgeExpiredArchivedItems(due)).toBe(1);
    expect(vault.getResource('logo-a')).toBeUndefined();
    expect(vault.getResource('logo-b')).toBeDefined();
  });

  it.each([
    ['a ![[path]] embed', { embeds: ['Projects/A/logo.png'] }],
    ['an aliased embed (the alias is split off)', { embeds: ['Projects/A/logo.png'] }],
    ['a ./-prefixed path', { embeds: ['./Projects/A/logo.png'] }],
    ['a standard image', { markdown: '![logo](Projects/A/logo.png)' }],
    ['a standard image with a title', { markdown: '![logo](Projects/A/logo.png "The logo")' }],
    ['a standard image in <angle brackets>', { markdown: '![logo](<Projects/A/logo.png>)' }],
    ['a note cover', { frontmatter: { cover: 'Projects/A/logo.png' } }],
    ['a hidden note cover', { frontmatter: { cover: 'Projects/A/logo.png', coverHidden: true } }],
    ['a bare file name, which cannot be told apart from the archived file', { embeds: ['logo.png'] }],
    ['a path that no longer matches but ends in the same name', { embeds: ['Old/Projects/logo.png'] }],
    ['a reference to where the file sits now, inside Archive/', { embeds: ['Archive/logo.png'] }],
  ])('keeps an archived file that %s of an active note still points at', async (_form, reference) => {
    const embedder = page('embedder', `${ROOT}/Embedder.md`, null, reference);
    const { application, vault } = await archivedLogoA({ embedding: [embedder] });

    expect(await application.purgeExpiredArchivedItems(due)).toBe(0);
    expect(vault.getResource('logo-a')).toBeDefined();
  });

  it('keeps it for the cover of an active folder, and for the Space avatar', async () => {
    const withCover: Folder = { ...folder('covered', 'Covered'), metadata: { ...folderMetadata, cover: 'Projects/A/logo.png' } };
    const first = await archivedLogoA({ folders: [withCover] });
    expect(await first.application.purgeExpiredArchivedItems(due)).toBe(0);
    expect(first.vault.getResource('logo-a')).toBeDefined();

    const second = await archivedLogoA();
    await second.application.spaceProfileStore.setAvatar({ type: 'image', src: 'Projects/A/logo.png' });
    expect(await second.application.purgeExpiredArchivedItems(due)).toBe(0);
    expect(second.vault.getResource('logo-a')).toBeDefined();
  });

  it('is not held up by a note that points at a different, same-named file that stays', async () => {
    // Projects/B/logo.png is embedded by path, and it resolves to B — which is not being deleted.
    const embedder = page('embedder', `${ROOT}/Embedder.md`, null, { embeds: ['Projects/B/logo.png'] });
    const { application, vault } = await archivedLogoA({ embedding: [embedder] });

    expect(await application.purgeExpiredArchivedItems(due)).toBe(1);

    expect(vault.getResource('logo-a')).toBeUndefined();
    expect(vault.getResource('logo-b')).toBeDefined();
    expect(vault.getPage('embedder')).toBeDefined();
  });

  it('is not held up by a reference written inside code, or by one in an archived note', async () => {
    const code = page('code', `${ROOT}/Code.md`, null, { markdown: '```\n![x](Projects/A/logo.png)\n```' });
    const { application, vault } = await archivedLogoA({ embedding: [code] });

    expect(await application.purgeExpiredArchivedItems(due)).toBe(1);
    expect(vault.getResource('logo-a')).toBeUndefined();
  });

  it('keeps the file when what points at it cannot be worked out, and deletes nothing it cannot be sure of', async () => {
    const { application, vault } = await archivedLogoA();
    vi.spyOn(ImageReferenceExtractor.prototype, 'extract').mockImplementation(() => {
      throw new Error('could not read the notes');
    });

    await expect(application.purgeExpiredArchivedItems(due)).resolves.toBe(0);

    expect(vault.getResource('logo-a')).toBeDefined();
  });

  it('keeps an archived folder while a note points at a file inside it by the file’s original path', async () => {
    const embedder = page('embedder', `${ROOT}/Embedder.md`, null, { embeds: ['Projects/A/logo.png'] });
    const { application, vault } = await setup({
      folders: [folderA, folderB],
      resources: [logoA, logoB],
      embedding: [embedder],
    });
    vi.setSystemTime(day(2026, 6, 1));
    await application.folderOperations.archive('folder-a');

    expect(await application.purgeExpiredArchivedItems(due)).toBe(0);
    expect(vault.getFolder('folder-a')).toBeDefined();
    expect(vault.getResource('logo-a')).toBeDefined();
  });

  it('deletes an archived folder whose files nothing points at, even if another folder holds a same-named file that is embedded', async () => {
    const embedder = page('embedder', `${ROOT}/Embedder.md`, null, { embeds: ['Projects/B/logo.png'] });
    const { application, vault } = await setup({
      folders: [folderA, folderB],
      resources: [logoA, logoB],
      embedding: [embedder],
    });
    vi.setSystemTime(day(2026, 6, 1));
    await application.folderOperations.archive('folder-a');

    expect(await application.purgeExpiredArchivedItems(due)).toBe(1);

    expect(vault.getFolder('folder-a')).toBeUndefined();
    expect(vault.getResource('logo-a')).toBeUndefined();
    expect(vault.getResource('logo-b')).toBeDefined();
  });
});

describe('Application.purgeExpiredArchivedItems — the delete guard and failures', () => {
  it('the Gate checks "still archived" when the delete runs, after everything queued before it: a restore ahead of it wins', async () => {
    const { application, vault } = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await application.pageOperations.archive('note-a');
    const order: string[] = [];

    // The restore is queued first; the delete, asked for while the page still looks archived, runs after it.
    const restoring = application.pageOperations.restore('note-a').then(() => order.push('restored'));
    const deleting = application.pageOperations.delete('note-a').then(() => order.push('delete-ran'));
    await Promise.all([restoring, deleting]);

    expect(order).toEqual(['restored', 'delete-ran']);
    expect(vault.getPage('note-a')).toBeDefined();
    expect(vault.isPageEffectivelyArchived(vault.getPage('note-a')!)).toBe(false);
  });

  it('a delete of a page that is still archived goes ahead', async () => {
    const { application, vault } = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await application.pageOperations.archive('note-a');

    await application.pageOperations.delete('note-a');

    expect(vault.getPage('note-a')).toBeUndefined();
  });

  it('replace-on-restore still deletes an active page: allowActive is the one deliberate exception', async () => {
    const { application, vault } = await setup();
    expect(vault.isPageEffectivelyArchived(vault.getPage('note-a')!)).toBe(false);

    await application.pageOperations.delete('note-a', { allowActive: true });

    expect(vault.getPage('note-a')).toBeUndefined();
  });

  it('deleting an active page without allowActive is still refused, as before', async () => {
    const { application, vault } = await setup();

    await expect(application.pageOperations.delete('note-a')).rejects.toThrow('not archived');

    expect(vault.getPage('note-a')).toBeDefined();
  });

  it('replace-on-restore for a folder is the same exception', async () => {
    const { application, vault } = await setup();

    await application.folderOperations.delete('inner', { allowActive: true });

    expect(vault.getFolder('inner')).toBeUndefined();
  });

  it('an unreadable archive record list ends the run: no file is deleted, nothing throws, nothing is created', async () => {
    const embedder = page('plain', `${ROOT}/Plain.md`, null);
    const { application, vault, fileSystem } = await setup({
      resources: [{ id: 'img', kind: 'image', name: 'x.png', path: `${ROOT}/Assets/x.png`, parentId: 'assets' }],
      embedding: [embedder],
    });
    vi.setSystemTime(day(2026, 6, 1));
    await application.resourceOperations.archiveResource('img');
    vi.spyOn(application.resourceArchiveStore, 'read').mockRejectedValue(new Error('records are corrupt'));
    const createDirectory = vi.spyOn(fileSystem, 'createDirectory');
    const writeFile = vi.spyOn(fileSystem, 'writeFile');

    await expect(application.purgeExpiredArchivedItems(day(2026, 7, 1))).resolves.toBe(0);

    expect(vault.getResource('img')).toBeDefined();
    expect(createDirectory).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('a vault root that has gone missing ends the run before anything else is touched or created', async () => {
    const { application, vault, fileSystem } = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await application.pageOperations.archive('note-a');
    await application.pageOperations.archive('note-b');
    vi.spyOn(application.folderOperations, 'delete').mockResolvedValue();
    const deletePage = vi
      .spyOn(application.pageOperations, 'delete')
      .mockRejectedValue(new VaultRootMissingError(ROOT));
    const createDirectory = vi.spyOn(fileSystem, 'createDirectory');
    const writeFile = vi.spyOn(fileSystem, 'writeFile');
    const moveFile = vi.spyOn(fileSystem, 'moveFile');

    await expect(application.purgeExpiredArchivedItems(day(2026, 7, 1))).resolves.toBe(0);

    expect(deletePage).toHaveBeenCalledTimes(1);
    expect(createDirectory).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(moveFile).not.toHaveBeenCalled();
    expect(vault.getPage('note-a')).toBeDefined();
    expect(vault.getPage('note-b')).toBeDefined();
  });

  it('when a Space is switched away from, the old Application deletes nothing and the new Space is untouched', async () => {
    const oldSpace = await setup();
    const newSpace = await setup();
    vi.setSystemTime(day(2026, 6, 1));
    await oldSpace.application.pageOperations.archive('note-a');
    await newSpace.application.pageOperations.archive('note-a');

    // AppShell closes the previous Application when it switches Space.
    await oldSpace.application.close();
    await expect(oldSpace.application.purgeExpiredArchivedItems(day(2026, 7, 1))).resolves.toBe(0);
    await expect(oldSpace.application.runArchiveCleanupIfEnabled(day(2026, 7, 1))).resolves.toBe(0);

    expect(oldSpace.vault.getPage('note-a')).toBeDefined();
    expect(newSpace.vault.getPage('note-a')).toBeDefined();
  });

  it('an item with an invalid or future archive date is left alone: nothing is deleted on a date it cannot trust', async () => {
    const future = page('future', `${ROOT}/Archive/Future.md`, 'archive', {
      frontmatter: { status: 'archived', archivedAt: day(2099, 1, 1).toISOString() },
    });
    const garbled = page('garbled', `${ROOT}/Archive/Garbled.md`, 'archive', {
      frontmatter: { status: 'archived', archivedAt: '2026-13-45' },
    });
    const { application, vault } = await setup({ pages: [future, garbled] });

    expect(await application.purgeExpiredArchivedItems(day(2026, 12, 1))).toBe(0);

    expect(vault.getPage('future')).toBeDefined();
    expect(vault.getPage('garbled')).toBeDefined();
  });
});

describe('Application.purgeExpiredArchivedItems — unresolved references and same-named files', () => {
  const folderA = folder('folder-a', 'A', projects);
  const folderB = folder('folder-b', 'B', projects);
  const logo = (id: string, parent: Folder): VaultResource => ({
    id,
    kind: 'image',
    name: 'logo.png',
    path: `${parent.path}/logo.png`,
    parentId: parent.id,
  });
  const due = day(2026, 7, 1);

  async function twoSameNamedLogos(embedding: Page[] = []) {
    const space = await setup({
      folders: [folderA, folderB],
      resources: [logo('logo-a', folderA), logo('logo-b', folderB)],
      embedding,
    });
    vi.setSystemTime(day(2026, 6, 1));
    await space.application.resourceOperations.archiveResource('logo-a');
    return space;
  }

  it.each([
    ['a bare file name', 'logo.png'],
    ['a folder that holds neither', 'Projects/logo.png'],
    ['a path that climbs out of the other folder', 'Projects/B/../A/logo.png'],
    ['the other folder in another case', 'projects/b/logo.png'],
    ['a folder that does not exist', 'Somewhere/Else/logo.png'],
  ])(
    'keeps the archived Projects/A/logo.png for an embed of %s, although Projects/B/logo.png stays — it may mean A',
    async (_label, reference) => {
      const embedder = page('embedder', `${ROOT}/Embedder.md`, null, { embeds: [reference] });
      const { application, vault } = await twoSameNamedLogos([embedder]);

      expect(await application.purgeExpiredArchivedItems(due)).toBe(0);

      expect(vault.getResource('logo-a')).toBeDefined();
      expect(vault.getResource('logo-b')).toBeDefined();
    }
  );

  it('the same holds for a Markdown image: the same-named file that stays does not settle an unresolved reference', async () => {
    const embedder = page('embedder', `${ROOT}/Embedder.md`, null, { markdown: '![logo](logo.png)' });
    const { application, vault } = await twoSameNamedLogos([embedder]);

    expect(await application.purgeExpiredArchivedItems(due)).toBe(0);
    expect(vault.getResource('logo-a')).toBeDefined();
  });

  it('only a reference that resolves exactly to the staying file frees the archived one', async () => {
    const embedder = page('embedder', `${ROOT}/Embedder.md`, null, { embeds: ['Projects/B/logo.png'] });
    const { application, vault } = await twoSameNamedLogos([embedder]);

    expect(await application.purgeExpiredArchivedItems(due)).toBe(1);

    expect(vault.getResource('logo-a')).toBeUndefined();
    expect(vault.getResource('logo-b')).toBeDefined();
  });

  it('with an unresolved reference, both same-named files are kept when both are archived', async () => {
    const embedder = page('embedder', `${ROOT}/Embedder.md`, null, { embeds: ['logo.png'] });
    const { application, vault } = await twoSameNamedLogos([embedder]);
    await application.resourceOperations.archiveResource('logo-b');

    expect(await application.purgeExpiredArchivedItems(day(2026, 7, 2))).toBe(0);

    expect(vault.getResource('logo-a')).toBeDefined();
    expect(vault.getResource('logo-b')).toBeDefined();
  });
});

describe('Application.purgeExpiredArchivedItems — a note with unsaved edits', () => {
  const asset = (id: string, name: string): VaultResource => ({
    id,
    kind: 'image',
    name,
    path: `${ROOT}/Assets/${name}`,
    parentId: 'assets',
  });
  const due = day(2026, 7, 1);

  async function archivedAssets(...assets: VaultResource[]) {
    const space = await setup({ resources: assets });
    vi.setSystemTime(day(2026, 6, 1));
    for (const resource of assets) {
      await space.application.resourceOperations.archiveResource(resource.id);
    }
    return space;
  }
  const typeInto = (application: Application, pageId: string, markdown: string) =>
    application.pageOperations.getSession(pageId)!.commit(new DocumentTransaction(markdown));

  it('keeps an archived file that an open note was just edited to embed, before the edit is saved', async () => {
    const { application, vault } = await archivedAssets(asset('shot', 'shot.png'));
    await application.pageOperations.open('note-b');

    // Typed, committed to the open session — and not on disk: the saved note does not mention it.
    typeInto(application, 'note-b', 'Look: ![[Assets/shot.png]]');
    expect(vault.getPage('note-b')!.source.markdown).not.toContain('shot.png');

    expect(await application.purgeExpiredArchivedItems(due)).toBe(0);
    expect(vault.getResource('shot')).toBeDefined();
  });

  it('does so for a standard Markdown image typed into an open note, too', async () => {
    const { application, vault } = await archivedAssets(asset('shot', 'shot.png'));
    await application.pageOperations.open('note-b');
    typeInto(application, 'note-b', '![a shot](Assets/shot.png)');

    expect(await application.purgeExpiredArchivedItems(due)).toBe(0);
    expect(vault.getResource('shot')).toBeDefined();
  });

  it('keeps it for an unsaved draft that embeds it', async () => {
    const { application, vault } = await archivedAssets(asset('shot', 'shot.png'));
    const draftId = await application.pageOperations.openDraft({ folderId: null });
    typeInto(application, draftId, '![[Assets/shot.png]]');

    expect(await application.purgeExpiredArchivedItems(due)).toBe(0);
    expect(vault.getResource('shot')).toBeDefined();
  });

  it('deletes it once the unsaved reference has been taken out again: only what the open note says now counts', async () => {
    const { application, vault } = await archivedAssets(asset('shot', 'shot.png'));
    await application.pageOperations.open('note-b');
    typeInto(application, 'note-b', '![[Assets/shot.png]]');
    typeInto(application, 'note-b', 'No picture after all.');

    expect(await application.purgeExpiredArchivedItems(due)).toBe(1);
    expect(vault.getResource('shot')).toBeUndefined();
  });

  it('does not count an open note that is archived', async () => {
    const { application, vault } = await archivedAssets(asset('shot', 'shot.png'));
    await application.pageOperations.open('note-b');
    typeInto(application, 'note-b', '![[Assets/shot.png]]');
    await application.pageOperations.archive('note-b');

    expect(await application.purgeExpiredArchivedItems(due)).toBeGreaterThanOrEqual(1);
    expect(vault.getResource('shot')).toBeUndefined();
  });

  it('sees an edit made while the run is under way, not only the notes as they were when it started', async () => {
    const { application, vault } = await archivedAssets(asset('one', 'one.png'), asset('two', 'two.png'));
    await application.pageOperations.open('note-b');
    const realDelete = application.resourceOperations.deleteResource.bind(application.resourceOperations);
    vi.spyOn(application.resourceOperations, 'deleteResource').mockImplementation(async (id) => {
      await realDelete(id);
      // While that delete was running the user typed a reference to the other file.
      typeInto(application, 'note-b', `![[Assets/${id === 'one' ? 'two' : 'one'}.png]]`);
    });

    expect(await application.purgeExpiredArchivedItems(due)).toBe(1);

    expect(['one', 'two'].filter((id) => vault.getResource(id) !== undefined)).toHaveLength(1);
  });
});
