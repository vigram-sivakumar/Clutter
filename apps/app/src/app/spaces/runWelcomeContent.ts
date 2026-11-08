import type { Application } from '../../core/application/Application';
import { WELCOME_GUIDE_FOLDER, WELCOME_GUIDE_ORDER } from '../../core/application/welcome-content/welcomeContentManifest';
import type { WelcomeInstallResult } from '../../core/application/welcome-content/WelcomeContentService';
import { collectionViewKeyForFolder } from '../../core/application/collection/collectionViewKey';
import { defaultSidebarSortDirection, sidebarOrderId } from '../../core/properties/sidebarSort';

/** The dialog's message when the install stopped and a retry will continue it from the ledger. */
export const WELCOME_GATE_RETRY_MESSAGE = 'Couldn’t add the welcome notes';
/** The dialog's message when the ledger records that no retry will happen: the next try opens the Space as it is. */
export const WELCOME_GATE_ABANDONED_MESSAGE = 'Couldn’t add the welcome notes';
/** The dialog's message when the install finished but the content is not all there as shipped. */
export const WELCOME_GATE_UNVERIFIED_MESSAGE = 'Couldn’t add the welcome notes';

/** Thrown by the open sequence when the gate closes, so the Welcome dialog shows `message` and the Space stays unopened. */
export class WelcomeInstallIncompleteError extends Error {
  readonly name = 'WelcomeInstallIncompleteError';
}

export type WelcomeGateOutcome =
  /** The Space may be shown. `installed` is true only when this call put the welcome content into it. */
  | { readonly open: true; readonly installed: boolean }
  /** The Space must not be shown. `message` is for the Welcome dialog, which stays up and offers the retry. */
  | { readonly open: false; readonly message: string };

/**
 * ADR-070: what must be true before a Space opened from the Welcome dialog (Create, Select a folder, or the folder
 * chosen in the Documents panel) is shown. This is the only place welcome content is ever provisioned: the creation
 * entry point decides, and an empty Space on its own is never a reason. Called with the Application already open but
 * not yet handed to the UI, so the Gate and Sync that make the writes are exactly the running ones, and nothing about
 * the new Space is visible or remembered until this says `open`.
 *
 * - A Space that is completely empty and has never held welcome content is populated.
 * - A Space with anything in it is left untouched.
 * - A Space whose own ledger says content was ever started is never populated again, so deleting every note or file
 *   never brings the welcome content back. Only an install the ledger records as interrupted is continued (the safe
 *   retry: the ledger decides, nothing is overwritten, nothing deleted is restored).
 * - A failed or unverified install closes the gate, and the Space is not registered (the caller only does that after
 *   `open`).
 *
 * A retry after the ledger records `complete`/`abandoned` finds nothing to resume and no unfinished install, so it
 * opens the Space as it is: a gate that could never open would trap the Welcome dialog behind a failure nothing can
 * fix. Never throws.
 */
export async function prepareWelcomeSpace(
  application: Pick<Application, 'welcomeContentService' | 'vault' | 'collectionViewConfigStore'>
): Promise<WelcomeGateOutcome> {
  const service = application.welcomeContentService;

  try {
    let result: WelcomeInstallResult | null = await service.install();
    // Nothing started because something is already there (a retry, or a Space that holds content): continue what the
    // ledger says, if anything.
    if (result.status === 'skipped') result = await service.resumeIfNeeded();

    if (result?.status === 'failed') {
      return { open: false, message: result.retry === 'none' ? WELCOME_GATE_ABANDONED_MESSAGE : WELCOME_GATE_RETRY_MESSAGE };
    }

    // Only content this call wrote is checked. A Space that was populated earlier is never re-verified here: its
    // owner may have deleted any of it, and that must never close the gate or bring anything back.
    const installed = result?.status === 'installed';
    if (installed) {
      const verification = await service.verifyInstall();
      if (verification !== null && !verification.ok) return { open: false, message: WELCOME_GATE_UNVERIFIED_MESSAGE };
      seedWelcomeGuideOrder(application);
    }
    // From here the user can see (and delete from) this Space, so an interrupted write is never attempted again.
    await service.markShown();

    return { open: true, installed };
  } catch (error) {
    console.error('The welcome content step failed:', error);

    return { open: false, message: WELCOME_GATE_RETRY_MESSAGE };
  }
}

/**
 * A Space the Welcome dialog just populated has opened on today's note. Move it to the shipped "Welcome to Clutter"
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
