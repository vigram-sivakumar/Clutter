import { Button } from '@components/button/Button';
import { useToast } from '@components/toast/ToastProvider';
import { LEGAL_LINKS, isPublicHttpsUrl, type LegalLinks as LegalLinksConfig } from '@core/legalLinks';
import { openExternalUrl } from '@shared/helpers/openExternalUrl';
import { SettingsEntry } from '../settings-entry/SettingsEntry';
import { SettingsGroup } from '../settings-group/SettingsGroup';

export interface LegalLinksProps {
  /** The published addresses. Default: the app's own (`core/legalLinks.ts`). A page with no address shows no entry. */
  links?: LegalLinksConfig;
}

/**
 * Settings → Preferences → Privacy and support: where a person reads how Clutter handles their information and gets
 * help. Each entry opens the published page in the default browser. Shows nothing until at least one page has an address.
 */
export function LegalLinks({ links = LEGAL_LINKS }: LegalLinksProps) {
  const toast = useToast();
  const entries = [
    { url: links.privacyPolicy, title: 'Privacy policy', description: 'How Clutter handles your information' },
    { url: links.support, title: 'Support', description: 'Get help with Clutter' },
  ].filter((entry): entry is typeof entry & { url: string } => isPublicHttpsUrl(entry.url));

  if (entries.length === 0) {
    return null;
  }

  async function open(url: string) {
    try {
      await openExternalUrl(url);
    } catch (error) {
      toast.fail('Couldn’t open the page', error);
    }
  }

  return (
    <SettingsGroup title="Privacy and support">
      {entries.map((entry) => (
        <SettingsEntry
          key={entry.title}
          title={entry.title}
          description={entry.description}
          trailing={
            <Button variant="outline" size="small" aria-label={`Open ${entry.title.toLowerCase()}`} onClick={() => void open(entry.url)}>
              Open
            </Button>
          }
        />
      ))}
    </SettingsGroup>
  );
}
