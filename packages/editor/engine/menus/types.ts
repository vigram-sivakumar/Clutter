/**
 * Menu System Types
 *
 * Unified type system for all floating menus (slash, @mention, #hashtag, toolbar).
 * Single source of truth for menu architecture.
 */

import type { LexicalEditor } from 'lexical';

/**
 * Why a menu closed
 */
export type MenuReason =
  | 'commit' // User selected an item
  | 'escape' // User pressed Escape
  | 'blur' // Editor lost focus
  | 'typing' // User typed something that invalidates the menu
  | 'scroll' // Editor scrolled
  | 'cancel'; // Programmatic cancellation

/**
 * What action to take
 */
export type MenuIntent =
  | {
      type: 'format';
      format: 'bold' | 'italic' | 'underline' | 'code' | 'strikethrough';
    }
  | { type: 'highlight'; color: string }
  | { type: 'textColor'; color: string }
  | { type: 'link'; url: string }
  | { type: 'insertBlock'; blockType: string }
  | {
      type: 'insertMention';
      mentionType: 'note' | 'folder' | 'date';
      id: string;
      display: string;
    }
  | { type: 'insertHashtag'; tag: string }
  | { type: 'dismiss' };

/**
 * Where the menu anchors to
 */
export type AnchorSource =
  | { type: 'caret'; blockId: string } // At cursor position
  | { type: 'selection'; blockId: string } // At text selection
  | { type: 'block'; blockId: string } // At block position
  | { type: 'rect'; rect: DOMRect }; // At arbitrary rect

/**
 * Menu type for priority resolution
 */
export type MenuType = 'toolbar' | 'slash' | 'mention' | 'hashtag';

/**
 * Menu priority (higher = takes precedence)
 */
export const MENU_PRIORITY: Record<MenuType, number> = {
  toolbar: 40,
  slash: 30,
  mention: 20,
  hashtag: 10,
};

/**
 * Menu configuration
 */
export interface MenuConfig {
  type: MenuType;
  anchor: AnchorSource;
  query?: string;
  items?: unknown[]; // Menu-specific item type
  blockId: string;
}

/**
 * Menu state
 */
export interface MenuState {
  isOpen: boolean;
  type: MenuType | null;
  anchor: AnchorSource | null;
  query: string;
  selectedIndex: number;
  blockId: string | null;
}

/**
 * Menu controller interface (single source of truth for all menus)
 */
export interface MenuController {
  /** Current menu state */
  state: MenuState;

  /** Open a menu with config */
  open(config: MenuConfig): void;

  /** Close active menu */
  close(reason: MenuReason): void;

  /** Update query (for search/filter) */
  updateQuery(query: string): void;

  /** Navigate selection */
  navigate(direction: 'up' | 'down'): void;

  /** Commit selected item */
  commit(intent: MenuIntent): void;

  /** Check if a menu type can open (priority check) */
  canOpen(type: MenuType): boolean;

  /** Subscribe to state changes */
  subscribe(listener: (state: MenuState) => void): () => void;
}

/**
 * Menu context for plugins
 */
export interface MenuContext {
  editor: LexicalEditor;
  blockId: string;
  controller: MenuController;
}
