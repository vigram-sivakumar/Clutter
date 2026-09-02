import { describe, expect, it } from 'vitest';
import { VaultBuilder } from './VaultBuilder';
import type { IdGenerator } from '../../shared/identity/IdGenerator';

function makeIdGenerator(...ids: string[]): IdGenerator {
  let index = 0;
  return {
    generate: () => ids[index++] ?? `generated-${index}`,
  };
}

describe('VaultBuilder folders', () => {
  it('preserves folder identity and metadata from folder frontmatter', () => {
    const builder = new VaultBuilder(makeIdGenerator());

    const { vault } = builder.build({
      rootPath: '/vault',
      pages: [],
      files: [],
      directories: [
        {
          path: '/vault/Projects',
          parentPath: '/vault',
          frontmatter: {
            id: 'folder-123',
            icon: '📁',
            favorite: true,
            description: 'Project files',
            cover: 'cover.png',
            status: 'archived',
            archivedAt: '2026-01-01T00:00:00.000Z',
            originalPath: '/vault/OldProjects',
            originalParentId: 'parent-123',
          },
        },
      ],
    });

const folder = Array.from(vault.folders())[0];

    expect(folder).toBeDefined();
    expect(folder!.id).toBe('folder-123');
    expect(folder!.metadata.icon).toBe('📁');
    expect(folder!.metadata.favorite).toBe(true);
    expect(folder!.metadata.description).toBe('Project files');
    expect(folder!.metadata.cover).toBe('cover.png');
    expect(folder!.metadata.status).toBe('archived');
    expect(folder!.metadata.archivedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(folder!.metadata.originalPath).toBe('/vault/OldProjects');
    expect(folder!.metadata.originalParentId).toBe('parent-123');
  });
});

function scannedPage(path: string, id: string) {
  return {
    path,
    directoryPath: '/vault',
    frontmatter: { id },
    frontmatterAnalysis: { aliases: [] },
    content: 'content',
    analysis: {
      headings: [],
      blockReferences: [],
      tasks: [],
      tags: [],
      links: [],
      embeds: [],
    },
  };
}

describe('VaultBuilder duplicate ids', () => {
  it('assigns a fresh id to a genuine duplicate discovered during the initial scan, keeping the first page\'s id intact', () => {
    const builder = new VaultBuilder(makeIdGenerator('page-fresh'));

    const { vault, reassignedPagePaths } = builder.build({
      rootPath: '/vault',
      directories: [],
      files: [],
      pages: [
        scannedPage('/vault/Original.md', 'dup-1'),
        scannedPage('/vault/Copy.md', 'dup-1'),
      ],
    });

    const original = vault.getPageByPath('/vault/Original.md')!;
    const copy = vault.getPageByPath('/vault/Copy.md')!;

    expect(original.id).toBe('dup-1');
    expect(copy.id).toBe('page-fresh');
    expect(copy.id).not.toBe(original.id);
    expect(reassignedPagePaths.has('/vault/Copy.md')).toBe(true);
    expect(reassignedPagePaths.has('/vault/Original.md')).toBe(false);
    expect(vault.pageCount).toBe(2);
  });

  it('assigns a fresh id to a genuine duplicate folder discovered during the initial scan, keeping the first folder\'s id intact', () => {
    const builder = new VaultBuilder(makeIdGenerator('folder-fresh'));

    const { vault, reassignedFolderPaths } = builder.build({
      rootPath: '/vault',
      pages: [],
      files: [],
      directories: [
        { path: '/vault/Original', parentPath: '/vault', frontmatter: { id: 'dup-folder' } },
        { path: '/vault/Copy', parentPath: '/vault', frontmatter: { id: 'dup-folder' } },
      ],
    });

    const original = vault.getFolderByPath('/vault/Original')!;
    const copy = vault.getFolderByPath('/vault/Copy')!;

    expect(original.id).toBe('dup-folder');
    expect(copy.id).toBe('folder-fresh');
    expect(copy.id).not.toBe(original.id);
    expect(reassignedFolderPaths.has('/vault/Copy')).toBe(true);
    expect(reassignedFolderPaths.has('/vault/Original')).toBe(false);
    expect(vault.folderCount).toBe(2);
  });
});

function scannedFile(path: string, directoryPath: string, kind: 'pdf' | 'image') {
  return { path, directoryPath, kind };
}

describe('VaultBuilder resources', () => {
  it('turns a scanned image file into a vault resource, not a page', () => {
    const builder = new VaultBuilder(makeIdGenerator());

    const { vault } = builder.build({
      rootPath: '/vault',
      directories: [],
      pages: [],
      files: [scannedFile('/vault/Cover.png', '/vault', 'image')],
    });

    expect(vault.resourceCount).toBe(1);
    expect(vault.pageCount).toBe(0);

    const resource = vault.getResourceByPath('/vault/Cover.png');
    expect(resource).toBeDefined();
    expect(resource!.kind).toBe('image');
  });

  it('turns a scanned pdf file into a vault resource, not a page', () => {
    const builder = new VaultBuilder(makeIdGenerator());

    const { vault } = builder.build({
      rootPath: '/vault',
      directories: [],
      pages: [],
      files: [scannedFile('/vault/Report.pdf', '/vault', 'pdf')],
    });

    expect(vault.resourceCount).toBe(1);
    expect(vault.pageCount).toBe(0);

    const resource = vault.getResourceByPath('/vault/Report.pdf');
    expect(resource).toBeDefined();
    expect(resource!.kind).toBe('pdf');
  });

  it('keeps markdown pages as pages when resources are present in the same scan', () => {
    const builder = new VaultBuilder(makeIdGenerator());

    const { vault } = builder.build({
      rootPath: '/vault',
      directories: [],
      pages: [scannedPage('/vault/Idea.md', 'page-1')],
      files: [scannedFile('/vault/Cover.png', '/vault', 'image')],
    });

    expect(vault.pageCount).toBe(1);
    expect(vault.resourceCount).toBe(1);
    expect(vault.getPageByPath('/vault/Idea.md')).toBeDefined();
    expect(vault.getResourceByPath('/vault/Cover.png')).toBeDefined();
  });

  it('assigns a resource the id of its containing folder as parentId', () => {
    const builder = new VaultBuilder(makeIdGenerator());

    const { vault } = builder.build({
      rootPath: '/vault',
      directories: [
        { path: '/vault/Assets', parentPath: '/vault', frontmatter: { id: 'assets-folder' } },
      ],
      pages: [],
      files: [scannedFile('/vault/Assets/Cover.png', '/vault/Assets', 'image')],
    });

    const resource = vault.getResourceByPath('/vault/Assets/Cover.png');
    expect(resource!.parentId).toBe('assets-folder');
  });

  it('assigns a null parentId to a resource scanned at the vault root', () => {
    const builder = new VaultBuilder(makeIdGenerator());

    const { vault } = builder.build({
      rootPath: '/vault',
      directories: [],
      pages: [],
      files: [scannedFile('/vault/Cover.png', '/vault', 'image')],
    });

    expect(vault.getResourceByPath('/vault/Cover.png')!.parentId).toBeNull();
  });

  it('derives resource identity from its path, consistent with the path-derived identity convention', () => {
    const builder = new VaultBuilder(makeIdGenerator());

    const { vault } = builder.build({
      rootPath: '/vault',
      directories: [],
      pages: [],
      files: [scannedFile('/vault/Cover.png', '/vault', 'image')],
    });

    expect(vault.getResourceByPath('/vault/Cover.png')!.id).toBe('/vault/Cover.png');
  });

  it('represents multiple resources in the same folder independently', () => {
    const builder = new VaultBuilder(makeIdGenerator());

    const { vault } = builder.build({
      rootPath: '/vault',
      directories: [],
      pages: [],
      files: [
        scannedFile('/vault/Cover.png', '/vault', 'image'),
        scannedFile('/vault/Report.pdf', '/vault', 'pdf'),
      ],
    });

    expect(vault.resourceCount).toBe(2);
    expect(vault.getResourceByPath('/vault/Cover.png')!.kind).toBe('image');
    expect(vault.getResourceByPath('/vault/Report.pdf')!.kind).toBe('pdf');
  });

  it('does not duplicate resources when built once from a single scan result', () => {
    const builder = new VaultBuilder(makeIdGenerator());

    const { vault } = builder.build({
      rootPath: '/vault',
      directories: [],
      pages: [],
      files: [scannedFile('/vault/Cover.png', '/vault', 'image')],
    });

    expect(vault.resourceCount).toBe(1);
    expect(Array.from(vault.resources())).toHaveLength(1);
  });

  it('registers no resources when scanResult.files is empty (unsupported files never reach VaultBuilder)', () => {
    const builder = new VaultBuilder(makeIdGenerator());

    const { vault } = builder.build({
      rootPath: '/vault',
      directories: [],
      pages: [],
      files: [],
    });

    expect(vault.resourceCount).toBe(0);
  });
});
