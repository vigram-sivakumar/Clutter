import { SettingsGroup } from '../settings-group/SettingsGroup';
import './GetSupportPage.css';

/** Contact destinations will be connected once the community invite and support address are finalised. */
export function GetSupportPage() {
  return (
    <div className="get-support-page">
      <SettingsGroup title="Discord community" description="Join the Clutter community to ask questions, share feedback and follow announcements.">
        <div className="get-support-page__destination">
          <span className="get-support-page__status">Invite link coming soon</span>
        </div>
      </SettingsGroup>
      <SettingsGroup title="Email support" description="For private questions, bug reports or help with installation and your data.">
        <div className="get-support-page__destination">
          <span className="get-support-page__status">Support email coming soon</span>
        </div>
      </SettingsGroup>
    </div>
  );
}
