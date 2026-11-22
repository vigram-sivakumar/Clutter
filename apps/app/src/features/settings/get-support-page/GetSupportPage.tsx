import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import { SettingsEntry } from '../settings-entry/SettingsEntry';
import { SettingsGroup } from '../settings-group/SettingsGroup';

export function GetSupportPage() {
  return (
    <SettingsGroup>
      <SettingsEntry
        title="Discord community"
        description="Join the Clutter community to ask questions, share feedback and follow announcements."
        trailing={
          <Button
            variant="outline-fill"
            size="medium"
            style={{ backgroundColor: '#5865F2', color: 'var(--foreground-white)' }}
            leading={<AppIcon icon="discord" />}
          >
            Join Discord
          </Button>
        }
      />
      <SettingsEntry
        title="Email support"
        description="For private questions, bug reports or help with installation."
        trailing={
          <Button variant="outline-fill" size="medium">
            Email support
          </Button>
        }
      />
    </SettingsGroup>
  );
}
