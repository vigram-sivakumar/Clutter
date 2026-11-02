import type { Application } from '../../core/application/Application';
import { WELCOME_GUIDE_FOLDER, WELCOME_GUIDE_ORDER } from '../../core/application/welcome-content/welcomeContentManifest';
import type { WelcomeInstallResult } from '../../core/application/welcome-content/WelcomeContentService';
import { collectionViewKeyForFolder } from '../../core/application/collection/collectionViewKey';
import { defaultSidebarSortDirection, sidebarOrderId } from '../../core/properties/sidebarSort';
import type { SpaceRegistryStorage } from './spaceRegistry';
import {
  decideWelcomeContent,
  readWelcomeContentRecord,
  writeWelcomeContentRecord,
} from './welcomeContentRecord';

/** The dialog's message when the install stopped and a retry will continue it from the ledger. */
export const WELCOME_GATE_RETRY_MESSAGE = 'Couldn’t finish adding the welcome notes. Try again to continue where it stopped';
/** The dialog's message when the ledger records that no retry will happen: the next try opens the space as it is. */
export const WELCOME_GATE_ABANDONED_MESSAGE = 'Couldn’t add all the welcome notes. Try again to open the space without them';
/** The dialog's message when the install finished but the content is not all there as shipped. */
export const WELCOME_GATE_UNVERIFIED_MESSAGE = 'Couldn’t confirm the welcome notes were all added. Try again to open the space without them';

/** Thrown by the open sequence when the gate closes, so the Welcome dialog shows `message` and the Space stays unopened. */
export class WelcomeInstallIncompleteError extends Error {
  readonly name = 'WelcomeInstallIncompleteError';
}

export type WelcomeGateOutcome =
  /** The Space may be shown. */
  | { readonly open: true }
  /** The Space must not be shown. `message` is for the Welcome dialog, which stays up and offers the retry. */
  | { readonly open: false; readonly message: string };

/**
 * ADR-067: what must be true before a Space chosen or created in the Welcome dialog is shown. Called with the
 * Application already open but not yet handed to the UI, so the Gate and Sync that make the writes are exactly the
 * running ones, and nothing about the new Space is visible or remembered until this says `open`.
 *
 * - **Create** (no record, or a `started` record retried for the folder Clutter created): the install runs.
 * - **Selecting an existing folder** records its skip permanently, and installs nothing.
 * - In every case a Space whose own ledger says an install was interrupted resumes it first (the safe retry: the
 *   ledger decides, nothing is overwritten, nothing deleted is restored).
 * - A failed or unverified install closes the gate. The first-run record then stays `started`, never `done`, and the
 *   Space is not registered (the caller only does that after `open`).
 *
 * A retry after the ledger records `complete`/`abandoned` finds nothing to resume and no unfinished install, so it
 * opens the Space as it is: a gate that could never open would trap a first run behind a failure nothing can fix.
 * Never throws.
 */
export async function prepareWelcomeSpace(
  application: Pick<Application, 'welcomeContentService' | 'vault' | 'collectionViewConfigStore'>,
  input: { readonly storage: SpaceRegistryStorage | null; readonly createdByWelcome: boolean }
): Promise<WelcomeGateOutcome> {
  const { storage } = input;
  const service = application.welcomeContentService;

  try {
    const record = readWelcomeContentRecord(storage);
    const decision = decideWelcomeContent({ record, fromWelcome: true, createdByWelcome: input.createdByWelcome });

    if (decision === 'skip-existing-folder' || decision === 'skip-existing-user') {
      writeWelcomeContentRecord(storage, decision === 'skip-existing-folder' ? 'skipped-existing-folder' : 'skipped-existing-user');
    }

    let result: WelcomeInstallResult | null = null;
    if (decision === 'install') {
      // Without the record there is no guarantee the install happens once, so it does not start.
      if (record === null && !writeWelcomeContentRecord(storage, 'started')) {
        return { open: false, message: WELCOME_GATE_ABANDONED_MESSAGE };
      }
      result = await service.install();
      // Nothing started because something is already there (a retry): continue what the ledger says, if anything.
      if (result.status === 'skipped') result = await service.resumeIfNeeded();
    } else {
      result = await service.resumeIfNeeded();
    }

    if (result?.status === 'failed') {
      return { open: false, message: result.retry === 'none' ? WELCOME_GATE_ABANDONED_MESSAGE : WELCOME_GATE_RETRY_MESSAGE };
    }

    const verification = await service.verifyInstall();
    if (verification !== null && !verification.ok) return { open: false, message: WELCOME_GATE_UNVERIFIED_MESSAGE };
    if (verification !== null) writeWelcomeContentRecord(storage, 'done');
    if (decision === 'install' && verification?.ok) seedWelcomeGuideOrder(application);
    // From here the user can see (and delete from) this Space, so an interrupted write is never attempted again.
    await service.markShown();

    return { open: true };
  } catch (error) {
    console.error('The welcome content step failed:', error);

    return { open: false, message: WELCOME_GATE_RETRY_MESSAGE };
  }
}

