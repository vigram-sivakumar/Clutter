import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { Dialog } from '@components/dialog/Dialog';
import { RoundIconButton } from '@components/button/RoundIconButton';
import { AppIcon } from '@shared/icon';
import { SettingsEntry } from '@features/settings/settings-entry/SettingsEntry';
import { SettingsGroup } from '@features/settings/settings-group/SettingsGroup';
import { formatDateTimeDisplay } from '@shared/helpers/time/dateDisplay';
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

const DISCARD_WARNING = 'Permanently remove this recovery copy? These unsaved changes can’t be restored afterwards';

/**
 * What the card says: when the snapshot was captured, in the app's date format. The per-outcome explanations (a
 * conflict, a missing note, a draft) are deliberately not shown; only a failed attempt is, so a restore that did not
 * happen is never mistaken for one that did.
 */
function describeCandidate(candidate: RecoveryCandidate, failedBefore: boolean): string {
  const captured = formatDateTimeDisplay(new Date(candidate.record.capturedAt));

  return failedBefore ? `${captured}. Couldn’t restore this. The recovery copy was kept` : captured;
}

/**
 * Lists unsaved work Clutter found from an earlier session. Nothing here changes the vault by itself: Restore puts
 * the edits back into the open note as unsaved changes (saved the usual way), and where the note has changed or is
 * gone the only offer is a new note, never an overwrite. Closing the dialog keeps every record.
 */
export function RecoveryDialog({ open, candidates, onRestore, onDiscard, onClose }: RecoveryDialogProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // The record whose Discard is waiting for confirmation: a recovery copy may be the only copy of the edits.
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
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

  // One note at a time: the arrows in the footer step through them, the footer's actions act on the one shown, and
  // resolving it leaves the next one in its place.
  const [shownKey, setShownKey] = useState<string | null>(null);
  // When the note shown is resolved, the position stays and the next note takes it (clamped at the end): 1/4 -> 1/3.
  const lastIndexRef = useRef(0);
  const foundIndex = candidates.findIndex((candidate) => candidate.key === shownKey);
  const shownIndex = foundIndex >= 0 ? foundIndex : Math.min(lastIndexRef.current, Math.max(0, candidates.length - 1));
  lastIndexRef.current = shownIndex;
  const current = candidates[shownIndex];
  const confirming = current !== undefined && confirmingKey === current.key;

  return (
    <Dialog open={open && candidates.length > 0} onClose={onClose} size="large">
      <div className="recovery-dialog" role="dialog" aria-label="Unsaved changes found">
        <RoundIconButton className="recovery-dialog__dismiss" icon="dismiss" aria-label="Close" onClick={onClose} />
        <div className="recovery-dialog__header">Unsaved changes found</div>
        <div className="recovery-dialog__intro">
          Clutter closed before these changes were saved. Your vault hasn’t been changed
        </div>
        {current && (
          <SettingsGroup>
            <SettingsEntry
              title={current.record.label}
              titleClassName="recovery-dialog__title"
              description={confirming ? DISCARD_WARNING : describeCandidate(current, failed.has(current.key))}
              role={confirming || failed.has(current.key) ? 'alert' : undefined}
              data-outcome={current.outcome}
            />
          </SettingsGroup>
        )}
        {current && (
          <div className="recovery-dialog__footer">
            {candidates.length > 1 && (
              <div className="recovery-dialog__pager">
                <Button
                  isIconOnly
                  size="large"
                  variant="ghost"
                  aria-label="Previous note"
                  disabled={shownIndex === 0}
                  onClick={() => setShownKey(candidates[shownIndex - 1]!.key)}
                >
                  <AppIcon icon="arrowLeft" />
                </Button>
                <span className="recovery-dialog__count">
                  {shownIndex + 1}/{candidates.length}
                </span>
                <Button
                  isIconOnly
                  size="large"
                  variant="ghost"
                  aria-label="Next note"
                  disabled={shownIndex === candidates.length - 1}
                  onClick={() => setShownKey(candidates[shownIndex + 1]!.key)}
                >
                  <AppIcon icon="arrowRight" />
                </Button>
              </div>
            )}
            {confirming ? (
              <>
                <Button size="large" variant="outline" onClick={() => setConfirmingKey(null)}>
                  Cancel
                </Button>
                <Button
                  size="large"
                  variant="danger"
                  disabled={busyKey !== null}
                  onClick={() => {
                    setConfirmingKey(null);
                    void run(current.key, onDiscard);
                  }}
                >
                  Remove recovery copy
                </Button>
              </>
            ) : (
              <>
                <Button size="large" variant="outline-danger" disabled={busyKey !== null} onClick={() => setConfirmingKey(current.key)}>
                  Discard
                </Button>
                <Button
                  size="large"
                  variant="primary"
                  disabled={busyKey !== null}
                  onClick={() => void run(current.key, onRestore)}
                >
                  Restore
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
