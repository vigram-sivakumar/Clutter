import { Button } from '@components/button/Button';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export type DirectUpdateStatus =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error';

export interface DirectUpdatesState {
  status: DirectUpdateStatus;
  version?: string;
  progress?: number;
  error?: string;
}

export interface DirectUpdatesSettingProps {
  state: DirectUpdatesState;
  onCheck: () => void;
  onDownload: () => void;
  onInstallAndRestart: () => void;
}

export function DirectUpdatesSetting({
  state,
  onCheck,
  onDownload,
  onInstallAndRestart,
}: DirectUpdatesSettingProps) {
  const description = (() => {
    switch (state.status) {
      case 'checking':
        return 'Checking for updates…';
      case 'current':
        return 'Clutter is up to date';
      case 'available':
        return `Version ${state.version} is available`;
      case 'downloading':
        return state.progress === undefined
          ? 'Downloading update…'
          : `Downloading update… ${state.progress}%`;
      case 'ready':
        return `Version ${state.version} is ready to install`;
      case 'installing':
        return 'Installing update and restarting…';
      case 'error':
        return state.error || 'Could not check for updates';
      default:
        return 'Check for a newer version of Clutter';
    }
  })();

  const busy = state.status === 'checking' || state.status === 'downloading' || state.status === 'installing';
  const label =
    state.status === 'available'
      ? 'Download update'
      : state.status === 'ready'
        ? 'Install and restart'
        : state.status === 'checking'
          ? 'Checking…'
          : state.status === 'downloading'
            ? 'Downloading…'
            : state.status === 'installing'
              ? 'Installing…'
              : 'Check for updates';
  const action =
    state.status === 'available'
      ? onDownload
      : state.status === 'ready'
        ? onInstallAndRestart
        : onCheck;

  return (
    <SettingsEntry
      title="Updates"
      description={description}
      trailing={
        <Button
          variant="outline"
          size="small"
          disabled={busy}
          onClick={action}
        >
          {label}
        </Button>
      }
    />
  );
}
