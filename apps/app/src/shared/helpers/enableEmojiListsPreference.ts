import { useSyncExternalStore } from 'react';

/**
 * Whether an emoji-led line (`🚀 Launch plan`) is an emoji list item. On by default; off makes it an ordinary paragraph.
 * App-wide, not per-Space, like the Show tag emojis and Italic font choices: raw per-value localStorage with a change
 * notification so open pages follow a change made in Settings without a restart.
 *
 * This changes *parsing*, not just appearance: the editor and the read-only renderer pick the grammar without
 * `emojiListSyntax` (`markdownGrammarFor`), so no `EmojiList`/`EmojiListMark` node exists, and with it no marker,
 * hanging indent or list keyboard behaviour. Nothing is written to a note: the Markdown on disk is unchanged in either
 * state, and turning the setting back on restores the list behaviour for the same text. The vault's own ingest
 * (tag parsing, the parsed-note cache) always uses the default grammar, since what it stores cannot depend on a
 * per-device preference — and a line's tags are the same whether it is a list item or a paragraph.
 */
export const DEFAULT_ENABLE_EMOJI_LISTS = true;

const STORAGE_KEY = 'clutter-enable-emoji-lists';

export function readEnableEmojiLists(): boolean {
  try {
    // Only an explicit "false" turns it off; a missing, cleared or unrecognised value is the default (on).
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return DEFAULT_ENABLE_EMOJI_LISTS;
  }
}

const listeners = new Set<() => void>();

/** Saves the choice. Choosing the default removes the saved value, so a missing value is the default again. */
export function writeEnableEmojiLists(enabled: boolean): void {
  try {
    if (enabled === DEFAULT_ENABLE_EMOJI_LISTS) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, 'false');
    }
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }

  listeners.forEach((listener) => listener());
}

export function subscribeEnableEmojiLists(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current choice, re-read (and the component re-rendered) whenever Settings changes it. */
export function useEnableEmojiLists(): boolean {
  return useSyncExternalStore(subscribeEnableEmojiLists, readEnableEmojiLists);
}
