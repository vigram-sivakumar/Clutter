/**
 * UI PHASE 1 — Persistence Controller Hook
 *
 * Core persistence logic.
 * Manages state machine, autosave scheduling, location binding.
 *
 * NO ENGINE DEPENDENCIES (imports engine types only).
 */

import { useEffect, useState } from 'react';
import {
  getTempAutosavePath,
  writeToTempStorage,
  writeToFile,
} from './storage';
import { scheduleAutosave } from './autosave';
import type { PersistenceState, SaveStatus } from './persistenceTypes';
import type { PersistedState } from '../../normalize';

/**
 * Persistence hook
 *
 * Manages autosave state machine and write scheduling.
 *
 * @param engineState - Current persisted state from engine
 * @returns persistence state, save status, and control functions
 */
export function usePersistence(engineState: PersistedState) {
  const [persistence, setPersistence] = useState<PersistenceState | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('IDLE');

  // Initialize temp storage on mount
  useEffect(() => {
    (async () => {
      const tempPath = await getTempAutosavePath();
      setPersistence({ status: 'UNBOUND', tempPath });
    })();
  }, []);

  // Autosave on engine state changes
  useEffect(() => {
    if (!persistence) return; // Wait for init
    if (persistence.status === 'ERROR') return; // Paused on error

    const isTemp = persistence.status === 'UNBOUND';
    const location = isTemp ? persistence.tempPath : persistence.path;

    scheduleAutosave(
      engineState,
      location,
      isTemp,
      () => setSaveStatus('SAVING'),
      () => setSaveStatus('SAVED'),
      (e) => {
        setSaveStatus('ERROR');
        setPersistence({
          status: 'ERROR',
          path: location,
          error: String(e),
        });
      }
    );
  }, [engineState, persistence]);

  /**
   * Bind save location
   *
   * Transitions from UNBOUND to BOUND (or ERROR).
   * Writes immediately to verify location is writable.
   */
  async function bindPath(path: string): Promise<void> {
    try {
      setSaveStatus('SAVING');
      const json = JSON.stringify(engineState, null, 2);
      await writeToFile(path, json);
      setPersistence({ status: 'BOUND', path });
      setSaveStatus('SAVED');
    } catch (e) {
      setPersistence({
        status: 'ERROR',
        path,
        error: String(e),
      });
      setSaveStatus('ERROR');
    }
  }

  /**
   * Retry after error
   *
   * Attempts to write again to current path.
   */
  async function retryWrite(): Promise<void> {
    if (!persistence || persistence.status !== 'ERROR') return;
    if (!persistence.path) return;

    try {
      setSaveStatus('SAVING');
      const json = JSON.stringify(engineState, null, 2);

      // Determine if this was temp or bound
      const tempPath = await getTempAutosavePath();
      const isTemp = persistence.path === tempPath;

      if (isTemp) {
        await writeToTempStorage(json);
        setPersistence({ status: 'UNBOUND', tempPath });
      } else {
        await writeToFile(persistence.path, json);
        setPersistence({ status: 'BOUND', path: persistence.path });
      }

      setSaveStatus('SAVED');
    } catch (e) {
      // Remain in error state
      setSaveStatus('ERROR');
      setPersistence({
        status: 'ERROR',
        path: persistence.path,
        error: String(e),
      });
    }
  }

  return {
    persistence,
    saveStatus,
    bindPath,
    retryWrite,
  };
}
