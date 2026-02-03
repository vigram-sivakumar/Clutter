/**
 * Slash Command Types
 *
 * Defines the structure of slash commands for the block editor.
 */

import type { BlockType } from '../types/Block';
import type { LexicalEditor } from 'lexical';

/**
 * Category for grouping commands
 */
export type CommandCategory = 'basic' | 'lists' | 'decoratives' | 'dividers';

/**
 * A single slash command
 */
export interface SlashCommand {
  /** Unique ID for the command */
  id: string;

  /** Display name shown in menu */
  label: string;

  /** Optional description */
  description?: string;

  /** Search keywords (in addition to label) */
  keywords?: string[];

  /** Icon component from @clutter/ui */
  icon?: React.ReactNode;

  /** Command category */
  category: CommandCategory;

  /** Block type this command creates (if applicable) */
  blockType?: BlockType;

  /** Execute the command */
  execute: (context: CommandContext) => void;
}

/**
 * Context passed to command execution
 */
export interface CommandContext {
  /** The Lexical editor instance */
  editor: LexicalEditor;

  /** Current block ID */
  blockId: string;

  /** Query string from slash menu (e.g., "head" from "/head") */
  query: string;

  /** Close the command menu */
  closeMenu: () => void;
}

/**
 * Command registry
 */
export interface CommandRegistry {
  /** All registered commands */
  commands: SlashCommand[];

  /** Get commands by category */
  getByCategory: (category: CommandCategory) => SlashCommand[];

  /** Search commands by query */
  search: (query: string) => SlashCommand[];

  /** Get command by ID */
  getById: (id: string) => SlashCommand | undefined;
}
