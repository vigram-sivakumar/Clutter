/**
 * @clutter/editor - Behavioral Editing Engine
 *
 * This package owns all editor behavior, structure, and transforms.
 * It is independent of app state and domain logic.
 *
 * The app provides data through adapters (see apps/desktop/adapters/).
 * The editor emits intent, never mutates app state directly.
 */

// Editor-specific types and projections
export * from './types';

// Editor-specific tokens (semantic)
export * from './tokens';

// Context and Provider (Dependency Injection)
export { EditorProvider } from './context/EditorProvider';
export { useEditorContext } from './context/EditorContext';
export type {
  EditorContextValue,
  EditorTagMetadata,
} from './context/EditorContext';

// Core editor component
export { EditorCore } from './core/EditorCore';
export type { EditorCoreHandle } from './core/EditorCore';

// Extensions: Nodes
export { Document } from './extensions/nodes/Document';
export { Text } from './extensions/nodes/Text';
export { Paragraph } from './extensions/nodes/Paragraph';
export { Heading } from './extensions/nodes/Heading';
export { ListBlock } from './extensions/nodes/ListBlock';
export { Blockquote } from './extensions/nodes/Blockquote';
export { CodeBlock } from './extensions/nodes/CodeBlock';
export { HorizontalRule } from './extensions/nodes/HorizontalRule';
export { Callout } from './extensions/nodes/Callout';

// Extensions: Marks
export { Bold } from './extensions/marks/Bold';
export { Italic } from './extensions/marks/Italic';
export { Underline } from './extensions/marks/Underline';
export { Strike } from './extensions/marks/Strike';
export { Code } from './extensions/marks/Code';
export { WavyUnderline } from './extensions/marks/WavyUnderline';
export { Link } from './extensions/marks/Link';
export { CustomHighlight } from './extensions/marks/Highlight';
export { TextColor } from './extensions/marks/TextColor';

// Plugins
export { MarkdownShortcuts } from './plugins/MarkdownShortcuts';
export {
  SlashCommands,
  SLASH_COMMANDS,
  SLASH_PLUGIN_KEY,
  filterSlashCommands,
} from './plugins/SlashCommands';
export type { SlashCommand } from './plugins/SlashCommands';
export { BackspaceHandler } from './plugins/BackspaceHandler';
export { EscapeMarks } from './plugins/EscapeMarks';
export { DoubleSpaceEscape } from './plugins/DoubleSpaceEscape';

// Components: Block renderers
export { SlashCommandMenu } from './components/SlashCommandMenu';
export {
  BlockWrapper,
  MarkerContainer,
  blockStyles,
  getBlockContainerStyle,
  getMarkerStyle,
  getContentStyle,
} from './components/BlockWrapper';
export { Paragraph as ParagraphComponent } from './components/Paragraph';
export { Heading as HeadingComponent } from './components/Heading';
export { ListBlock as ListBlockComponent } from './components/ListBlock';
export { Blockquote as BlockquoteComponent } from './components/Blockquote';
export { CodeBlock as CodeBlockComponent } from './components/CodeBlock';
export { HorizontalRule as HorizontalRuleComponent } from './components/HorizontalRule';
export { Callout as CalloutComponent } from './components/Callout';

// Utils
export { addTagToBlock } from './utils/tagUtils';
export { isMultiBlockSelection } from './utils/multiSelection';

// Core: Structural delete state (sentinel for DEV invariants)
export {
  beginStructuralDelete,
  endStructuralDelete,
  isStructuralDeleteInProgress,
} from './core/structuralDeleteState';
