import type { ISODate } from '@shared/helpers/time/types';

/**
 * Converts dates into Clutter's Daily Notes filesystem convention.
 *
 * This class owns the path format only. It performs no filesystem access.
 */
export class DailyNotePath {
  private static readonly ROOT = 'Daily Notes';

  /** English long month names used in Daily Notes folder paths. */
  private static readonly MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ] as const;

  static from(date: Date): string {
    const year = date.getFullYear().toString();
    const month = this.monthName(date);
    const day = this.formatDayFileName(date);

    return `${this.ROOT}/${year}/${month}/${day}.md`;
  }

  /**
   * Absolute path for `date`'s daily note under `rootPath` — the one
   * concatenation every "open the daily note for this date" call site
   * needs, so it's computed here once rather than inlined at each caller
   * (Sidebar's "Start your day..." and the Calendar's date/Today
   * selection both resolve through this).
   */
  static absoluteFrom(rootPath: string, date: Date): string {
    return `${rootPath}/${this.from(date)}`;
  }

  static monthName(date: Date): string {
    return this.MONTH_NAMES[date.getMonth()]!;
  }

  /**
   * Whether `path` is exactly the canonical Daily Note path for some date —
   * the sole authority for "is this filename actually a Daily Note," used
   * by classification (PageBuilder/Vault.resolvePageType) to decide
   * `Page.type`. Deliberately reuses `from()` as the one date formatter
   * instead of duplicating its format rules: a candidate date is parsed out
   * of `path`'s three segments, then re-formatted via `absoluteFrom()` and
   * compared byte-for-byte against `path` — any mismatch (wrong day
   * count, non-padded segment, non-canonical month spelling, extra path
   * segments, etc.) fails the round trip and returns false, with no second
   * copy of the format rules to keep in sync.
   */
  static matchesCanonicalPath(vaultRoot: string, path: string): boolean {
    const date = this.parseCanonicalDate(vaultRoot, path);

    return date !== null && this.absoluteFrom(vaultRoot, date) === path;
  }

  /**
   * Parses `path` into the Date it would need to represent for
   * `matchesCanonicalPath` to hold — a best-effort candidate only, not
   * itself the source of truth (the round trip through `absoluteFrom()` in
   * `matchesCanonicalPath` is). Returns null for anything that doesn't even
   * have the right shape (segment count, filename pattern, known month
   * name), so the round trip is never attempted against unparseable input.
   */
  private static parseCanonicalDate(vaultRoot: string, path: string): Date | null {
    const prefix = `${vaultRoot}/${this.ROOT}/`;

    if (!path.startsWith(prefix)) {
      return null;
    }

    const segments = path.slice(prefix.length).split('/');

    if (segments.length !== 3) {
      return null;
    }

    const [yearSegment, monthSegment, fileSegment] = segments;
    const fileMatch = /^(\d{4})-(\d{2})-(\d{2})\.md$/.exec(fileSegment!);

    if (!fileMatch || fileMatch[1] !== yearSegment) {
      return null;
    }

    const monthIndex = (this.MONTH_NAMES as readonly string[]).indexOf(monthSegment!);

    if (monthIndex === -1) {
      return null;
    }

    const [, yearString, , dayString] = fileMatch;
    const date = new Date(Number(yearString), monthIndex, Number(dayString));

    // Date rolls invalid day-of-month values over into the next month
    // (e.g. Feb 30 -> Mar 2) instead of throwing — reject that here so a
    // rolled-over date can't accidentally round-trip back to a different
    // literal path than the one it was parsed from.
    if (
      date.getFullYear() !== Number(yearString) ||
      date.getMonth() !== monthIndex ||
      date.getDate() !== Number(dayString)
    ) {
      return null;
    }

    return date;
  }

  /**
   * Builds the ISO date for the first day of a Daily Notes month folder.
   * `yearName` and `monthFolderName` must match the folder segments written by `from()`.
   */
  static monthIsoFromFolderNames(
    yearName: string,
    monthFolderName: string
  ): ISODate {
    const monthIndex = (this.MONTH_NAMES as readonly string[]).indexOf(
      monthFolderName
    );

    if (monthIndex === -1) {
      throw new Error(`Unknown Daily Notes month folder: ${monthFolderName}`);
    }

    const month = String(monthIndex + 1).padStart(2, '0');

    return `${yearName}-${month}-01`;
  }

  private static formatDayFileName(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
