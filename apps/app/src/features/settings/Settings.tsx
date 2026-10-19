import { Button } from '@components/button/Button';
import './Settings.css';
import { SettingsEntry } from './settings-entry/SettingsEntry';

export function Settings() {
  return (
    <div className="settings">
      <SettingsEntry
        title="Setup custom domain"
        description="Use your own domain when puglishing Clutter notes"
        trailing={<Button variant="outline">Click me</Button>}
      />
    </div>
  );
}
