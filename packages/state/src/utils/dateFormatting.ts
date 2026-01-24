/**
 * Date formatting utilities for state package
 * Duplicated from shared to maintain architectural boundaries
 */

const MONTH_NAMES = [
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

/**
 * Format date with relative prefix (e.g., "Today, 23 Jan 2026")
 * Used for daily note titles
 */
export const formatDateWithRelative = (date: Date): string => {
  const formattedDate = `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;

  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isToday) return `Today, ${formattedDate}`;
  if (isYesterday) return `Yesterday, ${formattedDate}`;
  return formattedDate;
};

export { MONTH_NAMES };
