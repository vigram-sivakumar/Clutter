import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Button } from '@components/button/Button';
import { Switch } from '@components/switch/Switch';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

type LaunchAtLoginStatus =
  | 'enabled'
  | 'requires-approval'
  | 'not-registered'
  | 'not-found'
  | 'unsupported';

export function LaunchAtLoginSetting() {
  const [status, setStatus] = useState<LaunchAtLoginStatus | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!isTauri()) {
      setStatus('unsupported');
      return;
    }

    let active = true;
    const refreshStatus = () => {
      invoke<string>('get_launch_at_login_status')
        .then((nextStatus) => {
          if (active) {
            setStatus(nextStatus as LaunchAtLoginStatus);
            setError(undefined);
          }
        })
        .catch((reason: unknown) => {
          if (active) {
            setError(String(reason));
            setStatus('not-found');
          }
        });
    };

    refreshStatus();
    // The user may change Clutter's Login Item in System Settings while this window is open.
    window.addEventListener('focus', refreshStatus);

    return () => {
      active = false;
      window.removeEventListener('focus', refreshStatus);
    };
  }, []);

  async function handleToggle(enabled: boolean) {
    if (!isTauri() || busy) return;

    setBusy(true);
    setError(undefined);
    try {
      const nextStatus = await invoke<string>('set_launch_at_login_enabled', { enabled });
      setStatus(nextStatus as LaunchAtLoginStatus);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function openLoginItems() {
    setError(undefined);
    try {
      await invoke('open_login_items_settings');
    } catch (reason) {
      setError(String(reason));
    }
  }

  const requiresApproval = status === 'requires-approval';
  const description = requiresApproval
    ? 'macOS needs your approval. You can enable Clutter in Login Items.'
    : status === 'unsupported'
      ? 'Available in the macOS app.'
      : 'Automatically open Clutter when you log in to your Mac.';

  return (
    <SettingsEntry
      title="Launch at login"
      description={description}
      error={error}
      trailing={
        <>
          {requiresApproval && (
            <Button variant="outline" onClick={openLoginItems}>
              Open Login Items
            </Button>
          )}
          <Switch
            aria-label="Launch Clutter at login"
            isChecked={status === 'enabled'}
            disabled={status === 'loading' || status === 'unsupported' || busy || requiresApproval}
            onCheckedChange={handleToggle}
          />
        </>
      }
    />
  );
}
