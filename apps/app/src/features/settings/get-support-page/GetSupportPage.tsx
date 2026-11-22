import { Button } from '@components/button/Button';
import { SettingsGroup } from '../settings-group/SettingsGroup';
import './GetSupportPage.css';

/** Contact actions are styled and ready; their destinations will be added when provided. */
export function GetSupportPage() {
  return (
    <div className="get-support-page">
      <SettingsGroup
        title="Discord community"
        description="Join the Clutter community to ask questions, share feedback and follow announcements."
      >
        <div className="get-support-page__action">
          <Button variant="outline-fill" size="medium">
            Join Discord
          </Button>
        </div>
      </SettingsGroup>
      <SettingsGroup
        title="Email support"
        description="For private questions, bug reports or help with installation and your data."
      >
        <div className="get-support-page__action">
          <Button variant="outline-fill" size="medium">
            Email support
          </Button>
        </div>
      </SettingsGroup>
    </div>
  );
}
