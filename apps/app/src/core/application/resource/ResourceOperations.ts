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
  public async restoreResource(resourceId: string): Promise<void> {
    const result = await this.coordinator.enqueue(resourceId, {
      kind: 'restore-resource',
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
  ): Promise<void> {
    const result = await this.coordinator.enqueue(resourceId, {
      kind: 'move-resource',
      destinationFolderId,
    });

    if (result.status === 'abandoned') {
      throw new Error(`Resource not found: ${resourceId}`);
    }
  }
}
