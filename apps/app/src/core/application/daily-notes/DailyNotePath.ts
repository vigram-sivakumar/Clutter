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

  static monthName(date: Date): string {
    return this.MONTH_NAMES[date.getMonth()]!;
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
