import { toISODate } from '@shared/helpers/time/helpers/toISODate';

/** The ISO date `daysFromToday` days from now — what `@Tom` resolves to when `daysFromToday` is 1. */
export function formatDateForTest(daysFromToday: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  return toISODate(date);
}
