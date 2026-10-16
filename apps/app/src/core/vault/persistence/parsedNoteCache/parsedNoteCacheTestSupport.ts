import { InMemoryVaultFileSystem } from '../../testing/InMemoryVaultFileSystem';
import { VaultScanner, VaultBuilder } from '../../ingest';
import type { ParseMemo } from '../../ingest';
import type { IdGenerator } from '../../../shared/identity/IdGenerator';
import type { Vault } from '../../models/Vault';

export const ROOT = '/space';

/** Builds an in-memory vault filesystem with its directories registered. */
export async function makeFileSystem(
  files: Record<string, string>
): Promise<InMemoryVaultFileSystem> {
  const fileSystem = new InMemoryVaultFileSystem(files);
  await fileSystem.createDirectory(ROOT);
  for (const path of Object.keys(files)) {
    await fileSystem.createDirectory(path.slice(0, path.lastIndexOf('/')));
    // Pinned: pages now carry the file's own times (ADR-057), and two scans of the "same" files
    // must compare equal whatever the wall clock says.
    fileSystem.setFileTimes(path, {
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      modifiedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
  }
  return fileSystem;
}

export async function scan(
  files: Record<string, string>,
  memo: ParseMemo | null = null
) {
  return new VaultScanner(await makeFileSystem(files), memo).scan(ROOT);
}

/** Deterministic ids so two builds of the same scan are comparable. */
export function counterIds(): IdGenerator {
  let next = 0;
  return { generate: () => `generated-${next++}` };
}

export function build(scanResult: Awaited<ReturnType<typeof scan>>) {
  return new VaultBuilder(counterIds()).build(scanResult);
}

/** Everything the rest of the app reads from a Vault, as plain comparable values. */
export function snapshot(vault: Vault) {
  return {
    pages: [...vault.pages()],
    folders: [...vault.folders()],
    tags: [...vault.tags()],
    tasks: [...vault.tasks()],
    embeds: [...vault.embeds()],
    graph: vault.knowledgeGraph(),
  };
}
