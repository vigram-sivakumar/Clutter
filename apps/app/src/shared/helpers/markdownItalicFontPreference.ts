import { useSyncExternalStore } from 'react';

/**
 * Whether Markdown italic text gets its dedicated font treatment — the `--font-italic` family and the
 * `--font-italic-scale` size (tokens.css) — in the editor and the rendered note preview. Off by default.
 * App-wide, not per-Space, like the Show tag emojis and Date format choices: raw per-value localStorage with a change
 * notification so open pages follow a change made in Settings without a restart.
 *
 * Presentation only: italics stay italic either way (`font-style: italic`), and nothing is written to a note. The
 * choice reaches CSS as one attribute on the root element (`data-markdown-italic-font="off"`, present only while it is
 * off), kept in step by `installMarkdownItalicFontSync`; tokens.css reads it to neutralise the two italic tokens.
 */
export const DEFAULT_MARKDOWN_ITALIC_FONT = false;

const STORAGE_KEY = 'clutter-markdown-italic-font';
const ATTRIBUTE = 'data-markdown-italic-font';

export function readMarkdownItalicFont(): boolean {
  try {
    // Only an explicit "true" turns it on; a missing, cleared or unrecognised value is the default (off).
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return DEFAULT_MARKDOWN_ITALIC_FONT;
  }
}

const listeners = new Set<() => void>();

/** Saves the choice. Choosing the default removes the saved value, so a missing value is the default again. */
export function writeMarkdownItalicFont(enabled: boolean): void {
  try {
    if (enabled === DEFAULT_MARKDOWN_ITALIC_FONT) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }

  listeners.forEach((listener) => listener());
}

export function subscribeMarkdownItalicFont(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current choice, re-read (and the component re-rendered) whenever Settings changes it. */
export function useMarkdownItalicFont(): boolean {
  return useSyncExternalStore(subscribeMarkdownItalicFont, readMarkdownItalicFont);
}

function applyAttribute(): void {
  const root = document.documentElement;
  if (readMarkdownItalicFont()) {
    root.removeAttribute(ATTRIBUTE);
  } else {
    root.setAttribute(ATTRIBUTE, 'off');
  }
}

/**
 * Applies the saved choice to the root element now (before first paint, when called from the entry point) and again
 * on every change. Called once for the life of the page; returns the unsubscribe.
 */
export function installMarkdownItalicFontSync(): () => void {
  applyAttribute();
  return subscribeMarkdownItalicFont(applyAttribute);
}
