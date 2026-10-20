import { useEffect, useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'clutter-theme';

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? getSystemTheme() : pref;
}

function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.add('theme-transitioning');
  root.setAttribute('data-theme', theme);
  setTimeout(() => root.classList.remove('theme-transitioning'), 200);
}

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

// One shared preference for every `useTheme()` caller (App keeps `data-theme` in sync; the Settings
// dialog changes it) — a per-hook state would leave the other caller's copy stale.
let current: ThemePreference | null = null;
const listeners = new Set<() => void>();

function getPreference(): ThemePreference {
  return (current ??= readStoredPreference());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  const preference = useSyncExternalStore(subscribe, getPreference);

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
    current = pref;
    applyTheme(resolveTheme(pref));
    listeners.forEach((listener) => listener());
  }

  return {
    preference,
    setPreference,
    // Convenience: the actual rendered theme, regardless of 'system' indirection
    resolvedTheme: resolveTheme(preference),
  };
}

/** Test seam: drops the cached preference so the next read comes from storage again. */
export function resetThemeStoreForTests() {
  current = null;
}