/**
 * A Space that was not chosen in the Welcome dialog (startup restore, recovery, switching) has opened. A user who
 * already has Spaces is never part of the first run: record that, and finish an interrupted install in the
 * background if this Space's ledger holds one (a Space remembered by a build that opened Spaces before their welcome
 * content was finished). Returns the result the failure toast is chosen from. Never throws.
 */
export async function resumeInterruptedWelcomeContent(
  application: Pick<Application, 'welcomeContentService'>,
  input: { readonly storage: SpaceRegistryStorage | null }
): Promise<WelcomeInstallResult | null> {
  try {
    if (readWelcomeContentRecord(input.storage) === null) writeWelcomeContentRecord(input.storage, 'skipped-existing-user');

    return await application.welcomeContentService.resumeIfNeeded();
  } catch (error) {
    console.error('The welcome content step failed:', error);

    return null;
  }
}

/**
 * A Space the Welcome dialog just created has opened on today's note. Move it to the shipped "Welcome to Clutter"
 * folder's collection view instead, without recording a history entry (the first view is not somewhere to go back
 * to). A navigation only, no write; a folder the install did not leave there (or any failure) keeps today's note.
 * Never throws.
 */
export async function openWelcomeFolder(
  application: Pick<Application, 'vault' | 'folderOperations'>,
  rootPath: string
): Promise<void> {
  try {
    const folder = application.vault.getFolderByPath(`${rootPath}/${WELCOME_GUIDE_FOLDER}`);
    if (folder) await application.folderOperations.open(folder.id, { recordHistory: false });
  } catch (error) {
    console.error('Opening the welcome folder failed:', error);
  }
}

/**
 * Gives the shipped guide folder its manual order (ADR-055/066: the one sort its sidebar level and its collection page
 * share), so Get started is first. Presentation state in `.clutter/workspace.json` through the config store, not a
 * Gate write. Never overrides a sort or order the folder already has, and a note that is not there is left out (the
 * order then follows by name). Never throws.
 */
function seedWelcomeGuideOrder(application: Pick<Application, 'vault' | 'collectionViewConfigStore'>): void {
  try {
    const { vault, collectionViewConfigStore } = application;
    const folder = vault.getFolderByPath(`${vault.root}/${WELCOME_GUIDE_FOLDER}`);
    if (!folder) return;

    const key = collectionViewKeyForFolder(folder.id);
    const existing = collectionViewConfigStore.get(key);
    if (existing?.sidebarSort !== undefined || existing?.sidebarOrder !== undefined) return;

    const order: string[] = [];
    for (const name of WELCOME_GUIDE_ORDER) {
      const page = vault.getPageByPath(`${vault.root}/${WELCOME_GUIDE_FOLDER}/${name}.md`);
      if (page) order.push(sidebarOrderId('note', page.id));
    }
    if (order.length === 0) return;

    collectionViewConfigStore.update(key, { sidebarSort: { key: 'manual', direction: defaultSidebarSortDirection('manual') }, sidebarOrder: order });
  } catch (error) {
    console.error('Ordering the welcome folder failed:', error);
  }
}
