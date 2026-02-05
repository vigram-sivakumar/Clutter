/**
 * UI PHASE 1 — Autosave Loop
 *
 * Debounced write scheduler.
 * Never retries. Never lies. Last change wins.
 *
 * NO ENGINE DEPENDENCIES.
 */

import { writeToTempStorage, writeToFile } from './storage';
import type { PersistedState } from '../../normalize';

let timeout: number | null = null;

/**
 * Schedule autosave with debouncing
 *
 * Rules:
 * - One write at a time
 * - Last change wins
 * - No silent retries
 * - No silent failures
 *
 * @param state - Engine state to persist
 * @param location - Save location (temp key or file path)
 * @param isTemp - Whether this is temp storage (true) or bound file (false)
 * @param onSaving - Called when write starts
 * @param onSaved - Called when write succeeds
 * @param onError - Called when write fails
 * @param delay - Debounce delay in ms (default 400ms)
 */
export function scheduleAutosave(
  state: PersistedState,
  location: string,
  isTemp: boolean,
  onSaving: () => void,
  onSaved: () => void,
  onError: (err: unknown) => void,
  delay = 400
) {
  // Clear previous scheduled save
  if (timeout !== null) {
    window.clearTimeout(timeout);
  }

  // Schedule new save
  timeout = window.setTimeout(async () => {
    try {
      onSaving();

      // Serialize to JSON
      const json = JSON.stringify(state, null, 2);

      // Write to appropriate location
      if (isTemp) {
        await writeToTempStorage(json);
      } else {
        await writeToFile(location, json);
      }

      onSaved();
    } catch (e) {
      onError(e);
    }
  }, delay);
}

/**
 * Cancel pending autosave
 *
 * Used when explicitly importing or changing locations.
 */
export function cancelAutosave() {
  if (timeout !== null) {
    window.clearTimeout(timeout);
    timeout = null;
  }
}
