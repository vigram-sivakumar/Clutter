/**
 * Utility functions for grouping and organizing daily notes by year and month
 */

// Generic note type with dailyNoteDate field
export interface DailyNote {
  id: string;
  dailyNoteDate: string | null; // YYYY-MM-DD format
  [key: string]: any; // Allow other properties
}

// Grouped structure: Year → Month → Notes
export interface GroupedDailyNotes {
  [year: string]: {
    [month: string]: DailyNote[];
  };
}

// Month names for display
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Groups daily notes by year and month
 * @param notes - Array of notes with dailyNoteDate field
 * @returns Nested object grouped by year → month → notes array
 * 
 * Example output:
 * {
 *   '2026': {
 *     'January': [note1, note2, ...],
 *     'February': [note3, ...]
 *   },
 *   '2025': {
 *     'December': [note4, ...]
 *   }
 * }
 */
export function groupDailyNotesByYearMonth<T extends DailyNote>(
  notes: T[]
): GroupedDailyNotes {
  const grouped: GroupedDailyNotes = {};

  // Filter out notes without dailyNoteDate and group them
  notes
    .filter(note => note.dailyNoteDate !== null && note.dailyNoteDate !== undefined)
    .forEach(note => {
      try {
        // Parse the ISO date string (YYYY-MM-DD)
        const date = new Date(note.dailyNoteDate + 'T00:00:00'); // Add time to avoid timezone issues
        
        // Extract year and month
        const year = date.getFullYear().toString();
        const monthIndex = date.getMonth();
        const monthName = MONTH_NAMES[monthIndex];

        // Initialize nested structure if needed
        if (!grouped[year]) {
          grouped[year] = {};
        }
        if (!grouped[year][monthName]) {
          grouped[year][monthName] = [];
        }

        // Add note to the appropriate group
        grouped[year][monthName].push(note);
      } catch (error) {
      // Error handled
        
      }
    });

  // Sort notes within each month by date (oldest first - chronological order)
  Object.keys(grouped).forEach(year => {
    Object.keys(grouped[year]).forEach(month => {
      grouped[year][month].sort((a, b) => {
        const dateA = new Date(a.dailyNoteDate + 'T00:00:00').getTime();
        const dateB = new Date(b.dailyNoteDate + 'T00:00:00').getTime();
        return dateA - dateB; // Oldest first (chronological)
      });
    });
  });

  return grouped;
}

/**
 * Gets sorted array of years from grouped notes (most recent first)
 */
export function getSortedYears(grouped: GroupedDailyNotes): string[] {
  return Object.keys(grouped).sort((a, b) => parseInt(b) - parseInt(a));
}

/**
 * Gets sorted array of months for a given year (chronological order: January to December)
 */
export function getSortedMonths(grouped: GroupedDailyNotes, year: string): string[] {
  if (!grouped[year]) return [];
  
  const months = Object.keys(grouped[year]);
  
  // Sort by month index (chronological: January to December)
  return months.sort((a, b) => {
    const indexA = MONTH_NAMES.indexOf(a);
    const indexB = MONTH_NAMES.indexOf(b);
    return indexA - indexB;
  });
}

/**
 * Gets the total count of notes in a year
 */
export function getYearNoteCount(grouped: GroupedDailyNotes, year: string): number {
  if (!grouped[year]) return 0;
  
  return Object.values(grouped[year]).reduce(
    (total, notes) => total + notes.length,
    0
  );
}

/**
 * Gets the count of notes in a specific month
 */
export function getMonthNoteCount(
  grouped: GroupedDailyNotes,
  year: string,
  month: string
): number {
  return grouped[year]?.[month]?.length || 0;
}

/**
 * Formats a year/month key for storage (e.g., "2026", "2026-January")
 */
export function formatYearMonthKey(year: string, month?: string): string {
  return month ? `${year}-${month}` : year;
}

