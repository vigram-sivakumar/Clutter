import { useSyncExternalStore } from 'react';

/**
 * Whether typing `> ` (a `>` and then the space that completes the marker) starts a Clutter-native quote (`" `) instead
 * of a standard Markdown blockquote. Off by default. App-wide, not per-Space, like the Show tag emojis and Italic font
 * choices: raw per-value localStorage with a change notification, so open pages follow a change made in Settings
 * without a restart.
 *
 * A typing preference, not a migration: it is read at the moment the space is typed (`closeBracketsQuoteMarker.ts`) and
 * nothing else ever consults it. Existing `>` quotes, pasted text, programmatic edits and the saved files are never
 * rewritten, and turning it off leaves any `" ` quotes already written exactly as they are.
 */
export const DEFAULT_PREFER_CLUTTER_QUOTE_SYNTAX = false;

const STORAGE_KEY = 'clutter-prefer-clutter-quote-syntax';

export function readPreferClutterQuoteSyntax(): boolean {
  try {
    // Only an explicit "true" turns it on; a missing, cleared or unrecognised value is the default (off).
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return DEFAULT_PREFER_CLUTTER_QUOTE_SYNTAX;
  }
}

const listeners = new Set<() => void>();

/** Saves the choice. Choosing the default removes the saved value, so a missing value is the default again. */
export function writePreferClutterQuoteSyntax(enabled: boolean): void {
  try {
    if (enabled === DEFAULT_PREFER_CLUTTER_QUOTE_SYNTAX) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }

  listeners.forEach((listener) => listener());
}

export function subscribePreferClutterQuoteSyntax(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current choice, re-read (and the component re-rendered) whenever Settings changes it. */
export function usePreferClutterQuoteSyntax(): boolean {
  return useSyncExternalStore(subscribePreferClutterQuoteSyntax, readPreferClutterQuoteSyntax);
}
