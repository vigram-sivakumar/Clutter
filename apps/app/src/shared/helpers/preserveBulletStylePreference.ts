import { useSyncExternalStore } from 'react';

/**
 * Whether unordered list markers keep the style they were written in: `-` and `+` show as themselves, `*` as a dot. On by
 * default; off shows a dot (•) for every unordered marker. In the editor and in the rendered note preview.
 * App-wide, not per-Space, like the Show tag emojis and Italic font choices: raw per-value localStorage with a change
 * notification so open pages follow a change made in Settings without a restart.
 *
 * Presentation only: the Markdown source keeps its `-`/`+`/`*` either way and nothing is written to a note. Numbered lists,
 * task checkboxes and emoji lists are not unordered markers and never change. The choice reaches CSS as one attribute on
 * the root element (`data-markdown-bullet-style="dot"`, present only while the setting is off), kept in step by
 * `installPreserveBulletStyleSync`; MarkdownEditor.css and NotePageCanvas.css read it.
 */
export const DEFAULT_PRESERVE_BULLET_STYLE = true;

const STORAGE_KEY = 'clutter-preserve-bullet-style';
const ATTRIBUTE = 'data-markdown-bullet-style';

export function readPreserveBulletStyle(): boolean {
  try {
    // Only an explicit "false" turns it off; a missing, cleared or unrecognised value is the default (on).
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return DEFAULT_PRESERVE_BULLET_STYLE;
  }
}

const listeners = new Set<() => void>();

/** Saves the choice. Choosing the default removes the saved value, so a missing value is the default again. */
export function writePreserveBulletStyle(preserve: boolean): void {
  try {
    if (preserve === DEFAULT_PRESERVE_BULLET_STYLE) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, 'false');
    }
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }

  listeners.forEach((listener) => listener());
}

export function subscribePreserveBulletStyle(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current choice, re-read (and the component re-rendered) whenever Settings changes it. */
export function usePreserveBulletStyle(): boolean {
  return useSyncExternalStore(subscribePreserveBulletStyle, readPreserveBulletStyle);
}

function applyAttribute(): void {
  const root = document.documentElement;
  if (readPreserveBulletStyle()) {
    root.removeAttribute(ATTRIBUTE);
  } else {
    root.setAttribute(ATTRIBUTE, 'dot');
  }
}

/**
 * Applies the saved choice to the root element now (before first paint, when called from the entry point) and again
 * on every change. Called once for the life of the page; returns the unsubscribe.
 */
export function installPreserveBulletStyleSync(): () => void {
  applyAttribute();
  return subscribePreserveBulletStyle(applyAttribute);
}
