/**
 * Editor Types - Public Contract
 *
 * These types define the boundary between the editor and the app.
 * They are the frozen contract that all editor code submits to.
 */

export type {
  EditorDocument,
  TipTapJSON,
  TipTapNode,
  TipTapMark,
  SerializedEditorDocument,
} from './EditorDocument';

export type { EditorTag } from './EditorTag';
export type { EditorLinkedNote } from './EditorLinkedNote';
export type { EditorFolder } from '../utils/entitySearch';

export type { EditorTheme, EditorThemeColors } from './EditorTheme';
export { isEditorTheme } from './EditorTheme';
