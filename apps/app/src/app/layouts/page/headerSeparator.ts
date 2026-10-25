import { useSyncExternalStore } from 'react';

import type { DividerVariant } from './PageDivider';

/**
 * Whether the rule between a page's header (title and Properties list) and its body is shown:
 * - `automatic`: whenever the page shows its Properties section (the rows, or just its "Add a property" row);
 * - `show`: always, with or without the Properties section;
 * - `hide`: never.
 * Visibility only — the rule's look (solid, wavy, dotted) is the divider's own `variant` and is never read here.
 */
export type HeaderSeparatorMode = 'automatic' | 'show' | 'hide';

export const DEFAULT_HEADER_SEPARATOR_MODE: HeaderSeparatorMode = 'automatic';

const MODES: readonly HeaderSeparatorMode[] = ['automatic', 'show', 'hide'];

const STORAGE_KEY = 'clutter-header-separator';

/**
 * App-global (not per-Space), the same raw per-value localStorage convention as the week start and the theme. A new key,
 * so nothing already stored is read or rewritten; anything missing or unrecognised is `automatic`.
 */
export function readHeaderSeparatorMode(): HeaderSeparatorMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return MODES.find((mode) => mode === stored) ?? DEFAULT_HEADER_SEPARATOR_MODE;
  } catch {
    return DEFAULT_HEADER_SEPARATOR_MODE;
  }
}

const listeners = new Set<() => void>();

export function writeHeaderSeparatorMode(mode: HeaderSeparatorMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Back to the defaults for both choices — Automatic and Line: removes the saved mode and the saved style, then notifies,
 * so every mounted page follows. Used by "Reset settings to defaults".
 */
export function resetHeaderSeparator(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STYLE_STORAGE_KEY);
  } catch {
    // Best-effort, like the writes above.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current mode, re-read whenever Settings changes it, so every mounted page follows. */
export function useHeaderSeparatorMode(): HeaderSeparatorMode {
  return useSyncExternalStore(subscribe, readHeaderSeparatorMode);
}

/** The one rule for whether the separator shows; `hasPropertiesSection` is the page's actual Properties section being on screen. */
export function shouldShowHeaderSeparator(mode: HeaderSeparatorMode, hasPropertiesSection: boolean): boolean {
  return mode === 'show' || (mode === 'automatic' && hasPropertiesSection);
}

/**
 * How the separator looks when it shows: the divider's own variants (solid, wavy, dotted — Line, Wavy, Dotted in Settings).
 * Independent of `HeaderSeparatorMode`: choosing one never reads or writes the other.
 */
export type HeaderSeparatorStyle = DividerVariant;

export const DEFAULT_HEADER_SEPARATOR_STYLE: HeaderSeparatorStyle = 'solid';

const STYLES: readonly HeaderSeparatorStyle[] = ['solid', 'wavy', 'dotted'];

const STYLE_STORAGE_KEY = 'clutter-header-separator-style';

/** Same convention as the mode, under its own key; anything missing or unrecognised is `solid` (Line). */
export function readHeaderSeparatorStyle(): HeaderSeparatorStyle {
  try {
    const stored = localStorage.getItem(STYLE_STORAGE_KEY);
    return STYLES.find((style) => style === stored) ?? DEFAULT_HEADER_SEPARATOR_STYLE;
  } catch {
    return DEFAULT_HEADER_SEPARATOR_STYLE;
  }
}

export function writeHeaderSeparatorStyle(style: HeaderSeparatorStyle): void {
  try {
    localStorage.setItem(STYLE_STORAGE_KEY, style);
  } catch {
    // Best-effort, as for the mode.
  }
  listeners.forEach((listener) => listener());
}

/** The current style, re-read whenever Settings changes it, so every mounted page follows. */
export function useHeaderSeparatorStyle(): HeaderSeparatorStyle {
  return useSyncExternalStore(subscribe, readHeaderSeparatorStyle);
}
