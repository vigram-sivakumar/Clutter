import { describe, expect, it } from 'vitest';
import { VaultScanner } from '../ingest/VaultScanner';
import { VaultBuilder } from '../ingest/VaultBuilder';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';

const ROOT = '/vault';

/**
 * The lazy system-folder lifecycle's startup half: there is no
 * VaultInitializer anymore, and nothing else eagerly materializes a
 * reserved folder at boot. These tests exercise exactly the scan +
 * build pipeline a real Application.bootstrap() runs (VaultScanner then
 * VaultBuilder, no reserved-resource reconciliation step in between) and
 * assert the invariant directly: a fresh vault stays fresh, an existing
 * vault's reserved folders are discovered normally, and neither the
 * filesystem nor the resulting Vault gains anything that wasn't already
 * on disk.
 */
describe('Fresh app start does not create missing reserved folders', () => {
  it('a vault with only its root — no reserved folders at all on disk — builds a Vault with none, and creates nothing', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    await fileSystem.createDirectory(ROOT);

    const scanResult = await new VaultScanner(fileSystem).scan(ROOT);
    const { vault } = new VaultBuilder(new UuidGenerator()).build(scanResult);

    expect(vault.getReservedFolder('daily-notes')).toBeUndefined();
    expect(vault.getReservedFolder('archive')).toBeUndefined();
    expect(vault.getReservedFolder('inbox')).toBeUndefined();
    expect(vault.getReservedFolder('templates')).toBeUndefined();
    expect(Array.from(vault.folders())).toHaveLength(0);

    // The scan/build pipeline itself never wrote anything — confirms
    // "discover, don't materialize" holds at the filesystem level too.
    expect(await fileSystem.exists(`${ROOT}/Daily Notes`)).toBe(false);
    expect(await fileSystem.exists(`${ROOT}/Archive`)).toBe(false);
    expect(await fileSystem.exists(`${ROOT}/Inbox`)).toBe(false);
    expect(await fileSystem.exists(`${ROOT}/Templates`)).toBe(false);
    expect(await fileSystem.exists(`${ROOT}/.clutter`)).toBe(false);
  });

  it('a vault with some reserved folders already on disk (from earlier use) discovers exactly those, and does not fabricate the rest', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    await fileSystem.createDirectory(ROOT);
    await fileSystem.createDirectory(`${ROOT}/Archive`);
    await fileSystem.createDirectory(`${ROOT}/Daily Notes`);

    const scanResult = await new VaultScanner(fileSystem).scan(ROOT);
    const { vault } = new VaultBuilder(new UuidGenerator()).build(scanResult);

    expect(vault.getReservedFolder('archive')).toBeDefined();
    expect(vault.getReservedFolder('daily-notes')).toBeDefined();
    // Inbox/Templates were never created on disk in this fixture, and
    // scanning must not invent them just because other reserved folders
    // happen to exist.
    expect(vault.getReservedFolder('inbox')).toBeUndefined();
    expect(vault.getReservedFolder('templates')).toBeUndefined();
  });

  it('a vault with every reserved folder already on disk discovers all of them normally, unchanged', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    await fileSystem.createDirectory(ROOT);
    for (const name of ['Daily Notes', 'Archive', 'Inbox', 'Templates']) {
      await fileSystem.createDirectory(`${ROOT}/${name}`);
    }

    const scanResult = await new VaultScanner(fileSystem).scan(ROOT);
    const { vault } = new VaultBuilder(new UuidGenerator()).build(scanResult);

    expect(vault.getReservedFolder('daily-notes')).toBeDefined();
    expect(vault.getReservedFolder('archive')).toBeDefined();
    expect(vault.getReservedFolder('inbox')).toBeDefined();
    expect(vault.getReservedFolder('templates')).toBeDefined();
  });
});
