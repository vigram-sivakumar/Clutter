/**
 * UI PHASE 1 — Persistence Status Indicator
 *
 * Minimal, honest status display.
 * No lies. No animation obsession.
 */

import type { SaveStatus, PersistenceState } from './persistenceTypes';

export function PersistenceStatus({
  saveStatus,
  persistence,
  onChooseLocation,
  onRetry,
}: {
  saveStatus: SaveStatus;
  persistence: PersistenceState | null;
  onChooseLocation?: () => void;
  onRetry?: () => void;
}) {
  if (!persistence) return null;

  // ERROR state (highest priority)
  if (saveStatus === 'ERROR') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: '#f48771',
        }}
      >
        <span>⚠ Save failed</span>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              backgroundColor: '#5a1e1e',
              border: '1px solid #8b0000',
              borderRadius: '3px',
              color: '#f48771',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  // SAVING state
  if (saveStatus === 'SAVING') {
    return (
      <div style={{ fontSize: '12px', color: '#888' }}>
        <span>Saving…</span>
      </div>
    );
  }

  // UNBOUND state (saved, but in temp location)
  if (persistence.status === 'UNBOUND') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: '#888',
        }}
      >
        <span>Saved locally</span>
        {onChooseLocation && (
          <button
            onClick={onChooseLocation}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              backgroundColor: '#1e1e1e',
              border: '1px solid #3e3e3e',
              borderRadius: '3px',
              color: '#9cdcfe',
              cursor: 'pointer',
            }}
          >
            Choose location
          </button>
        )}
      </div>
    );
  }

  // BOUND + SAVED (success state)
  return (
    <div style={{ fontSize: '12px', color: '#6a9955' }}>
      <span>Saved ✓</span>
    </div>
  );
}
