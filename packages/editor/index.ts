/**
 * @clutter/editor - Block-First Editing Engine
 *
 * Custom block-first editor with Lexical for rich text editing.
 * Tree-based architecture with explicit parent/children relationships.
 *
 * Architecture:
 * - Block engine: Custom tree structure (ID-based, not position-based)
 * - Text editing: Lexical (per-block rich text)
 * - State: Zustand + Immer
 * - Storage: Native blocks format (v2)
 * - Migration: PM JSON → Blocks (one-way)
 */

// Re-export everything from engine
export * from './engine';

// Theme (generic, editor-agnostic)
export type { EditorTheme } from './theme/EditorThemeContext';
export {
  EditorThemeProvider,
  useEditorTheme,
} from './theme/EditorThemeContext';
