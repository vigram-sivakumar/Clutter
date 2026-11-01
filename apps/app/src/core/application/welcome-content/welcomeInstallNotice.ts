import type { WelcomeInstallResult } from './WelcomeContentService';

/**
 * The failure toast for a first-run install that did not finish (ADR-067, `docs/writing-principles.md` principle 11:
 * a brief, non-blocking outcome, one cause, once). None of the three says or implies that the space or the user's
 * own files are damaged.
 *
 * - `scheduled`: the ledger recorded a retry, so the promise is true.
 * - `none`: the ledger recorded that there is no retry.
 * - `unknown`: the ledger could not be written, so a retry may or may not happen on a later open. Neither promise is
 *   made.
 */
export const WELCOME_NOTICE_RETRY_SCHEDULED =
  'Some welcome notes couldn’t be added yet. Clutter will try again next time you open this space';
export const WELCOME_NOTICE_NO_RETRY = 'Some welcome notes couldn’t be added. Your space is ready to use';
export const WELCOME_NOTICE_RETRY_UNCERTAIN =
  'Some welcome notes couldn’t be added. Clutter may try again next time you open this space';

/** The toast text for an install result, or `null` when nothing should be said (success, or nothing happened). */
export function welcomeInstallNotice(result: WelcomeInstallResult | null): string | null {
  if (result === null || result.status !== 'failed') return null;

  switch (result.retry) {
    case 'scheduled':
      return WELCOME_NOTICE_RETRY_SCHEDULED;
    case 'none':
      return WELCOME_NOTICE_NO_RETRY;
    case 'unknown':
      return WELCOME_NOTICE_RETRY_UNCERTAIN;
  }
}
