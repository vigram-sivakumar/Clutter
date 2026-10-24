import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { ResourceOperations } from '@core/application/resource/ResourceOperations';
import type { Vault } from '@core/vault/models/Vault';
import { getFolderDisplayLabel } from '@core/presentation/getFolderDisplayLabel';
import { getPageDisplayLabel, toPageDisplayLabelInput } from '@core/presentation/getPageDisplayLabel';
import type { ToastApi } from '@components/toast/ToastProvider';

/** Longest name shown in a toast; a longer one is cut with an ellipsis. */
const MAX_NAME_LENGTH = 40;

/**
 * "Meeting notes archived" — or just "Note archived" when there is no name to show (an untitled item shows a
 * placeholder in the app, not a name; a blank or missing one has nothing to show).
 */
export function archivedMessage(noun: 'note' | 'folder' | 'file', name: string | null | undefined): string {
  const trimmed = name?.trim();

  if (!trimmed) {
    return `${noun[0]?.toUpperCase()}${noun.slice(1)} archived`;
  }

  const shown = trimmed.length > MAX_NAME_LENGTH ? `${trimmed.slice(0, MAX_NAME_LENGTH).trimEnd()}…` : trimmed;

  return `${shown} archived`;
}

export interface ArchiveActionsDeps {
  /**
   * Where an item's name is read. A note's title typed a moment ago is not in the vault yet — it lives in
   * the page's title state until its (debounced) save lands, and archiving is what flushes that save. So a
   * note is named from the vault before the archive when it already has a real name, and from the vault
   * again afterwards (the title is saved by then) when it did not.
   */
  readonly vault: Pick<Vault, 'getPage' | 'getFolder' | 'getResource'>;
  readonly pageOperations: Pick<PageOperations, 'archive' | 'restore'>;
  readonly folderOperations: Pick<FolderOperations, 'archive' | 'restore'>;
  readonly resourceOperations: Pick<ResourceOperations, 'archiveResource' | 'restoreResource'>;
  readonly toast: ToastApi;
}

export interface ArchiveOptions {
  /**
   * Whether a success offers Undo (default true). Off for the note or folder that is open: it stays on
   * screen under its ArchivedBanner, which already says so and carries its own Restore.
   */
  readonly offerUndo?: boolean;
}

export interface ArchiveActions {
  archivePage(pageId: string, options?: ArchiveOptions): Promise<void>;
  archiveFolder(folderId: string, options?: ArchiveOptions): Promise<void>;
  archiveResource(resourceId: string, options?: ArchiveOptions): Promise<void>;
}

/**
 * Archive for a note, folder or file, with the feedback it needs: a failure is reported, and a success
 * offers Undo — the item leaves the list it was in, and Archive is where a mistaken click is recovered.
 *
 * Undo is the existing restore operation, nothing more: Clutter records an archived item's original
 * location when it archives it, so restoring it straight afterwards puts it back there. Whatever the
 * restore reports short of `restored` (a Daily Note recreated in the meantime, an item that is no longer
 * in Archive, a restore that needs a destination) is said honestly; Undo never claims it worked. A
 * successful Undo is silent, since the item is visibly back.
 *
 * Each action never rejects: both outcomes are handled here, so callers can fire and forget.
 * Permanent deletion is deliberately not here — it is confirmed up front and cannot be undone.
 */
async function run(
  toast: ToastApi,
  noun: 'note' | 'folder' | 'file',
  /** Read after the archive succeeded, so a title saved by the archive itself is the name. */
  name: () => string | null | undefined,
  archive: () => Promise<void>,
  restore: () => Promise<boolean>,
  offerUndo: boolean
): Promise<void> {
  try {
    await archive();
  } catch (error) {
    toast.fail(`Couldn’t archive this ${noun}`, error);
    return;
  }

  if (!offerUndo) {
    return;
  }

  toast.show({
    text: archivedMessage(noun, name()),
    action: {
      label: 'Undo',
      onAction: () => {
        void restore()
          .then((restored) => {
            if (!restored) {
              toast.fail(`Couldn’t undo. Restore this ${noun} from the Archive`);
            }
          })
          .catch((error: unknown) => {
            toast.fail(`Couldn’t undo. Restore this ${noun} from the Archive`, error);
          });
      },
    },
  });
}

export function archivePageWithUndo(
  { vault, pageOperations, toast }: Pick<ArchiveActionsDeps, 'vault' | 'pageOperations' | 'toast'>,
  pageId: string,
  { offerUndo = true }: ArchiveOptions = {}
): Promise<void> {
  const titleOf = (): string | undefined => {
    const page = vault.getPage(pageId);
    const label = page ? getPageDisplayLabel(toPageDisplayLabelInput(page)) : undefined;
    // A placeholder ("Untitled note") is not a name to show.
    return label?.source === 'title' ? label.text : undefined;
  };
  // The name as it was before the archive — what the user was looking at — wins; the one read afterwards
  // is for a title that was still unsaved (the vault had the auto-generated name until the archive saved it).
  const before = titleOf();

  return run(
    toast,
    'note',
    () => before ?? titleOf(),
    () => pageOperations.archive(pageId),
    async () => (await pageOperations.restore(pageId)).status === 'restored',
    offerUndo
  );
}

export function archiveFolderWithUndo(
  { vault, folderOperations, toast }: Pick<ArchiveActionsDeps, 'vault' | 'folderOperations' | 'toast'>,
  folderId: string,
  { offerUndo = true }: ArchiveOptions = {}
): Promise<void> {
  const titleOf = (): string | undefined => {
    const folder = vault.getFolder(folderId);
    const label = folder ? getFolderDisplayLabel(folder) : undefined;
    return label?.source === 'title' ? label.text : undefined;
  };
  const before = titleOf();

  return run(
    toast,
    'folder',
    () => before ?? titleOf(),
    () => folderOperations.archive(folderId),
    async () => {
      await folderOperations.restore(folderId);
      return true;
    },
    offerUndo
  );
}

export function archiveResourceWithUndo(
  { vault, resourceOperations, toast }: Pick<ArchiveActionsDeps, 'vault' | 'resourceOperations' | 'toast'>,
  resourceId: string,
  { offerUndo = true }: ArchiveOptions = {}
): Promise<void> {
  // The file's own name, extension included — how it is told apart from others in Assets.
  const name = vault.getResource(resourceId)?.name;

  return run(
    toast,
    'file',
    () => name,
    () => resourceOperations.archiveResource(resourceId),
    async () => {
      await resourceOperations.restoreResource(resourceId);
      return true;
    },
    offerUndo
  );
}

/** All three, for a host that has every operation (the page host). */
export function createArchiveActions(deps: ArchiveActionsDeps): ArchiveActions {
  return {
    archivePage: (pageId, options) => archivePageWithUndo(deps, pageId, options),
    archiveFolder: (folderId, options) => archiveFolderWithUndo(deps, folderId, options),
    archiveResource: (resourceId, options) => archiveResourceWithUndo(deps, resourceId, options),
  };
}
