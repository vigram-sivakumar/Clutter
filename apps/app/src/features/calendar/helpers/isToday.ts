/**
 * Checks whether an ISO date
 * is today.
 */
export function isToday(date: string) {
  const today = new Date().toISOString().slice(0, 10);

  return date === today;
}
