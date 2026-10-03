import type { VaultResourceMetadata } from '../models/VaultResource';
import type { VaultFileSystem } from '../providers/VaultFileSystem';

/**
 * The one place a filesystem `stat` becomes a resource's metadata (ADR-038),
 * shared by the startup scan and by Sync's reconciliation so the two can
 * never disagree. Tolerant by design: a provider without `stat`, or a stat
 * that fails (the file vanished between listing and reading, no permission),
 * yields `undefined` — the resource is still discovered, just without
 * metadata.
 */
export async function readResourceMetadata(
  fileSystem: VaultFileSystem,
  path: string
): Promise<VaultResourceMetadata | undefined> {
  try {
    const stat = await fileSystem.stat?.(path);

    if (!stat) {
      return undefined;
    }

    return {
      size: stat.size,
      createdAt: stat.createdAt ? stat.createdAt.toISOString() : null,
      modifiedAt: stat.modifiedAt ? stat.modifiedAt.toISOString() : null,
    };
  } catch {
    return undefined;
  }
}
