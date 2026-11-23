import { Button } from '@components/button/Button';
import { useToast } from '@components/toast/ToastProvider';
import { AppIcon } from '@shared/icon';
import { openExternalUrl } from '@shared/helpers/openExternalUrl';
import { SettingsEntry } from '../settings-entry/SettingsEntry';
import { SettingsGroup } from '../settings-group/SettingsGroup';

const DISCORD_URL = 'https://discord.gg/kbPgnmAet5';
const SUPPORT_EMAIL = 'support.clutter@gmail.com';
const GMAIL_COMPOSE_URL =
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SUPPORT_EMAIL)}&su=${encodeURIComponent('Clutter Support')}`;

export function GetSupportPage() {
  const toast = useToast();

  async function open(url: string) {
    try {
      await openExternalUrl(url);
    } catch (error) {
      toast.fail('Couldn’t open the link', error);
    }
  }

  async function openSupportEmail() {
    try {
      await openExternalUrl(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Clutter Support')}`);
    } catch {
      try {
        await openExternalUrl(GMAIL_COMPOSE_URL);
      } catch (error) {
        toast.fail('Couldn’t open email support', error);
      }
    }
  }

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
            onClick={() => void open(DISCORD_URL)}
          >
            Join Discord
          </Button>
        }
      />
      <SettingsEntry
        title="Email support"
        description="For private questions, bug reports or help with installation."
        trailing={
          <Button variant="outline-fill" size="medium" onClick={() => void openSupportEmail()}>
            Email support
          </Button>
        }
      />
    </SettingsGroup>
  );
}
