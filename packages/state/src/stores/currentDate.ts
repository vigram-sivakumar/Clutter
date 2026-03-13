import { create } from 'zustand';

interface CurrentDateState {
  year: number;
  month: number; // 0-11 (January = 0)
  monthName: string; // 'January', 'February', etc.
  date: number; // 1-31
  dateString: string; // YYYY-MM-DD format
  _updateCurrentDate: () => void; // Internal updater
}

const MONTH_NAMES = [
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
];

/**
 * Global store for current date
 * Automatically updates at midnight (00:00:00)
 * Single source of truth for the entire app
 */
export const useCurrentDateStore = create<CurrentDateState>((set) => {
  // Initialize with current date
  const now = new Date();
  const initialState = {
    year: now.getFullYear(),
    month: now.getMonth(),
    monthName: MONTH_NAMES[now.getMonth()]!,
    date: now.getDate(),
    dateString: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    _updateCurrentDate: () => {
      const newDate = new Date();
      set({
        year: newDate.getFullYear(),
        month: newDate.getMonth(),
        monthName: MONTH_NAMES[newDate.getMonth()]!,
        date: newDate.getDate(),
        dateString: `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-${String(newDate.getDate()).padStart(2, '0')}`,
      });
    },
  };

  return initialState;
});

// Initialize the midnight updater (only runs once globally)
// eslint-disable-next-line no-undef
let midnightTimerId: NodeJS.Timeout | null = null;
let visibilityCleanup: (() => void) | null = null;

/**
 * Starts the global midnight updater
 * Should be called once at app initialization
 */
export function initializeMidnightUpdater() {
  // Prevent multiple initializations
  if (midnightTimerId !== null) {
    return;
  }

  // Check if date needs immediate update (in case app has been running overnight)
  const currentStoreDate = useCurrentDateStore.getState().dateString;
  const actualToday = new Date();
  const actualTodayString = `${actualToday.getFullYear()}-${String(actualToday.getMonth() + 1).padStart(2, '0')}-${String(actualToday.getDate()).padStart(2, '0')}`;

  if (currentStoreDate !== actualTodayString) {
    useCurrentDateStore.getState()._updateCurrentDate();
  }

  const scheduleNextUpdate = () => {
    // Calculate milliseconds until next midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    // 

    midnightTimerId = setTimeout(() => {
      // 

      // Update the store
      useCurrentDateStore.getState()._updateCurrentDate();

      // Schedule next update
      scheduleNextUpdate();
    }, msUntilMidnight);
  };

  scheduleNextUpdate();

  // Also update when window becomes visible (handles sleep/wake)
  const handleVisibilityChange = () => {
    // eslint-disable-next-line no-undef
    if (document.visibilityState === 'visible') {
      const currentStoreDate = useCurrentDateStore.getState().dateString;
      const actualToday = new Date();
      const actualTodayString = `${actualToday.getFullYear()}-${String(actualToday.getMonth() + 1).padStart(2, '0')}-${String(actualToday.getDate()).padStart(2, '0')}`;

      // If date has changed, update immediately
      if (currentStoreDate !== actualTodayString) {
        useCurrentDateStore.getState()._updateCurrentDate();

        // Reschedule the midnight timer
        if (midnightTimerId !== null) {
          clearTimeout(midnightTimerId);
          midnightTimerId = null;
        }
        scheduleNextUpdate();
      }
    }
  };

  // eslint-disable-next-line no-undef
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Store cleanup function for later
  visibilityCleanup = () => {
    // eslint-disable-next-line no-undef
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

/**
 * Cleanup function (useful for hot module replacement in development)
 */
export function cleanupMidnightUpdater() {
  if (midnightTimerId !== null) {
    clearTimeout(midnightTimerId);
    midnightTimerId = null;
  }
  if (visibilityCleanup !== null) {
    visibilityCleanup();
    visibilityCleanup = null;
  }
}
