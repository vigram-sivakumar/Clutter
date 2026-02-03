/**
 * Natural language date parser for @ mentions
 * Supports formats like: today, tomorrow, yesterday, next week, 3 days, etc.
 */

export interface DateSuggestion {
  label: string;
  date: string; // ISO format YYYY-MM-DD
  description?: string;
  keywords: string[]; // For fuzzy matching
}

/**
 * Calculate date offset from today
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date as "Tue, Dec 30 2025" (matches daily note format)
 */
function formatDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
}

/**
 * Get all available date suggestions
 */
export function getAllDateSuggestions(): DateSuggestion[] {
  const today = new Date();

  return [
    {
      label: 'Today',
      date: toISODate(today),
      keywords: ['today'],
    },
    {
      label: 'Tomorrow',
      date: toISODate(addDays(today, 1)),
      keywords: ['tomorrow'],
    },
    {
      label: 'Yesterday',
      date: toISODate(addDays(today, -1)),
      keywords: ['yesterday'],
    },
    {
      label: formatDate(addDays(today, 7)),
      date: toISODate(addDays(today, 7)),
      keywords: ['next week', 'nextweek', '1week', '7days'],
    },
    {
      label: formatDate(addDays(today, -7)),
      date: toISODate(addDays(today, -7)),
      keywords: ['last week', 'lastweek', 'prev week', 'prevweek'],
    },
  ];
}

/**
 * Filter date suggestions based on query
 */
export function filterDateSuggestions(query: string): DateSuggestion[] {
  if (!query || query.trim() === '') {
    return [];
  }

  const normalizedQuery = query.toLowerCase().trim();
  const allSuggestions = getAllDateSuggestions();

  return allSuggestions.filter((suggestion) =>
    suggestion.keywords.some((keyword) => keyword.includes(normalizedQuery))
  );
}
