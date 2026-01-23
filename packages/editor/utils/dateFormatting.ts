/**
 * Date formatting utilities for editor components
 * 
 * NOTE: This is a minimal subset needed by editor chrome.
 * For full date utilities, see @clutter/shared/src/utils/dateFormatting.ts
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
 * Format date and time with relative prefix (12-hour format)
 * Used for displaying timestamps like "Created" and "Last edited"
 * 
 * @param date - Date object to format
 * @returns Formatted string (e.g., "Today, 2:30 PM" or "23 Jan 2026, 2:30 PM")
 */
export const formatDateTime = (date: Date): string => {
  const formattedDate = `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
  
  // Format time (12-hour format with AM/PM)
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  const formattedTime = `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  
  // Check if it's today
  const today = new Date();
  const isToday = date.getDate() === today.getDate() &&
                  date.getMonth() === today.getMonth() &&
                  date.getFullYear() === today.getFullYear();
  
  return isToday ? `Today, ${formattedTime}` : `${formattedDate}, ${formattedTime}`;
};
