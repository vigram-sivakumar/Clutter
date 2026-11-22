import { Button } from '@components/button/Button';
import { SettingsEntry } from '../settings-entry/SettingsEntry';
import { SettingsGroup } from '../settings-group/SettingsGroup';

export function GetSupportPage() {
  return (
    <SettingsGroup>
      <SettingsEntry
        title="Discord community"
        description="Join the Clutter community to ask questions, share feedback and follow announcements."
        trailing={
          <Button variant="outline-fill" size="medium">
            Join Discord
          </Button>
        }
      />
      <SettingsEntry
        title="Email support"
        description="For private questions, bug reports or help with installation and your data."
        trailing={
          <Button variant="outline-fill" size="medium">
            Email support
          </Button>
        }
      />
    </SettingsGroup>
  );
}
