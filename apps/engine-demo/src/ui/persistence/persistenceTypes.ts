/**
 * UI PHASE 1 — Persistence State Types
 *
 * Defines persistence state machine and status.
 * Engine-agnostic. UI-only.
 */

/**
 * Persistence state machine
 *
 * UNBOUND: No user-chosen location (temp storage)
 * BOUND: Actively saving to user-chosen path
 * ERROR: Disk write failed (autosave paused)
 */
export type PersistenceState =
  | { status: 'UNBOUND'; tempPath: string }
  | { status: 'BOUND'; path: string }
  | { status: 'ERROR'; path?: string; error: string };

/**
 * Save status (UI feedback)
 *
 * IDLE: No pending save
 * SAVING: Write in progress
 * SAVED: Write succeeded
 * ERROR: Write failed
 */
export type SaveStatus = 'IDLE' | 'SAVING' | 'SAVED' | 'ERROR';
