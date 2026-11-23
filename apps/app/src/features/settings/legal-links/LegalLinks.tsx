import { Button } from '@components/button/Button';
import { useToast } from '@components/toast/ToastProvider';
import { LEGAL_LINKS, isPublicHttpsUrl, type LegalLinks as LegalLinksConfig } from '@core/legalLinks';
import { openExternalUrl } from '@shared/helpers/openExternalUrl';
import { SettingsEntry } from '../settings-entry/SettingsEntry';
import { SettingsGroup } from '../settings-group/SettingsGroup';

export interface LegalLinksProps {
  /** The published addresses. Default: the app's own (core/legalLinks.ts). */
  links?: LegalLinksConfig;
}

/**
 * Settings → Preferences: a direct link to Clutter's published privacy policy.
 * Contact is handled separately by the existing Settings → Contact Us page.
 */
export function LegalLinks({ links = LEGAL_LINKS }: LegalLinksProps) {
  const toast = useToast();

  if (!isPublicHttpsUrl(links.privacyPolicy)) {
    return null;
  }

  async function open() {
    try {
      await openExternalUrl(links.privacyPolicy!);
    } catch (error) {
      toast.fail('Couldn’t open the page', error);
    }
  }

  return (
    <SettingsGroup title="Privacy">
      <SettingsEntry
        title="Privacy policy"
        description="How Clutter handles your information"
        trailing={
          <Button variant="outline" size="small" aria-label="Open privacy policy" onClick={() => void open()}>
            Open
          </Button>
        }
      />
    </SettingsGroup>
  );
}
