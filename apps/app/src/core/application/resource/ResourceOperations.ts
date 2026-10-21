import {
  AssetMoveRefusedError,
  type AssetMoveFeedback,
  type AssetMoveReferenceSummary,
} from '../../vault/persistence/AssetMovePolicy';
import type { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';

/**
 * The application-layer facade for VaultResource (image/pdf) mutations —
 * the resource-scoped counterpart to PageOperations/FolderOperations,
 * scoped for now to exactly the capabilities the Persistence Gate backs
 * (rename-resource/archive-resource/restore-resource/delete-resource/
 * move-resource). No create/favorite yet, per the approved Resource
 * mutation scope — those are not implemented here because no Gate
 * operation kind for them exists yet, not because this class chose to
 * omit them.
 *
 * Deliberately thinner than PageOperations/FolderOperations: every method
 * here is an unconditional forward to `coordinator.enqueue()` plus the
 * shared abandoned-status check below — there is no synchronous
 * collision pre-check (unlike PageOperations.rename()/FolderOperations.
 * rename(), which reject an exact collision before ever reaching the
 * Gate, per their own "explicit rename rejects a duplicate" product
 * decision) and no Vault lookup of its own. Resource rename intentionally
 * keeps the Gate's own auto-suffix collision behavior
 * (MoveService.resolveResourceRenameDestination) rather than gaining a
 * reject-on-collision layer in front of it — a resource has no
 * equivalent "must not silently rename" product decision the way a
 * user-authored Note/Folder title does. Destination resolution, collision
 * handling, the filesystem move, `.clutter/resource-archive.json`
 * provenance, and the Vault mutation all live in the Gate
 * (PagePersistenceCoordinator's runRenameResource/runArchiveResource/
 * runRestoreResource, backed by MoveService's resource-scoped resolvers
 * and resolveResourceRestoreDestination) — this class holds none of that
 * logic, only the id/name -> PersistenceOperation translation and the
 * one error-reporting convention below.
 */
export class ResourceOperations {
  /** Told when a move out of Assets was refused, or moved the file but could not update everything that points at it. */
  public assetMoveFeedback?: (feedback: AssetMoveFeedback) => void;

  constructor(private readonly coordinator: PagePersistenceCoordinator) {}

  /**
   * Renames a VaultResource in place. `name` is passed through unchanged
   * to the Gate's 'rename-resource' kind — MoveService.
   * resolveResourceRenameDestination() is what strips any typed extension
   * and appends the resource's own real one (never the caller's), and what
   * auto-suffixes on a collision; neither happens here.
   */
  public async renameResource(resourceId: string, name: string): Promise<void> {
    const result = await this.coordinator.enqueue(resourceId, {
      kind: 'rename-resource',
      title: name,
    });

    if (result.status === 'abandoned') {
      throw new Error(`Resource not found: ${resourceId}`);
    }
  }

  /**
   * Archives a VaultResource — relocates it into the reserved Archive/
   * folder and records its provenance, entirely inside the Gate's
   * 'archive-resource' dispatch. No existence check of its own; the same
   * `abandoned` convention below reports a missing resource.
   */
  public async archiveResource(resourceId: string): Promise<void> {
    const result = await this.coordinator.enqueue(resourceId, {
      kind: 'archive-resource',
    });

    if (result.status === 'abandoned') {
      throw new Error(`Resource not found: ${resourceId}`);
    }
  }

  /**
   * Restores a VaultResource from Archive/ — original path, or the
   * managed Assets/ folder if the original parent or provenance record is
   * gone, entirely resolved and applied inside the Gate's
   * 'restore-resource' dispatch (resolveResourceRestoreDestination). No
   * existence check of its own, same convention as archiveResource().
   */
  public async restoreResource(
    resourceId: string,
    options: { readonly destinationFolderId?: string | null } = {}
  ): Promise<void> {
    // Rejects with RestoreNeedsDestinationError for a file put in Archive/ from outside Clutter (no
    // recorded original location) until the caller supplies a destination within Assets.
    const result = await this.coordinator.enqueue(resourceId, {
      kind: 'restore-resource',
      ...(options.destinationFolderId !== undefined && { destinationFolderId: options.destinationFolderId }),
    });

    if (result.status === 'abandoned') {
      throw new Error(`Resource not found: ${resourceId}`);
    }
  }

  /**
   * Permanently deletes a resource — entirely inside the Gate's
   * 'delete-resource' dispatch (filesystem delete, archive-provenance
   * cleanup, Vault removal). No existence/archived-status check of its
   * own, same convention as the other three methods: the restriction that
   * this is only reachable for an archived resource is enforced by the UI
   * never exposing it elsewhere (the archived-resource hover action is the
   * only caller), not by this method.
   */
  public async deleteResource(resourceId: string): Promise<void> {
    const result = await this.coordinator.enqueue(resourceId, {
      kind: 'delete-resource',
    });

    if (result.status === 'abandoned') {
      throw new Error(`Resource not found: ${resourceId}`);
    }
  }

  /**
   * Moves a VaultResource into an arbitrary destination folder (`null` =
   * vault root) — the resource-scoped counterpart to PageOperations.move()/
   * FolderOperations.move(), one aggregate over. Same unconditional-forward
   * shape as every other method here: destination resolution, collision
   * handling, the filesystem move, and the Vault mutation all live in the
   * Gate's 'move-resource' dispatch (MoveService.resolveResourceMoveDestination).
   */
  public async moveResource(
    resourceId: string,
    destinationFolderId: string | null
  ): Promise<AssetMoveReferenceSummary | undefined> {
    let result;

    try {
      result = await this.coordinator.enqueue(resourceId, {
        kind: 'move-resource',
        destinationFolderId,
      });
    } catch (error) {
      // A move refused because references could not be kept pointing at the file is explained to the user, wherever the
      // menu was — and still thrown, for any caller that wants to know.
      if (error instanceof AssetMoveRefusedError) {
        this.assetMoveFeedback?.({ kind: 'refused', message: error.message });
      }
      throw error;
    }

    if (result.status === 'abandoned') {
      throw new Error(`Resource not found: ${resourceId}`);
    }

    // Set only for a move out of, or back into, Assets: what happened to the references to the file. Not hidden
    // when something could not be updated — the caller is told, since the file has already moved.
    const summary = result.status === 'resource-moved' ? result.referenceUpdate : undefined;

    if (summary && !summary.complete) {
      this.assetMoveFeedback?.({ kind: 'incomplete', summary });
    }

    return summary;
  }
}
