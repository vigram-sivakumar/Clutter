import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MoveService } from './MoveService';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Page } from '../../vault/models/Page';
import type { Folder } from '../../vault/models/Folder';

const ROOT = '/vault';

function makeFolder(id: string, path: string): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId: null,
    metadata: {
      icon: null,
      favorite: false,
      description: '',
      cover: null,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    },
  };
}

function buildPage(path: string, parentId: string | null = null, id = 'page-1'): Page {
  return new PageBuilder().build({
    parentId,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    },
  });
}

function makeVault(pages: Page[], folders: Folder[]): Vault {
  return new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

describe('MoveService.resolveMoveDestination', () => {
  it('resolves the destination path inside the target folder, preserving the filename', () => {
    const page = buildPage(`${ROOT}/Note.md`);
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([page], [folder]);
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    const destination = moveService.resolveMoveDestination(page, 'folder-1');

    expect(destination).toEqual({
      path: `${ROOT}/Projects/Note.md`,
      parentId: 'folder-1',
    });
  });

  it('throws for an unknown destination folder id', () => {
    const page = buildPage(`${ROOT}/Note.md`);
    const vault = makeVault([page], []);
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    expect(() => moveService.resolveMoveDestination(page, 'does-not-exist')).toThrow(
      /Folder not found: does-not-exist/
    );
  });

  it('preserves filenames containing spaces and special characters', () => {
    const page = buildPage(`${ROOT}/My Great Idea (draft).md`);
    const folder = makeFolder('folder-1', `${ROOT}/Archive Bin`);
    const vault = makeVault([page], [folder]);
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    const destination = moveService.resolveMoveDestination(page, 'folder-1');

    expect(destination).toEqual({
      path: `${ROOT}/Archive Bin/My Great Idea (draft).md`,
      parentId: 'folder-1',
    });
  });
});

describe('MoveService.resolveRenameDestination', () => {
  it('resolves a new filename under the same parent, at the vault root', () => {
    const page = buildPage(`${ROOT}/Note.md`);
    const vault = makeVault([page], []);
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    const destination = moveService.resolveRenameDestination(page, 'Renamed');

    expect(destination).toEqual({
      path: `${ROOT}/Renamed.md`,
      parentId: null,
    });
  });

  it('resolves a new filename under the same non-root parent, never reparenting', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const page = buildPage(`${ROOT}/Projects/Note.md`, 'folder-1');
    const vault = makeVault([page], [folder]);
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    const destination = moveService.resolveRenameDestination(page, 'Renamed');

    expect(destination).toEqual({
      path: `${ROOT}/Projects/Renamed.md`,
      parentId: 'folder-1',
    });
  });

  it('resolving to the current title is a no-op, not a self-collision', () => {
    const page = buildPage(`${ROOT}/Note.md`);
    const vault = makeVault([page], []);
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    const destination = moveService.resolveRenameDestination(page, 'Note');

    expect(destination.path).toBe(`${ROOT}/Note.md`);
  });

  it('appends a numeric suffix when the new title collides with a sibling page', () => {
    const page = buildPage(`${ROOT}/Note.md`, null, 'page-1');
    const occupant = buildPage(`${ROOT}/Other.md`, null, 'page-2');
    const vault = makeVault([page, occupant], []);
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    const destination = moveService.resolveRenameDestination(page, 'Other');

    expect(destination.path).toBe(`${ROOT}/Other 2.md`);
  });

  it('regenerates a fresh default name for a blank or whitespace-only title, never keeping the old name', () => {
    const page = buildPage(`${ROOT}/Note.md`);
    const vault = makeVault([page], []);
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    expect(moveService.resolveRenameDestination(page, '').path).toBe(`${ROOT}/Untitled.md`);
    expect(moveService.resolveRenameDestination(page, '   ').path).toBe(`${ROOT}/Untitled.md`);
  });
});

