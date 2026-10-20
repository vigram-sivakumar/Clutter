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
  options: { frontmatter?: Record<string, unknown>; embeds?: string[] } = {}
): Page {
  return new PageBuilder(ROOT).build({
    parentId,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id, ...options.frontmatter },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
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
});
