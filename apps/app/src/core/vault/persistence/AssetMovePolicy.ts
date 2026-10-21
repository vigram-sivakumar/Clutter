import type { VaultResource } from '../models/VaultResource';
import { moveZoneOfPath } from '../initialize/ReservedResources';

/**
 * One file about to move: what it is, and the absolute path it will have once the move is done.
 */
export interface AssetMoveStep {
  readonly resource: VaultResource;
  readonly newPath: string;
}

/** What is wrong with a reference that kept a move from going ahead. Nothing was changed when one of these is given. */
export type AssetMoveRefusalReason =
  /** A reference points at the file, but is not spelled as its exact vault-relative path (`./…`, percent-encoded). It cannot be rewritten with confidence. */
  | 'unsupported-spelling'
  /** A note that needs its references updated was changed outside Clutter since Clutter last read it, and is never overwritten. */
  | 'changed-on-disk'
  /** A new, never-saved note uses the file, and there is no saved text to update. */
  | 'unsaved-draft'
  /** A folder that cannot be edited (it is archived) uses the file as its cover. */
  | 'archived-folder'
  /** The new path has characters the reference's own syntax cannot carry. */
  | 'unrepresentable-path'
  /** What uses the file could not be worked out. */
  | 'scan-failed';

/** One place whose reference could not be updated after the file had moved. */
export interface AssetReferenceFailure {
  readonly kind: 'note' | 'folder' | 'avatar';
  /** The note's or folder's id; empty for the avatar. */
  readonly id: string;
  /** Where it lives, to find it by (a note's path, a folder's path). */
  readonly path: string;
  readonly usage: 'text' | 'cover' | 'avatar';
  readonly message: string;
}

/**
 * What updating the references after a move did. The move itself is not undone when some update fails: this says what
 * moved and what still points at the old place, so each can be fixed (or the updates run again — they are idempotent).
 */
export interface AssetMoveReferenceSummary {
  /** Every file that moved: vault-relative old and new paths. */
  readonly moves: readonly { readonly from: string; readonly to: string }[];
  /** How many places (notes, folder covers, the avatar) now point at the new paths. */
  readonly updated: number;
  readonly failed: readonly AssetReferenceFailure[];
  /** True when nothing is left pointing at an old path. */
  readonly complete: boolean;
}

/** What a menu-driven asset move reports back to the user, from wherever it was started. */
export type AssetMoveFeedback =
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'incomplete'; readonly summary: AssetMoveReferenceSummary };

export const NO_REFERENCE_UPDATES: AssetMoveReferenceSummary = { moves: [], updated: 0, failed: [], complete: true };

/**
 * The references to the files about to move, found and checked BEFORE anything moves. `commit` updates them after the
 * files have moved, through the existing note, folder and profile edits. Nothing is rewritten before the move.
 */
export interface AssetMovePlan {
  /** How many places point at the files (0 when nothing does, and `commit` has nothing to do). */
  readonly referenceCount: number;
  commit(): Promise<AssetMoveReferenceSummary>;
}

/**
 * The Space's say over assets leaving Assets (ADR-049, amended). Supplied to the Move services by whoever owns the Space
 * (the Application): the domain layer asks it, so the answer does not depend on which menu — or which caller — asked.
 */
export interface AssetMovePolicy {
  /** Whether this Space lets assets and asset folders move into the workspace's ordinary folders. Off by default. */
  allowOutsideAssets(): boolean;
  /**
   * Finds everything that points at these files and checks each can be rewritten with confidence. Throws
   * `AssetMoveRefusedError` — before the filesystem is touched — when it cannot be established that they all can.
   */
  prepareReferenceUpdates(steps: readonly AssetMoveStep[]): Promise<AssetMovePlan>;
}

/** Today's rule, and what any Move service built without a Space uses: assets stay in Assets. */
export const ASSETS_STAY_IN_ASSETS: AssetMovePolicy = {
  allowOutsideAssets: () => false,
  prepareReferenceUpdates: async () => ({ referenceCount: 0, commit: async () => NO_REFERENCE_UPDATES }),
};

/** A move was refused because what uses the file(s) could not be kept pointing at them. Nothing was changed. */
export class AssetMoveRefusedError extends Error {
  constructor(
    readonly reason: AssetMoveRefusalReason,
    readonly subject: string,
    /** Where the problem is, when there is one place to point at (a note's path, a reference as written). */
    readonly detail?: string
  ) {
    super(describeRefusal(reason, subject, detail));
    this.name = 'AssetMoveRefusedError';
  }
}

function describeRefusal(reason: AssetMoveRefusalReason, subject: string, detail?: string): string {
  const at = detail ? ` (${detail})` : '';

  switch (reason) {
    case 'unsupported-spelling':
      return `${subject} can’t be moved out of Assets: a note refers to it in a way Clutter can’t update safely${at}. Nothing was moved`;
    case 'changed-on-disk':
      return `${subject} can’t be moved out of Assets yet: a note that uses it was changed outside Clutter${at}. Nothing was moved`;
    case 'unsaved-draft':
      return `${subject} can’t be moved out of Assets: a new note that hasn’t been saved yet uses it. Nothing was moved`;
    case 'archived-folder':
      return `${subject} can’t be moved out of Assets: an archived folder uses it as its cover${at}. Nothing was moved`;
    case 'unrepresentable-path':
      return `${subject} can’t be moved to that folder without breaking a reference: its new name has characters a reference can’t hold${at}. Nothing was moved`;
    case 'scan-failed':
      return `${subject} can’t be moved out of Assets: Clutter couldn’t check what uses it. Nothing was moved`;
  }
}

/**
 * Whether a move changes the hierarchy an asset lives in: anything but Assets to Assets. Such a move is where the
 * references are updated.
 */
export function leavesOrEntersWorkspace(vaultRoot: string, fromPath: string, toPath: string): boolean {
  return moveZoneOfPath(vaultRoot, fromPath) !== 'assets' || moveZoneOfPath(vaultRoot, toPath) !== 'assets';
}

/**
 * The one rule for where an asset (or an asset folder) may go. Inside Assets, always — today's behavior. Into Assets,
 * always, as before. Into the workspace, only when the Space allows it. (That references survive is the next step,
 * `prepareReferenceUpdates`, which the Gate runs before it moves anything.) Called by every resolver of an asset's
 * destination (`MoveService`, `FolderPathResolver`), so no menu or caller can bypass it.
 */
export function assertAssetsMayMoveTo(
  policy: AssetMovePolicy,
  vaultRoot: string,
  destinationPath: string,
  // A file or a folder: only a folder may be moved to the vault root, the same rule everything in Clutter follows.
  { isFolder }: { readonly isFolder: boolean }
): void {
  if (moveZoneOfPath(vaultRoot, destinationPath) === 'assets') {
    return;
  }

  if (!policy.allowOutsideAssets()) {
    // The same refusal as before the setting existed.
    throw new Error(`Cannot move into ${destinationPath}: this item can only be moved within assets`);
  }

  if (destinationPath === vaultRoot && !isFolder) {
    throw new Error('Cannot move a file into the vault root: only folders can be moved there');
  }
}
