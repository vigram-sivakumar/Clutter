import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { AppShell } from './AppShell';
import { useTheme } from '../design-system/useTheme';

export function App() {
  useTheme(); // registers system preference listener + keeps data-theme in sync

  // Windows are created hidden (src-tauri/src/startup.rs) so the webview's
  // blank white background is never visible; show once first paint is done.
  useEffect(() => {
    if (!isTauri()) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => void getCurrentWindow().show())
    );
  }, []);

  return <AppShell />;
}
