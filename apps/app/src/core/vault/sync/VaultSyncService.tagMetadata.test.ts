import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VaultSyncService } from './VaultSyncService';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { FakeVaultFileSystemWatcher } from '../testing/FakeVaultFileSystemWatcher';
import { FakeIdGenerator } from '../testing/FakeIdGenerator';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { TagMetadataStore } from '../persistence/TagMetadataStore';
import { SelfWriteRegistry } from '../providers/SelfWriteRegistry';
import { SelfWriteAwareFileSystem } from '../providers/SelfWriteAwareFileSystem';
import { SelfWriteAwareWatcher } from '../providers/SelfWriteAwareWatcher';

const ROOT = '/vault';
const TAGS = `${ROOT}/.clutter/tags.json`;

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

function setup() {
  const raw = new InMemoryVaultFileSystem();
  const registry = new SelfWriteRegistry();
  const fileSystem = new SelfWriteAwareFileSystem(raw, registry, ROOT);
  const rawWatcher = new FakeVaultFileSystemWatcher();
  const watcher = new SelfWriteAwareWatcher(rawWatcher, registry);
  const store = new TagMetadataStore(fileSystem, ROOT);
  const vault = new Vault(ROOT, [], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const writes: string[] = [];
  const originalWrite = raw.writeFile.bind(raw);
  raw.writeFile = async (path, contents) => {
    writes.push(path);
    return originalWrite(path, contents);
  };

  new VaultSyncService(
    vault,
    fileSystem,
    watcher,
    new DocumentRegistry(),
    new FrontmatterSerializer(),
    new FakeIdGenerator(),
    store
  );

  return { raw, fileSystem, rawWatcher, store, vault, writes };
}

const names = (vault: Vault) => [...vault.tags()].map((tag) => tag.name);

describe('VaultSyncService — external .clutter/tags.json changes', () => {
  it('an external edit reloads the definitions and the tag collection updates', async () => {
    const { raw, rawWatcher, vault } = setup();
    await raw.createDirectory(`${ROOT}/.clutter`);
    await raw.writeFile(TAGS, '{"version":2,"tags":{"design":{"icon":"🎨"},"research":{}}}');

    rawWatcher.emit({ type: 'changed', path: '.clutter/tags.json' });
    await flush();

    expect(names(vault)).toEqual(['design', 'research']);
    expect([...vault.tags()][0]!.icon).toBe('🎨');
  });

  it('a creation, a rename onto the file (an atomic write by another tool) and a deletion are all handled', async () => {
    const { raw, rawWatcher, vault } = setup();
    await raw.createDirectory(`${ROOT}/.clutter`);

    await raw.writeFile(TAGS, '{"tags":{"a":{}}}');
    rawWatcher.emit({ type: 'created', path: '.clutter/tags.json', isDirectory: false });
    await flush();
    expect(names(vault)).toEqual(['a']);

    await raw.writeFile(`${TAGS}.tmp`, '{"tags":{"b":{}}}');
    await raw.moveFile(`${TAGS}.tmp`, TAGS);
    rawWatcher.emit({ type: 'moved', fromPath: '.clutter/tags.json.tmp', toPath: '.clutter/tags.json' });
    await flush();
    expect(names(vault)).toEqual(['b']);

    await raw.deleteFile(TAGS);
    rawWatcher.emit({ type: 'deleted', path: '.clutter/tags.json' });
    await flush();
    expect(names(vault)).toEqual([]);
  });

  it('a corrupt external edit never breaks the vault: definitions become empty and the bytes are backed up', async () => {
    const { raw, rawWatcher, vault, store } = setup();
    await store.update(() => new Map([['design', {}]]));
    vault.setTagMetadata(await store.load());

    await raw.writeFile(TAGS, '{ not json');
    rawWatcher.emit({ type: 'changed', path: '.clutter/tags.json' });
    await flush();

    expect(names(vault)).toEqual([]);
    const backups = (await raw.readDirectory(`${ROOT}/.clutter`)).filter((e) => e.name.includes('.corrupt-'));
    expect(backups).toHaveLength(1);
    expect(await raw.readFile(TAGS)).toBe('{ not json');
  });

  it('does not loop on its own write: the echo of an app write finds identical definitions and writes nothing', async () => {
    const { rawWatcher, store, vault, writes } = setup();

    const next = await store.update(() => new Map([['design', { icon: '🎨' }]]));
    vault.setTagMetadata(next);
    const writesAfterOwnUpdate = writes.length;

    // The watcher reports the temp file and the rename onto tags.json — the echo of that write.
    rawWatcher.emit({ type: 'created', path: '.clutter/tags.json.tmp', isDirectory: false });
    rawWatcher.emit({ type: 'moved', fromPath: '.clutter/tags.json.tmp', toPath: '.clutter/tags.json' });
    // …and, on platforms that split a rename into halves, a bare "created".
    rawWatcher.emit({ type: 'created', path: '.clutter/tags.json', isDirectory: false });
    rawWatcher.emit({ type: 'changed', path: '.clutter/tags.json' });
    await flush();
    await flush();

    expect(writes.length).toBe(writesAfterOwnUpdate);
    expect(names(vault)).toEqual(['design']);
  });

  it('an unchanged reload does not notify subscribers', async () => {
    const { rawWatcher, store, vault } = setup();
    vault.setTagMetadata(await store.update(() => new Map([['design', {}]])));
    const listener = vi.fn();
    vault.subscribe(listener);

    rawWatcher.emit({ type: 'changed', path: '.clutter/tags.json' });
    await flush();

    expect(listener).not.toHaveBeenCalled();
  });

  it('other .clutter files are still ignored', async () => {
    const { raw, rawWatcher, vault } = setup();
    await raw.createDirectory(`${ROOT}/.clutter`);
    await raw.writeFile(TAGS, '{"tags":{"design":{}}}');

    rawWatcher.emit({ type: 'changed', path: '.clutter/workspace.json' });
    await flush();

    expect(names(vault)).toEqual([]);
  });
});
