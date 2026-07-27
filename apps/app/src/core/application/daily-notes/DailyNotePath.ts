/**
 * Converts dates into Clutter's Daily Notes filesystem convention.
 *
 * This class owns the path format only. It performs no filesystem access.
 */
export class DailyNotePath {
  private static readonly ROOT = 'Daily Notes';

  static from(date: Date): string {
    const year = date.getFullYear().toString();

    const month = date.toLocaleString('en-US', {
      month: 'long',
    });

    const day = this.formatDate(date);

    return `${this.ROOT}/${year}/${month}/${day}.md`;
  }

  private static formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
