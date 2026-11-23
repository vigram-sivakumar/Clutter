import { Button } from '@components/button/Button';
import { useToast } from '@components/toast/ToastProvider';
import { AppIcon } from '@shared/icon';
import { openExternalUrl } from '@shared/helpers/openExternalUrl';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { SettingsEntry } from '../settings-entry/SettingsEntry';
import { SettingsGroup } from '../settings-group/SettingsGroup';

const DISCORD_URL = 'https://discord.gg/kbPgnmAet5';
const SUPPORT_EMAIL = 'support.clutter@gmail.com';
const SUPPORT_SUBJECT = 'Clutter Support';

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
      // In a packaged macOS app, ask Launch Services which application owns
      // mailto:. Browsers commonly claim the scheme but may show about:blank
      // instead of handing it to a configured mail service.
      const useGmail =
        !isTauri() || (await invoke<boolean>('should_use_gmail_for_support_email'));
      await openExternalUrl(
        useGmail
          ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SUPPORT_EMAIL)}&su=${encodeURIComponent(SUPPORT_SUBJECT)}`
          : `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(SUPPORT_SUBJECT)}`,
      );
    } catch (error) {
      toast.fail('Couldn’t open email', error);
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
        title="Email us"
        description="For private questions, bug reports or help with installation."
        trailing={
          <Button variant="outline-fill" size="medium" onClick={() => void openSupportEmail()}>
            Send email
          </Button>
        }
      />
    </SettingsGroup>
  );
}
