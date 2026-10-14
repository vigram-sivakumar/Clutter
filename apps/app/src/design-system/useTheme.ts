import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export type ThemePreference = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'clutter-theme';

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? getSystemTheme() : pref;
}

function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.add('theme-transitioning');
  root.setAttribute('data-theme', theme);
  // Keep the native window behind the webview in step (matches index.html).
  if (isTauri()) {
    void getCurrentWindow()
      .setBackgroundColor(theme === 'dark' ? [31, 31, 31, 255] : [249, 248, 247, 255])
      .catch(() => {});
  }
  setTimeout(() => root.classList.remove('theme-transitioning'), 200);
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => (localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ?? 'system',
  );

  // When preference is 'system', keep in sync with OS changes
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(getSystemTheme());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [preference]);

  function setPreference(pref: ThemePreference) {
    localStorage.setItem(STORAGE_KEY, pref);
    setPreferenceState(pref);
    applyTheme(resolveTheme(pref));
  }

  return {
    preference,
    setPreference,
    // Convenience: the actual rendered theme, regardless of 'system' indirection
    resolvedTheme: resolveTheme(preference),
  };
}
