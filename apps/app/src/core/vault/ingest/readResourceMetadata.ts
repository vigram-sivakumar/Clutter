import type { PageFileTimes } from '../models/effectivePageDates';
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

/**
 * A page file's birth/modification times (ADR-057), through the same tolerant
 * stat as a resource's metadata: `undefined` when the file system cannot
 * report them. Shared by the scan, Sync's reconcile and the Persistence Gate's
 * post-write refresh so the three can never disagree.
 */
export async function readPageFileTimes(
  fileSystem: VaultFileSystem,
  path: string
): Promise<PageFileTimes | undefined> {
  const metadata = await readResourceMetadata(fileSystem, path);

  return metadata ? { createdAt: metadata.createdAt, modifiedAt: metadata.modifiedAt } : undefined;
}
