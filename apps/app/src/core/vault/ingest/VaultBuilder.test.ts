import { describe, expect, it } from 'vitest';
import { VaultBuilder } from './VaultBuilder';


describe('VaultBuilder folders', () => {
  it('preserves folder identity and metadata from folder frontmatter', () => {
    const builder = new VaultBuilder();

    const vault = builder.build({
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