describe('MoveService.resolveArchiveDestination', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 12, 16, 43, 1)); // local time, 2026-08-12 16:43:01
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('archives to Archive/<name>.md unchanged when the destination is free', () => {
    const archiveFolder = makeFolder('archive', `${ROOT}/Archive`);
    const projectFolder = makeFolder('folder-1', `${ROOT}/Project`);
    const page = buildPage(`${ROOT}/Project/Test.md`, 'folder-1', 'page-1');
    const vault = makeVault([page], [archiveFolder, projectFolder]);
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    const destination = moveService.resolveArchiveDestination(page);

    expect(destination).toEqual({
      path: `${ROOT}/Archive/Test.md`,
      parentId: 'archive',
    });
  });

  it('falls back to a local-time timestamp suffix when Archive/<name>.md is already taken', () => {
    const archiveFolder = makeFolder('archive', `${ROOT}/Archive`);
    const projectFolder = makeFolder('folder-1', `${ROOT}/Project`);
    // Already occupies the flattened destination — a different page.
    const alreadyArchived = buildPage(`${ROOT}/Archive/Test.md`, 'archive', 'page-archived');
    const page = buildPage(`${ROOT}/Project/Test.md`, 'folder-1', 'page-2');
    const vault = makeVault([alreadyArchived, page], [archiveFolder, projectFolder]);
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    const destination = moveService.resolveArchiveDestination(page);

    expect(destination).toEqual({
      path: `${ROOT}/Archive/Test 2026-08-12 16.43.01.md`,
      parentId: 'archive',
    });
  });

  it('falls back to a deterministic .01 suffix when even the timestamped name is taken', () => {
    const archiveFolder = makeFolder('archive', `${ROOT}/Archive`);
    const projectFolder = makeFolder('folder-1', `${ROOT}/Project`);
    const alreadyArchived = buildPage(`${ROOT}/Archive/Test.md`, 'archive', 'page-archived');
    const alreadyTimestamped = buildPage(
      `${ROOT}/Archive/Test 2026-08-12 16.43.01.md`,
      'archive',
      'page-archived-2'
    );
    const page = buildPage(`${ROOT}/Project/Test.md`, 'folder-1', 'page-3');
    const vault = makeVault(
      [alreadyArchived, alreadyTimestamped, page],
      [archiveFolder, projectFolder]
    );
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    const destination = moveService.resolveArchiveDestination(page);

    expect(destination).toEqual({
      path: `${ROOT}/Archive/Test 2026-08-12 16.43.01.01.md`,
      parentId: 'archive',
    });
  });

  it('archiving a Daily Note only gets a timestamp once its flattened destination is already taken', () => {
    const archiveFolder = makeFolder('archive', `${ROOT}/Archive`);
    const monthFolder = makeFolder('month-1', `${ROOT}/Daily Notes/2026/August`);
    const dailyNote = buildPage(
      `${ROOT}/Daily Notes/2026/August/2026-08-12.md`,
      'month-1',
      'daily-note-1'
    );
    const vault = makeVault([dailyNote], [archiveFolder, monthFolder]);
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    expect(moveService.resolveArchiveDestination(dailyNote)).toEqual({
      path: `${ROOT}/Archive/2026-08-12.md`,
      parentId: 'archive',
    });

    const alreadyArchived = buildPage(`${ROOT}/Archive/2026-08-12.md`, 'archive', 'other-day');
    const vaultWithCollision = makeVault(
      [alreadyArchived, dailyNote],
      [archiveFolder, monthFolder]
    );
    const collidingMoveService = new MoveService(vaultWithCollision, new InMemoryVaultFileSystem());

    expect(collidingMoveService.resolveArchiveDestination(dailyNote)).toEqual({
      path: `${ROOT}/Archive/2026-08-12 2026-08-12 16.43.01.md`,
      parentId: 'archive',
    });
  });

  it('throws when the vault has no reserved Archive folder', () => {
    const page = buildPage(`${ROOT}/Note.md`);
    const vault = makeVault([page], []);
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    expect(() => moveService.resolveArchiveDestination(page)).toThrow(/Archive folder not found/);
  });
});
