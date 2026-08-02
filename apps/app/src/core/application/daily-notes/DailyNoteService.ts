import type { Vault } from '../../vault/models/Vault';
import type { Folder } from '../../vault/models/Folder';
import type { FolderOperations } from '../folder/FolderOperations';

/**
 * Owns the Daily Notes filesystem convention.
 *
 * This service is responsible only for the filesystem conventions around
 * Daily Notes — materializing the required folder hierarchy in the Vault
 * at persist time (ADR-019). It does not create the note itself (ADR-017):
 * that is PageOperations.openAtPath()'s job, same resolve-or-draft
 * mechanism as every other entry point, so today's note is never eagerly
 * persisted through the Gate just because the app was opened.
 *
 * Responsibilities:
 * - Ensure the required year/month folder hierarchy exists, at persist time.
 *
 * Does NOT:
 * - Scan the vault.
 * - Build domain models.
 * - Open pages.
 * - Modify the workspace.
 * - Create or persist a page (ADR-017 — see PageOperations.openAtPath()).
 * - Scaffold a directory ahead of the startup scan (ADR-019 retired
 *   ensureDirectoryForToday() — folder materialization happens only here,
 *   via ensureFolderChain, at the moment of an actual save).
 */
export class DailyNoteService {
  /**
   * Ensures the year/month Folder chain exists in the Vault for a Daily
   * Note at `dailyNotePath` (an absolute path following DailyNotePath's
   * convention), creating whichever level is missing via FolderOperations
   * — the same Folder infrastructure the Create Folder milestone built,
   * not a second write path. Returns the month folder's id, for the
   * caller to use as the Daily Note's parentId.
   *
   * Takes vault/folderOperations as parameters rather than constructor
   * dependencies: this method's natural moment is after attachVault, when
   * a real FolderOperations exists — DailyNoteService stays stateless, so
   * there's no need to construct it any differently for that.
   *
   * Called at persist time (PageOperations.persistDraft), never at
   * draft-open time — creating a real Folder is durable knowledge, and
   * ADR-017's governing principle is that navigation alone must never
   * produce it, only an actual save.
   *
   * Check-then-create at each level: FolderOperations.create() is not
   * idempotent — it always creates something, appending a collision
   * suffix if the name is taken — so an already-existing level must never
   * be blindly re-created.
   */
  async ensureFolderChain(
    vault: Vault,
    folderOperations: FolderOperations,
    dailyNotePath: string
  ): Promise<string> {
    const dailyNotesRoot = vault.getReservedFolder('daily-notes');

    if (!dailyNotesRoot) {
      throw new Error(
        'Daily Notes root folder is missing — VaultInitializer should have created it.'
      );
    }

    const relative = dailyNotePath.slice(dailyNotesRoot.path.length + 1);
    const [yearName, monthName] = relative.split('/');

    if (!yearName || !monthName) {
      throw new Error(`Malformed Daily Note path: ${dailyNotePath}`);
    }

    const yearFolder = await this.ensureChildFolder(
      vault,
      folderOperations,
      dailyNotesRoot,
      yearName
    );
    const monthFolder = await this.ensureChildFolder(
      vault,
      folderOperations,
      yearFolder,
      monthName
    );

    return monthFolder.id;
  }

  private async ensureChildFolder(
    vault: Vault,
    folderOperations: FolderOperations,
    parent: Folder,
    name: string
  ): Promise<Folder> {
    const existing = vault.getFolderByPath(`${parent.path}/${name}`);

    if (existing) {
      return existing;
    }

    const createdId = await folderOperations.create(name, parent.id);
    const created = vault.getFolder(createdId);

    if (!created) {
      // FolderOperations.create() always calls Vault.addFolder
      // synchronously before resolving (PagePersistenceCoordinator's
      // runCreateFolder), so this should be unreachable — defensive only.
      throw new Error(`Folder not found immediately after creation: ${createdId}`);
    }

    return created;
  }
}
