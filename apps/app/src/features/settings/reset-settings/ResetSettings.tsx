import { useState } from 'react';
import { Button } from '@components/button/Button';
import { Confirmation } from '@components/confirmation/Confirmation';
import { Dialog } from '@components/dialog/Dialog';
import { useToast } from '@components/toast/ToastProvider';
import { SettingsEntry } from '../settings-entry/SettingsEntry';
import { SettingsGroup } from '../settings-group/SettingsGroup';
import { resetAppPreferences } from './resetAppPreferences';
import type { ResetSettingsOutcome } from './resetSettingsToDefaults';

export interface ResetSettingsProps {
  /**
   * Resets every setting, in every Space (see `resetSettingsToDefaults`). Absent — Settings shown without a Space
   * behind it — it resets the app-wide preferences only.
   */
  onReset?: () => Promise<ResetSettingsOutcome>;
  /** The Space is changing under the dialog: there is nothing to reset against yet, so the action waits. */
  busy?: boolean;
  /** Called once the settings have been reset, so the page can show the values it holds in its own state afresh. */
  onResetComplete?: () => void;
}

const RESET_TITLE = 'Reset settings to defaults';
const RESET_DESCRIPTION = 'Restore application preferences to their default values across all Spaces';
const CONFIRM_TITLE = `${RESET_TITLE}?`;
const CONFIRM_DESCRIPTION =
  'This will restore application preferences to their default values across all Spaces. Your notes, daily notes, templates, assets, and other content will not be affected';

async function resetAppPreferencesOnly(): Promise<ResetSettingsOutcome> {
  resetAppPreferences();
  return { failedSpaces: [] };
}

/** What to say when some Spaces could not be reset: what failed, how many, nothing to blame. */
function failureMessage(count: number): string {
  return `Couldn’t reset settings for ${count} ${count === 1 ? 'Space' : 'Spaces'}`;
}

/**
 * The Reset section of Settings → Preferences: one action, confirmed first. It is styled as a danger action — an
 * outlined danger button on the page, the filled danger button in the confirmation — because it discards the user's
 * choices, and the confirmation's message says what it does not touch (see `resetSettingsToDefaults`). The result shows
 * on the controls themselves, so there is no success message; only a failure is reported.
 */
export function ResetSettings({ onReset = resetAppPreferencesOnly, busy = false, onResetComplete }: ResetSettingsProps) {
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const toast = useToast();

  async function reset() {
    setConfirming(false);
    setResetting(true);
    try {
      const { failedSpaces } = await onReset();
      if (failedSpaces.length > 0) {
        toast.fail(failureMessage(failedSpaces.length));
      }
    } catch (error) {
      toast.fail('Couldn’t reset settings', error);
    } finally {
      setResetting(false);
      onResetComplete?.();
    }
  }

  return (
    <>
      <SettingsGroup title="Reset">
        <SettingsEntry
          title={RESET_TITLE}
          description={RESET_DESCRIPTION}
          trailing={
            <Button variant="outline-danger" size="small" disabled={busy || resetting} onClick={() => setConfirming(true)}>
              Reset…
            </Button>
          }
        />
      </SettingsGroup>
      <Dialog open={confirming} onClose={() => setConfirming(false)} size="medium">
        <Confirmation
          title={CONFIRM_TITLE}
          description={CONFIRM_DESCRIPTION}
          confirmLabel="Reset settings"
          confirmVariant="danger"
          onConfirm={() => void reset()}
          onCancel={() => setConfirming(false)}
        />
      </Dialog>
    </>
  );
}
