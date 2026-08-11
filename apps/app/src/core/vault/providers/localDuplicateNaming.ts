import type { VaultFileSystem } from './VaultFileSystem';

const COPY_SUFFIX_PATTERN = /^(.*) copy(?: (\d+))?$/;

/**
 * "Project" -> "Project copy"; "Project copy" -> "Project copy 2";
 * "Project copy 2" -> "Project copy 3"; ... — increments an existing
 * "copy"/"copy N" suffix instead of appending a second one, so duplicating
 * an already-duplicated item never produces "Project copy copy".
 */
function nextDuplicateBaseName(name: string): string {
  const match = COPY_SUFFIX_PATTERN.exec(name);

  if (!match) {
    return `${name} copy`;
  }

  const [, base, numberText] = match;
  const nextNumber = numberText ? Number(numberText) + 1 : 2;

  return `${base} copy ${nextNumber}`;
}

/**
 * The local-disk fallback for VaultFileSystem.duplicate()'s naming
 * decision (ADR-029). No filesystem API on any platform exposes "copy
 * with an OS-chosen collision-safe name" — that convention is desktop-
 * shell (Finder/Explorer) UI logic, not a filesystem primitive — so a
 * local-disk-backed provider computes its own candidate. This is
 * provider-internal policy: Application never calls this, never sees a
 * "copy" string, and a different VaultFileSystem implementation (a
 * future remote-storage provider) is free to resolve the name a
 * completely different way (e.g. delegating to that service's own copy
 * API) without this function being involved at all.
 *
 * Shared by LocalFileSystem.ts and the canonical InMemoryVaultFileSystem
 * test double, so the fake mirrors the real provider's fallback exactly
 * (rule 4) rather than reimplementing it.
 */
export async function resolveLocalDuplicatePath(
  fileSystem: Pick<VaultFileSystem, 'exists'>,
  sourcePath: string,
  kind: 'file' | 'directory'
): Promise<string> {
  const lastSlash = sourcePath.lastIndexOf('/');
  const parentPath = sourcePath.slice(0, lastSlash);
  const fileName = sourcePath.slice(lastSlash + 1);

  const dotIndex = kind === 'file' ? fileName.lastIndexOf('.') : -1;
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : '';

  let candidateBase = nextDuplicateBaseName(baseName);
  let candidatePath = `${parentPath}/${candidateBase}${extension}`;

  while (await fileSystem.exists(candidatePath)) {
    candidateBase = nextDuplicateBaseName(candidateBase);
    candidatePath = `${parentPath}/${candidateBase}${extension}`;
  }

  return candidatePath;
}
