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
});
