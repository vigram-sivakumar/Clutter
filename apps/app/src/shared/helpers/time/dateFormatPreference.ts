/**
 * The user's chosen way to display dates. `'relative'` (the default, and what a missing, cleared or
 * unrecognised stored value means) says Today/Tomorrow/Yesterday and weekday names; the others are explicit choices.
 * App-wide, not per-Space, like the theme: raw per-value localStorage, with a change notification so
 * anything showing it can follow a change made in Settings.
 *
 * This is the stored choice. `formatDateDisplay`, `formatDateTimeDisplay` and `formatAbsoluteDate` in
 * `dateDisplay.ts` read it at the moment they format, so every displayed date follows it; the Settings menu
 * writes it, and `useDateDisplayVersion` re-renders the app when it changes. Parsing, storage formats, Daily
 * Note paths and task-date semantics never read it.
 */
export const DATE_FORMAT_CHOICES = [
  'relative',
  'full',
  'short',
  'weekday',
  'mdy',
  'dmy',
  'ymd',
] as const;

export type DateFormatChoice = (typeof DATE_FORMAT_CHOICES)[number];

export const DEFAULT_DATE_FORMAT_CHOICE: DateFormatChoice = 'relative';

const STORAGE_KEY = 'clutter-date-format';

export function readDateFormatChoice(): DateFormatChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (DATE_FORMAT_CHOICES as readonly unknown[]).includes(stored)
      ? (stored as DateFormatChoice)
      : DEFAULT_DATE_FORMAT_CHOICE;
  } catch {
    return DEFAULT_DATE_FORMAT_CHOICE;
  }
}

const listeners = new Set<() => void>();

/** Saves an explicit choice. Choosing the default removes the saved value, so automatic formatting is the default again. */
export function writeDateFormatChoice(choice: DateFormatChoice): void {
  try {
    if (choice === DEFAULT_DATE_FORMAT_CHOICE) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, choice);
    }
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }

  listeners.forEach((listener) => listener());
}

export function subscribeDateFormatChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
