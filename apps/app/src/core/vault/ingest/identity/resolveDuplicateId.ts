import type { IdGenerator } from '../../../shared/identity/IdGenerator';

export interface ResolvedDuplicateId {
  readonly id: string;
  readonly wasReassigned: boolean;
}

/**
 * Distinguishing "genuine duplicate" from "rename/move event noise" happens
 * upstream of this function, not inside it: a rename or move is always
 * resolved against an *existing* Vault entry (Vault.updatePagePath /
 * Vault.moveFolder), never through the "this id is new to me" path that
 * calls this helper. Anywhere this runs, the id it's checking is about to
 * become a brand-new Folder/Page entry — so a collision here can only mean
 * two distinct files/directories persisted the same frontmatter `id`, i.e.
 * a genuine copy (see docs/architecture-specification.md's identity
 * determinism invariant: this is what keeps that invariant true when two
 * physical files disagree with it).
 *
 * Pure by design (no Vault/filesystem access) so both VaultBuilder's
 * initial-scan batch and VaultSyncService's incremental single-entry path
 * can share it — each supplies its own `isIdTaken` closure over whatever
 * ids it already knows about.
 */
export function resolveDuplicateId(
  candidateId: string,
  isIdTaken: (id: string) => boolean,
  idGenerator: IdGenerator
): ResolvedDuplicateId {
  if (!isIdTaken(candidateId)) {
    return { id: candidateId, wasReassigned: false };
  }

  let id = idGenerator.generate();

  while (isIdTaken(id)) {
    id = idGenerator.generate();
  }

  return { id, wasReassigned: true };
}
