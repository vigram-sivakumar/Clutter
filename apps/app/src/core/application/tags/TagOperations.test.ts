import { describe, expect, it } from 'vitest';
import { TagOperations } from './TagOperations';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

function makeVault(): Vault {
  return new Vault(
    '/vault',
    [],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

describe('TagOperations.updateMetadata', () => {
  it('creates .clutter/tags.json with a normalized key on first assignment', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const vault = makeVault();
    const operations = new TagOperations(vault, fileSystem, '/vault');

    await operations.updateMetadata('Project', { icon: '📦' });

    const written = JSON.parse(fileSystem.getFileSync('/vault/.clutter/tags.json')!);
    expect(written).toEqual({ tags: { project: { icon: '📦' } } });
    expect([...vault.tags()]).toEqual([]); // no occurrence anywhere — no Tag manufactured
  });

  it('merges a patch into an existing entry rather than replacing it', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      '/vault/.clutter/tags.json': JSON.stringify({ tags: { project: { icon: '📦' } } }),
    });
    const vault = makeVault();
    const operations = new TagOperations(vault, fileSystem, '/vault');

    await operations.updateMetadata('project', { icon: '🚀' });

    const written = JSON.parse(fileSystem.getFileSync('/vault/.clutter/tags.json')!);
    expect(written).toEqual({ tags: { project: { icon: '🚀' } } });
  });

  it('removes the entry entirely when every field is cleared', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      '/vault/.clutter/tags.json': JSON.stringify({ tags: { project: { icon: '📦' } } }),
    });
    const vault = makeVault();
    const operations = new TagOperations(vault, fileSystem, '/vault');

    await operations.updateMetadata('project', { icon: undefined });

    const written = JSON.parse(fileSystem.getFileSync('/vault/.clutter/tags.json')!);
    expect(written).toEqual({ tags: {} });
  });

  it('normalizes hand-edited mixed-case keys on read', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      '/vault/.clutter/tags.json': JSON.stringify({ tags: { Project: { icon: '📦' } } }),
    });
    const vault = makeVault();
    const operations = new TagOperations(vault, fileSystem, '/vault');

    await operations.updateMetadata('project', { icon: '🚀' });

    const written = JSON.parse(fileSystem.getFileSync('/vault/.clutter/tags.json')!);
    expect(written).toEqual({ tags: { project: { icon: '🚀' } } });
  });

  it('pushes the new metadata into Vault via setTagMetadata', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const vault = makeVault();
    const operations = new TagOperations(vault, fileSystem, '/vault');
    const setTagMetadataSpy = vault.setTagMetadata.bind(vault);
    let capturedMetadata: ReadonlyMap<string, unknown> | undefined;
    vault.setTagMetadata = (metadata) => {
      capturedMetadata = metadata;
      setTagMetadataSpy(metadata);
    };

    await operations.updateMetadata('project', { icon: '📦' });

    expect(capturedMetadata?.get('project')).toEqual({ icon: '📦' });
  });
});
