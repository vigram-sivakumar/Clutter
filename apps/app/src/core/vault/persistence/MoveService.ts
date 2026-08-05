import type { Page } from '../models/Page';
import { Vault } from '../models/Vault';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { VaultPath } from '../ingest/VaultPath';
import { resolveCollisionFreeName } from '../../shared/naming/resolveCollisionFreeName';
import { resolveFolderPathOrRoot } from './resolveFolderPathOrRoot';

export class MoveService {
  constructor(
    private readonly vault: Vault,
    private readonly fileSystem: VaultFileSystem
  ) {}

  /**
   * Computes where an archived copy of `current` should live, based on the
   * vault's reserved Archive folder. Path/parentId only — does not move
   * anything itself (see movePage).
   */
  resolveArchiveDestination(current: Page): {
    path: string;
    parentId: string;
  } {
    // ReservedResources.ts, via Vault.getReservedFolder(), is the one
    // place the Archive folder's identity/path is defined — no hardcoded
    // path literal here (ADR-023's audit found this file and
    // ArchiveMetadataReconciler.ts independently hardcoding the same
    // "${vault.root}/Archive" string).
    const archiveFolder = this.vault.getReservedFolder('archive');

    if (!archiveFolder) {
      throw new Error(`Archive folder not found: ${this.vault.root}/Archive`);
    }

    const filename = VaultPath.filename(current.path);

    return {
      path: `${archiveFolder.path}/${filename}`,
      parentId: archiveFolder.id,
    };
  }

  /**
   * Computes where an archived page should return to: its original folder
   * if it still exists, else the vault's Inbox, else the vault root.
   */
  resolveRestoreDestination(current: Page): {
    path: string;
    parentId: string | null;
  } {
    const filename = VaultPath.filename(current.path);
    const originalParentId = current.metadata.originalParentId;

    if (originalParentId !== null) {
      const originalFolder = this.vault.getFolder(originalParentId);

      if (originalFolder) {
        return {
          path: `${originalFolder.path}/${filename}`,
          parentId: originalFolder.id,
        };
      }
    }

    // Same rationale as resolveArchiveDestination above — Vault.getReservedFolder
    // is the single source, no hardcoded "Inbox" path literal.
    const inboxFolder = this.vault.getReservedFolder('inbox');

    if (inboxFolder) {
      return {
        path: `${inboxFolder.path}/${filename}`,
        parentId: inboxFolder.id,
      };
    }

    return {
      path: `${this.vault.root}/${filename}`,
      parentId: null,
    };
  }

  /**
   * Computes where `current` should live if moved into an arbitrary
   * destination folder, preserving its filename. Path/parentId only —
   * does not move anything itself (see movePage).
   */
  resolveMoveDestination(
    current: Page,
    destinationFolderId: string
  ): { path: string; parentId: string } {
    const destinationFolder = this.vault.getFolder(destinationFolderId);

    if (!destinationFolder) {
      throw new Error(`Folder not found: ${destinationFolderId}`);
    }

    const filename = VaultPath.filename(current.path);

    return {
      path: `${destinationFolder.path}/${filename}`,
      parentId: destinationFolder.id,
    };
  }

  /**
   * Computes a collision-free destination path for renaming `current` in
   * place — same parent only, never reparents. Mirrors
   * FolderPathResolver.resolveRenamePath exactly, one aggregate over; lives
   * here (not PagePathResolver, application layer) because the Persistence
   * Gate is this method's only caller, and the Gate must never depend
   * upward on the application layer (rule 7) — every other page-destination
   * resolver the Gate already uses (resolveArchiveDestination,
   * resolveRestoreDestination, resolveMoveDestination) lives in this same
   * file for the same reason.
   *
   * `current`'s own path is excluded from the collision check, so renaming
   * to the same title (a no-op) resolves to its existing path rather than
   * appending " 2" against itself.
   */
  resolveRenameDestination(
    current: Page,
    title: string
  ): { path: string; parentId: string | null } {
    const folderPath = resolveFolderPathOrRoot(this.vault, current.parentId);
    const baseName = title.trim() || current.name;

    const candidateName = resolveCollisionFreeName(baseName, (candidate) => {
      const occupant = this.vault.getPageByPath(`${folderPath}/${candidate}.md`);
      return occupant !== undefined && occupant.id !== current.id;
    });

    return {
      path: `${folderPath}/${candidateName}.md`,
      parentId: current.parentId,
    };
  }

  async movePage(current: Page, updated: Page): Promise<void> {
    const existing = this.vault.getPage(updated.id);

    if (!existing) {
      throw new Error(`Page not found: ${updated.id}`);
    }

    if (
      current.path === updated.path &&
      current.parentId === updated.parentId
    ) {
      return;
    }

    const occupant = this.vault.getPageByPath(updated.path);

    if (occupant && occupant.id !== updated.id) {
      throw new Error(`Path already in use by another page: ${updated.path}`);
    }

    if (current.path !== updated.path) {
      const destinationDirectory = VaultPath.parentDirectory(updated.path);

      if (
        destinationDirectory &&
        !(await this.fileSystem.exists(destinationDirectory))
      ) {
        await this.fileSystem.createDirectory(destinationDirectory);
      }

      await this.fileSystem.moveFile(current.path, updated.path);
    }

    this.vault.updatePagePath(updated.id, updated.path, updated.parentId);
  }
}
