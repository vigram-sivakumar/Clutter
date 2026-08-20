import { describe, expect, it } from 'vitest';
import { PagePathResolver } from './PagePathResolver';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
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

function makePage(id: string, path: string): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: 'Existing content',
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

function makeVault(pages: Page[] = [], folders: Folder[] = []): Vault {
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

describe('PagePathResolver.createNotePath', () => {
  it('resolves a note at the vault root when folderId is null', () => {
    const vault = makeVault();
    const resolver = new PagePathResolver(vault);

    const result = resolver.createNotePath(null, 'Untitled');

    expect(result).toEqual({ path: `${ROOT}/Untitled.md`, parentId: null });
  });

  it('resolves a note inside a named folder', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([], [folder]);
    const resolver = new PagePathResolver(vault);

    const result = resolver.createNotePath('folder-1', 'Idea');

    expect(result).toEqual({ path: `${ROOT}/Projects/Idea.md`, parentId: 'folder-1' });
  });

  it('throws for an unknown folderId', () => {
    const vault = makeVault();
    const resolver = new PagePathResolver(vault);

    expect(() => resolver.createNotePath('does-not-exist', 'Idea')).toThrow(
      /Folder not found: does-not-exist/
    );
  });

  it('falls back to "Untitled" for a blank or whitespace-only title', () => {
    const vault = makeVault();
    const resolver = new PagePathResolver(vault);

    expect(resolver.createNotePath(null, '')).toEqual({
      path: `${ROOT}/Untitled.md`,
      parentId: null,
    });
    expect(resolver.createNotePath(null, '   ')).toEqual({
      path: `${ROOT}/Untitled.md`,
      parentId: null,
    });
  });

  it('picks the next free numbered name when one collision exists', () => {
    const existing = makePage('page-1', `${ROOT}/Untitled.md`);
    const vault = makeVault([existing]);
    const resolver = new PagePathResolver(vault);

    const result = resolver.createNotePath(null, 'Untitled');

    expect(result).toEqual({ path: `${ROOT}/Untitled 2.md`, parentId: null });
  });

  it('picks the next free numbered name when multiple collisions exist', () => {
    const existing = [
      makePage('page-1', `${ROOT}/Untitled.md`),
      makePage('page-2', `${ROOT}/Untitled 2.md`),
      makePage('page-3', `${ROOT}/Untitled 3.md`),
    ];
    const vault = makeVault(existing);
    const resolver = new PagePathResolver(vault);

    const result = resolver.createNotePath(null, 'Untitled');

    expect(result).toEqual({ path: `${ROOT}/Untitled 4.md`, parentId: null });
  });

  // Regression test: macOS (APFS) and Windows (NTFS) are case-insensitive
  // on disk — "untitled.md" and "Untitled.md" are the same file — but this
  // resolver's isTaken check used to be a case-sensitive vault.getPageByPath
  // lookup, so a differently-cased title sailed past it as "free" and the
  // resulting mkdir/writeFile would have silently collided with (and
  // corrupted) the existing file on a real disk.
  it('treats a case-variant of an existing title as a collision', () => {
    const existing = makePage('page-1', `${ROOT}/Untitled.md`);
    const vault = makeVault([existing]);
    const resolver = new PagePathResolver(vault);

    const result = resolver.createNotePath(null, 'UNTITLED');

    expect(result).toEqual({ path: `${ROOT}/UNTITLED 2.md`, parentId: null });
  });
});
