import type { ShortcutKeySpec } from './shortcuts';
import type { ShortcutRowGroup } from './shortcutRows';

/**
 * The Markdown guide dialog's content: the editor's own keys, which the global list (shortcuts.ts) leaves out.
 *
 * Only what is useful and not obvious: Clutter's custom Markdown behavior and the CodeMirror commands people would not
 * guess. Conventional text-editing keys (select all, move by word or line, delete a word, undo and redo) are left out
 * on purpose. Every row here was checked against the editor; `markdownShortcuts.test.tsx` presses each key on a real
 * editor, so a row cannot stay after its key stops working. Not listed yet: tables (their keys are only unit-tested).
 */
const command: ShortcutKeySpec = 'command';
const option: ShortcutKeySpec = 'option';
const control: ShortcutKeySpec = 'control';
const shift: ShortcutKeySpec = 'shift';
const key = (label: string): ShortcutKeySpec => ({ label });

export const MARKDOWN_SHORTCUT_GROUPS: readonly ShortcutRowGroup[] = [
  {
    title: 'Text formatting',
    rows: [
      { id: 'bold', label: 'Bold', keys: [command, key('B')] },
      { id: 'italic', label: 'Italic', keys: [command, key('I')] },
      { id: 'underline', label: 'Underline', description: 'Paragraphs and headings. Wraps the selection in <u></u>', keys: [command, key('U')] },
      { id: 'inline-code', label: 'Inline code', description: 'Wraps the selection', keys: [command, key('E')] },
      { id: 'inline-code-typed', label: 'Inline code', description: 'Type backticks around text', trigger: '`text`' },
      { id: 'highlight', label: 'Highlight', trigger: '==text==' },
      { id: 'strikethrough', label: 'Strikethrough', trigger: '~~text~~' },
      { id: 'code-block', label: 'Code block', description: 'Type three backticks, and the closing fence is added', trigger: '```' },
    ],
  },
  {
    title: 'Lists',
    rows: [
      { id: 'task-list', label: 'Task list', trigger: '- [ ]' },
      { id: 'quick-task', label: 'Quick task', description: 'Type [] and a space at the start of a line', trigger: '[]' },
      { id: 'indent', label: 'Indent', keys: [key('Tab')] },
      { id: 'outdent', label: 'Outdent', keys: [shift, key('Tab')] },
      { id: 'continue', label: 'Continue list or quote', keys: [key('Enter')] },
      { id: 'exit', label: 'Exit list or quote', description: 'On an empty item', keys: [key('Enter')] },
      { id: 'line-break', label: 'Insert line break', keys: [shift, key('Enter')] },
      { id: 'remove-marker', label: 'Remove list marker or checkbox', description: 'At the start of an item', keys: [key('Delete')] },
    ],
  },
  {
    title: 'Links and suggestions',
    rows: [
      { id: 'wiki-link', label: 'Wiki link', description: 'Suggests notes as you type', trigger: '[[Page]]' },
      { id: 'wiki-link-alias', label: 'Wiki-link alias', description: 'Show different text for the link', trigger: '[[Page|alias]]' },
      { id: 'wiki-link-heading', label: 'Link to heading', description: 'Suggests the note’s headings', trigger: '[[Page#Heading]]' },
      { id: 'embed', label: 'Embed', description: 'An image, a PDF or another note', trigger: '![[file.png]]' },
      { id: 'suggest-tags', label: 'Suggest tags', trigger: '#' },
      { id: 'suggest-dates', label: 'Suggest dates', trigger: '@' },
    ],
  },
  {
    title: 'Dividers',
    rows: [
      { id: 'divider', label: 'Divider', description: 'Leave a blank line above it, or the line above becomes a heading', trigger: '---' },
      { id: 'divider-wavy', label: 'Wavy divider', trigger: '~---~' },
      { id: 'divider-double', label: 'Double divider', trigger: '=---=' },
      { id: 'divider-dotted', label: 'Dotted divider', trigger: '.---.' },
      { id: 'divider-labeled', label: 'Labeled divider', description: 'Add a label to any divider style', trigger: '---Title---' },
    ],
  },
  {
    title: 'Editing',
    rows: [
      { id: 'move-line-up', label: 'Move line up', keys: [option, 'arrowUp'] },
      { id: 'move-line-down', label: 'Move line down', keys: [option, 'arrowDown'] },
      { id: 'duplicate-line-above', label: 'Duplicate line above', keys: [option, shift, 'arrowUp'] },
      { id: 'duplicate-line-below', label: 'Duplicate line below', keys: [option, shift, 'arrowDown'] },
      { id: 'delete-line', label: 'Delete line', keys: [shift, command, key('K')] },
      { id: 'insert-line-below', label: 'Insert line below', keys: [command, key('Enter')] },
      { id: 'fold', label: 'Fold', keys: [option, command, 'bracketLeft'] },
      { id: 'unfold', label: 'Unfold', keys: [option, command, 'bracketRight'] },
      { id: 'fold-all', label: 'Fold all', keys: [control, option, 'bracketLeft'] },
      { id: 'unfold-all', label: 'Unfold all', keys: [control, option, 'bracketRight'] },
    ],
  },
  {
    title: 'Selection',
    rows: [
      { id: 'add-cursor-above', label: 'Add cursor above', keys: [option, command, 'arrowUp'] },
      { id: 'add-cursor-below', label: 'Add cursor below', keys: [option, command, 'arrowDown'] },
      { id: 'matching-bracket', label: 'Jump to matching bracket', keys: [shift, command, key('\\')] },
    ],
  },
];
