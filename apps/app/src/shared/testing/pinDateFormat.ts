import { afterEach, beforeEach } from 'vitest';

import {
  readDateFormatChoice,
  writeDateFormatChoice,
  type DateFormatChoice,
} from '@shared/helpers/time/dateFormatPreference';

/**
 * Pins the Date format to `format` and returns what puts back what was there before: the preference that was in
 * effect when this was called, not just the default. The two halves of `pinDateFormat`, kept separate so the
 * restore can be tested on its own, including when the code between them throws.
 */
export function applyPinnedDateFormat(format: DateFormatChoice): () => void {
  const previous = readDateFormatChoice();
  writeDateFormatChoice(format);

  return () => writeDateFormatChoice(previous);
}

/**
 * Pins the app's Date format preference for every test in the file (or `describe`) this is called in, then restores
 * what was there before after each one. For a test that checks one specific date wording — "15 September 2025" — and
 * not what the user's setting happens to be: it says which format it is about instead of leaning on whatever the
 * global default is, so changing the default never silently changes what such a test means. A test of the
 * Relative format, or of the setting itself, selects that format the same way.
 *
 * The restore is an `afterEach`, which vitest runs after a test whether it passed or failed, so a failing test
 * cannot leave its format behind for the next one.
 *
 * Needs a DOM test environment (`// @vitest-environment jsdom`): the preference lives in `localStorage`.
 */
export function pinDateFormat(format: DateFormatChoice): void {
  let restore: (() => void) | undefined;

  beforeEach(() => {
    restore = applyPinnedDateFormat(format);
  });
  afterEach(() => {
    restore?.();
    restore = undefined;
  });
}
