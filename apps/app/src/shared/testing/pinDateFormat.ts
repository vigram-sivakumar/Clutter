import { afterEach, beforeEach } from 'vitest';

import { writeDateFormatChoice, type DateFormatChoice } from '@shared/helpers/time/dateFormatPreference';

/**
 * Pins the app's Date format preference for every test in the file (or `describe`) this is called in, then puts
 * the default back after each one. For a test that checks one specific date wording — "15 September 2025" — and
 * not what the user's setting happens to be: it says which format it is about instead of leaning on whatever the
 * global default is, so changing the default never silently changes what such a test means. A test of the
 * Relative format, or of the setting itself, selects that format the same way.
 *
 * Needs a DOM test environment (`// @vitest-environment jsdom`): the preference lives in `localStorage`.
 */
export function pinDateFormat(format: DateFormatChoice): void {
  beforeEach(() => writeDateFormatChoice(format));
  // Choosing the default removes the saved value, which is exactly "nothing saved".
  afterEach(() => writeDateFormatChoice('relative'));
}
