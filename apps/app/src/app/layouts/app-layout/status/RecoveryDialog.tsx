import { useState } from 'react';
import { Button } from '@components/button/Button';
import { Dialog } from '@components/dialog/Dialog';
import type { RecoveryCandidate } from '@core/application/recovery/RecoveryOperations';
import './RecoveryDialog.css';

interface RecoveryDialogProps {
  readonly open: boolean;
  readonly candidates: readonly RecoveryCandidate[];
  readonly onRestore: (key: string) => Promise<void>;
  readonly onDiscard: (key: string) => Promise<void>;
  /** Closes the dialog and leaves every record where it is. */
  readonly onClose: () => void;
}

const CHANGE_NAMES = { body: 'text', title: 'title', description: 'description' } as const;

/** "text", "text and title", "text, title and description". */
function describeChanges(changes: RecoveryCandidate['changes']): string {
  const names = changes.map((change) => CHANGE_NAMES[change]);

  return names.length <= 1 ? (names[0] ?? 'text') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** What the primary action does for this record, in the user's terms. */
function actionLabel(candidate: RecoveryCandidate): string {
  if (candidate.outcome === 'recoverable') return 'Restore';
  if (candidate.outcome === 'draft') return 'Restore note';
  return 'Save as new note';
}

/**
 * Lists unsaved work Clutter found from an earlier session. Nothing here changes the vault by itself: Restore puts
 * the edits back into the open note as unsaved changes (saved the usual way), and where the note has changed or is
 * gone the only offer is a new note, never an overwrite. Closing the dialog keeps every record.
 */
export function RecoveryDialog({ open, candidates, onRestore, onDiscard, onClose }: RecoveryDialogProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  async function run(key: string, action: (key: string) => Promise<void>) {
    setBusyKey(key);
    try {
      await action(key);
      setFailed((current) => new Set([...current].filter((entry) => entry !== key)));
    } catch (error) {
      console.error('Recovery action failed.', error);
      setFailed((current) => new Set(current).add(key));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Dialog open={open && candidates.length > 0} onClose={onClose} size="medium">
      <div className="recovery-dialog" role="dialog" aria-label="Unsaved changes found">
        <div className="recovery-dialog__header">Unsaved changes found</div>
        <div className="recovery-dialog__intro">
          Clutter closed before these changes were saved. Your vault hasn’t been changed
        </div>
        <ul className="recovery-dialog__list">
          {candidates.map((candidate) => (
            <li key={candidate.key} className="recovery-dialog__item" data-outcome={candidate.outcome}>
              <div className="recovery-dialog__title">{candidate.record.label}</div>
              <div className="recovery-dialog__meta">
                Unsaved {describeChanges(candidate.changes)}, captured {new Date(candidate.record.capturedAt).toLocaleString()}
              </div>
              {candidate.reasons.map((reason) => (
                <div key={reason} className="recovery-dialog__reason">
                  {candidate.outcome === 'draft'
                    ? reason
                    : `${reason}. These changes can only be saved as a new note, so nothing is overwritten`}
                </div>
              ))}
              {failed.has(candidate.key) && (
                <div className="recovery-dialog__error" role="alert">
                  Couldn’t restore this. The recovery copy was kept
                </div>
              )}
              <div className="recovery-dialog__actions">
                <Button
                  size="small"
                  variant="primary"
                  disabled={busyKey !== null}
                  onClick={() => void run(candidate.key, onRestore)}
                >
                  {actionLabel(candidate)}
                </Button>
                <Button
                  size="small"
                  variant="outline"
                  disabled={busyKey !== null}
                  onClick={() => void run(candidate.key, onDiscard)}
                >
                  Discard
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="recovery-dialog__footer">
          <Button size="large" variant="outline" onClick={onClose}>
            Decide later
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
