/**
 * Slash Commands Plugin
 * Triggers menu on "/" and manages command execution
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/core';
import type { ListType } from '../types';
import { replaceBlock } from '../utils/blockReplacement';
import { createBlockNode } from '../domain/createBlock';

export const SLASH_PLUGIN_KEY = new PluginKey('slashCommands');

export type CommandGroup = 'text' | 'lists' | 'media' | 'callouts';

export interface SlashCommand {
  id: string;
  title: string;
  description: string;
  icon: string; // Lucide icon name
  keywords: string[]; // For fuzzy search
  group: CommandGroup; // PHASE 5: Command grouping
  // eslint-disable-next-line no-unused-vars
  execute: (editor: Editor, slashRange?: { from: number; to: number }) => void;
}

// Extend Tiptap's storage type
// eslint-disable-next-line no-unused-vars
declare module '@tiptap/core' {
  // eslint-disable-next-line no-unused-vars
  interface Storage {
    slashCommands: {
      isOpen: boolean;
      query: string;
      startPos: number | null;
      selectedIndex: number;
      manuallyClosedAt: number | null; // PHASE 5: Track manual close to prevent immediate reopen
      userClosed: boolean; // Track explicit user dismissal (ESC or click-outside)
    };
  }
}

// Helper to find the correct block boundaries (handles wrapper blocks)
function findBlockBoundaries(state: any, $from: any) {
  const paragraph = $from.parent;

  // Start with the current block (paragraph)
  let blockStart = $from.before($from.depth);
  let blockEnd = $from.after($from.depth);

  // Check if we're inside a wrapper block (listBlock, blockquote, callout, toggleBlock)
  // If so, replace the entire wrapper instead of just the inner paragraph
  for (let depth = $from.depth - 1; depth >= 1; depth--) {
    const node = $from.node(depth);
    const wrapperTypes = ['listBlock', 'blockquote', 'callout', 'toggleBlock'];
    if (wrapperTypes.includes(node.type.name)) {
      // Replace the wrapper if it only contains our paragraph
      if (node.content.size === paragraph.nodeSize) {
        blockStart = $from.before(depth);
        blockEnd = $from.after(depth);
      }
      break;
    }
  }

  return { blockStart, blockEnd };
}

// Helper to extract attributes to preserve when converting blocks
function getPreservedAttrs(currentBlock: any) {
  // 🔥 FLAT MODEL: Only preserve indent
  // 🔒 BLOCK IDENTITY LAW: NEVER preserve blockId across type changes
  return {
    indent: currentBlock.attrs?.indent ?? 0,
  };
}

// Simple wrapper functions using shared block replacement utility
function createListBlock(
  editor: Editor,
  listType: ListType,
  slashRange?: { from: number; to: number }
) {
  const { view } = editor;
  const { state } = view;
  const { $from } = state.selection;

  const { blockStart, blockEnd } = findBlockBoundaries(state, $from);
  const currentBlock = $from.parent;

  // Calculate content without slash text (use paragraph position for content extraction)
  const paragraphStart = $from.before($from.depth);
  const content = slashRange
    ? getContentWithoutSlash(currentBlock, slashRange, paragraphStart)
    : currentBlock.content;

  // ✅ Preserve structural context when converting
  const preservedAttrs = getPreservedAttrs(currentBlock);
  const replacement = createBlockNode(state.schema, {
    type: 'listBlock',
    listType,
    checked: listType === 'task' ? false : null,
    indent: preservedAttrs.indent,
    content,
  });

  // Preserve cursor position
  const cursorOffset = calculateCursorOffset($from.pos, blockStart, slashRange);
  replaceBlock(view, blockStart, blockEnd, replacement, { cursorOffset });
}

function createParagraph(
  editor: Editor,
  slashRange?: { from: number; to: number }
) {
  const { view } = editor;
  const { state } = view;
  const { $from } = state.selection;

  const { blockStart, blockEnd } = findBlockBoundaries(state, $from);
  const currentBlock = $from.parent;

  const paragraphStart = $from.before($from.depth);
  const content = slashRange
    ? getContentWithoutSlash(currentBlock, slashRange, paragraphStart)
    : currentBlock.content;

  // ✅ Preserve structural context when converting
  const preservedAttrs = getPreservedAttrs(currentBlock);
  const replacement = createBlockNode(state.schema, {
    type: 'paragraph',
    indent: preservedAttrs.indent,
    content,
  });

  // Preserve cursor position
  const cursorOffset = calculateCursorOffset($from.pos, blockStart, slashRange);
  replaceBlock(view, blockStart, blockEnd, replacement, { cursorOffset });
}

function createHeading(
  editor: Editor,
  level: 1 | 2 | 3,
  slashRange?: { from: number; to: number }
) {
  const { view } = editor;
  const { state } = view;
  const { $from } = state.selection;

  const { blockStart, blockEnd } = findBlockBoundaries(state, $from);
  const currentBlock = $from.parent;

  const paragraphStart = $from.before($from.depth);
  const content = slashRange
    ? getContentWithoutSlash(currentBlock, slashRange, paragraphStart)
    : currentBlock.content;

  // ✅ Preserve structural context when converting
  const preservedAttrs = getPreservedAttrs(currentBlock);
  const replacement = createBlockNode(state.schema, {
    type: 'heading',
    headingLevel: level,
    indent: preservedAttrs.indent,
    content,
  });

  // Preserve cursor position
  const cursorOffset = calculateCursorOffset($from.pos, blockStart, slashRange);
  replaceBlock(view, blockStart, blockEnd, replacement, { cursorOffset });
}

function createBlockquote(
  editor: Editor,
  slashRange?: { from: number; to: number }
) {
  const { view } = editor;
  const { state } = view;
  const { $from } = state.selection;

  const { blockStart, blockEnd } = findBlockBoundaries(state, $from);
  const currentBlock = $from.parent;

  const paragraphStart = $from.before($from.depth);
  const content = slashRange
    ? getContentWithoutSlash(currentBlock, slashRange, paragraphStart)
    : currentBlock.content;

  // ✅ Preserve structural context when converting
  const preservedAttrs = getPreservedAttrs(currentBlock);
  const replacement = createBlockNode(state.schema, {
    type: 'blockquote',
    indent: preservedAttrs.indent,
    content,
  });

  // Preserve cursor position
  const cursorOffset = calculateCursorOffset($from.pos, blockStart, slashRange);
  replaceBlock(view, blockStart, blockEnd, replacement, { cursorOffset });
}

function createCallout(
  editor: Editor,
  calloutType: 'info' | 'warning' | 'error' | 'success',
  slashRange?: { from: number; to: number }
) {
  const { view } = editor;
  const { state } = view;
  const { $from } = state.selection;

  const { blockStart, blockEnd } = findBlockBoundaries(state, $from);
  const currentBlock = $from.parent;

  const paragraphStart = $from.before($from.depth);
  const content = slashRange
    ? getContentWithoutSlash(currentBlock, slashRange, paragraphStart)
    : currentBlock.content;

  // ✅ Preserve structural context when converting
  const preservedAttrs = getPreservedAttrs(currentBlock);
  // Create callout node directly due to 'type' property collision
  const calloutNode = state.schema.nodes.callout.create(
    {
      blockId: crypto.randomUUID(),
      indent: preservedAttrs.indent,
      collapsed: false,
      type: calloutType as 'info' | 'warning' | 'error' | 'success',
    },
    content
  );
  const replacement = calloutNode;

  // Preserve cursor position
  const cursorOffset = calculateCursorOffset($from.pos, blockStart, slashRange);
  replaceBlock(view, blockStart, blockEnd, replacement, { cursorOffset });
}

function createCodeBlock(
  editor: Editor,
  slashRange?: { from: number; to: number }
) {
  const { view } = editor;
  const { state } = view;
  const { $from } = state.selection;

  const { blockStart, blockEnd } = findBlockBoundaries(state, $from);
  const currentBlock = $from.parent;

  // Code blocks use plain text
  let textContent = currentBlock.textContent;
  if (slashRange) {
    const paragraphStart = $from.before($from.depth);
    const slashStart = slashRange.from - paragraphStart - 1;
    const slashEnd = slashRange.to - paragraphStart - 1;
    textContent =
      textContent.substring(0, slashStart) + textContent.substring(slashEnd);
  }

  // ✅ Preserve structural context when converting
  const preservedAttrs = getPreservedAttrs(currentBlock);
  const replacement = createBlockNode(state.schema, {
    type: 'codeBlock',
    indent: preservedAttrs.indent,
    content: textContent,
  });

  replaceBlock(view, blockStart, blockEnd, replacement);
}

function createToggleBlock(
  editor: Editor,
  slashRange?: { from: number; to: number }
) {
  // PHASE 4: Create flat toggle (listType: 'toggle')
  // Reuses existing ListBlock creation pipeline
  createListBlock(editor, 'toggle', slashRange);
}

// Helper to extract content without slash text
function getContentWithoutSlash(
  currentBlock: any,
  slashRange: { from: number; to: number },
  blockStart: number
) {
  const slashStart = slashRange.from - blockStart - 1;
  const slashEnd = slashRange.to - blockStart - 1;
  const before = currentBlock.content.cut(0, slashStart);
  const after = currentBlock.content.cut(slashEnd);
  return before.append(after);
}

/**
 * Calculate cursor offset after removing slash command
 * Preserves cursor position relative to the content
 */
function calculateCursorOffset(
  cursorPos: number,
  blockStart: number,
  slashRange?: { from: number; to: number }
): number {
  if (!slashRange) {
    // No slash command to remove, cursor stays at same offset
    return cursorPos - blockStart - 1;
  }

  const slashStart = slashRange.from;
  const slashEnd = slashRange.to;
  const slashLength = slashEnd - slashStart;

  // Calculate offset relative to block content
  const offsetInBlock = cursorPos - blockStart - 1;
  const slashStartInBlock = slashStart - blockStart - 1;

  if (offsetInBlock <= slashStartInBlock) {
    // Cursor is before slash - stays at same position
    return offsetInBlock;
  } else {
    // Cursor is after slash - subtract the slash length
    return offsetInBlock - slashLength;
  }
}

function createHorizontalRule(editor: Editor, style: 'plain' | 'wavy') {
  const { view } = editor;
  const { state } = view;
  const { $from } = state.selection;

  const { blockStart, blockEnd } = findBlockBoundaries(state, $from);
  const currentBlock = $from.parent;

  // ✅ Preserve structural context (indent only)
  const preservedAttrs = getPreservedAttrs(currentBlock);

  // HR is always an array: [hr, paragraph] - just like markdown shortcuts
  const replacement = [
    createBlockNode(state.schema, {
      type: 'horizontalRule',
      style,
      indent: preservedAttrs.indent,
    }),
    createBlockNode(state.schema, {
      type: 'paragraph',
      indent: preservedAttrs.indent,
    }),
  ];

  replaceBlock(view, blockStart, blockEnd, replacement);
}

// Command registry - all available commands
// PHASE 5: Organized by groups for better UX
export const SLASH_COMMANDS: SlashCommand[] = [
  // Text blocks
  {
    id: 'text',
    title: 'Text',
    description: 'Plain text paragraph',
    icon: 'Pilcrow',
    keywords: ['text', 'paragraph', 'normal', 'plain', 'p'],
    group: 'text',
    execute: (editor, slashRange) => createParagraph(editor, slashRange),
  },
  {
    id: 'heading1',
    title: 'Heading 1',
    description: 'Large section heading',
    icon: 'Heading1',
    keywords: ['h1', 'heading', 'title', 'large'],
    group: 'text',
    execute: (editor, slashRange) => createHeading(editor, 1, slashRange),
  },
  {
    id: 'heading2',
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: 'Heading2',
    keywords: ['h2', 'heading', 'subtitle'],
    group: 'text',
    execute: (editor, slashRange) => createHeading(editor, 2, slashRange),
  },
  {
    id: 'heading3',
    title: 'Heading 3',
    description: 'Small section heading',
    icon: 'Heading3',
    keywords: ['h3', 'heading'],
    group: 'text',
    execute: (editor, slashRange) => createHeading(editor, 3, slashRange),
  },

  // Lists
  {
    id: 'bulletList',
    title: 'Bullet List',
    description: 'Unordered list',
    icon: 'List',
    keywords: ['bullet', 'unordered', 'list', 'ul'],
    group: 'lists',
    execute: (editor, slashRange) =>
      createListBlock(editor, 'bullet', slashRange),
  },
  {
    id: 'numberedList',
    title: 'Numbered List',
    description: 'Ordered list',
    icon: 'ListOrdered',
    keywords: ['numbered', 'ordered', 'list', 'ol', '1.'],
    group: 'lists',
    execute: (editor, slashRange) =>
      createListBlock(editor, 'numbered', slashRange),
  },
  {
    id: 'taskList',
    title: 'Task List',
    description: 'List with checkboxes',
    icon: 'CheckSquare',
    keywords: ['todo', 'task', 'checkbox', 'check', '[]'],
    group: 'lists',
    execute: (editor, slashRange) =>
      createListBlock(editor, 'task', slashRange),
  },
  {
    id: 'toggleList',
    title: 'Toggle List',
    description: 'Collapsible list',
    icon: 'ChevronRight',
    keywords: ['toggle', 'collapse', 'accordion', 'fold'],
    group: 'lists',
    execute: (editor, slashRange) => createToggleBlock(editor, slashRange),
  },

  // Media & Blocks
  {
    id: 'quote',
    title: 'Quote',
    description: 'Blockquote',
    icon: 'Quote',
    keywords: ['quote', 'blockquote', 'citation'],
    group: 'media',
    execute: (editor, slashRange) => createBlockquote(editor, slashRange),
  },
  {
    id: 'code',
    title: 'Code Block',
    description: 'Code with syntax highlighting',
    icon: 'Code',
    keywords: ['code', 'codeblock', 'snippet', '```'],
    group: 'media',
    execute: (editor, slashRange) => createCodeBlock(editor, slashRange),
  },
  {
    id: 'divider',
    title: 'Divider',
    description: 'Horizontal line',
    icon: 'Minus',
    keywords: ['divider', 'hr', 'line', 'separator', '---'],
    group: 'media',
    execute: (editor) => createHorizontalRule(editor, 'plain'),
  },
  {
    id: 'dividerWavy',
    title: 'Wavy Divider',
    description: 'Wavy horizontal line',
    icon: 'WaveLine',
    keywords: ['wavy', 'divider', 'hr', 'line', '***'],
    group: 'media',
    execute: (editor) => createHorizontalRule(editor, 'wavy'),
  },

  // Callouts
  {
    id: 'calloutInfo',
    title: 'Info Callout',
    description: 'Informational callout',
    icon: 'Info',
    keywords: ['info', 'callout', 'note', 'information'],
    group: 'callouts',
    execute: (editor, slashRange) => createCallout(editor, 'info', slashRange),
  },
  {
    id: 'calloutWarning',
    title: 'Warning Callout',
    description: 'Warning callout',
    icon: 'AlertTriangle',
    keywords: ['warning', 'callout', 'caution', 'alert'],
    group: 'callouts',
    execute: (editor, slashRange) =>
      createCallout(editor, 'warning', slashRange),
  },
  {
    id: 'calloutError',
    title: 'Error Callout',
    description: 'Error callout',
    icon: 'XCircle',
    keywords: ['error', 'callout', 'danger', 'critical'],
    group: 'callouts',
    execute: (editor, slashRange) => createCallout(editor, 'error', slashRange),
  },
  {
    id: 'calloutSuccess',
    title: 'Success Callout',
    description: 'Success callout',
    icon: 'CheckCircle',
    keywords: ['success', 'callout', 'done', 'complete'],
    group: 'callouts',
    execute: (editor, slashRange) =>
      createCallout(editor, 'success', slashRange),
  },
];

// Filter commands based on query
export function filterSlashCommands(query: string): SlashCommand[] {
  if (!query) return SLASH_COMMANDS;

  const lowerQuery = query.toLowerCase();
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.title.toLowerCase().includes(lowerQuery) ||
      cmd.description.toLowerCase().includes(lowerQuery) ||
      cmd.keywords.some((kw) => kw.includes(lowerQuery))
  );
}

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  priority: 1000, // High priority to handle Enter before other extensions

  addStorage() {
    return {
      isOpen: false,
      query: '',
      startPos: null,
      selectedIndex: 0,
      manuallyClosedAt: null, // PHASE 5: Track manual close
      userClosed: false, // Track explicit user dismissal
    };
  },

  addKeyboardShortcuts() {
    return {
      // Tab: Select first command
      Tab: () => {
        const storage = this.editor.storage.slashCommands;

        if (!storage || !storage.isOpen || storage.startPos === null) {
          return false;
        }

        const commands = filterSlashCommands(storage.query);
        if (commands.length === 0) {
          return false;
        }

        // Select first command
        const command = commands[0];
        if (!command) return false;

        storage.isOpen = false;
        const { from } = this.editor.state.selection;
        const range = { from: storage.startPos, to: from };

        command.execute(this.editor, range);

        return true;
      },

      Enter: () => {
        const storage = this.editor.storage.slashCommands;

        if (!storage || !storage.isOpen || storage.startPos === null) {
          return false; // Let default Enter behavior work
        }

        const commands = filterSlashCommands(storage.query);
        const command = commands[storage.selectedIndex];

        if (!command) {
          return false;
        }

        // Close menu and get slash range
        storage.isOpen = false;
        storage.query = '';
        const { from } = this.editor.state.selection;
        const range = { from: storage.startPos, to: from };

        // Execute command with slash range - it handles deletion in single transaction
        command.execute(this.editor, range);

        return true; // Prevent default Enter behavior
      },

      ArrowUp: () => {
        const storage = this.editor.storage.slashCommands;

        if (!storage.isOpen) {
          return false;
        }

        const commands = filterSlashCommands(storage.query);
        if (commands.length > 0) {
          storage.selectedIndex =
            (storage.selectedIndex - 1 + commands.length) % commands.length;
          this.editor.view.dispatch(this.editor.state.tr);
        }

        return true;
      },

      ArrowDown: () => {
        const storage = this.editor.storage.slashCommands;

        if (!storage.isOpen) {
          return false;
        }

        const commands = filterSlashCommands(storage.query);
        if (commands.length > 0) {
          storage.selectedIndex = (storage.selectedIndex + 1) % commands.length;
          this.editor.view.dispatch(this.editor.state.tr);
        }

        return true;
      },

      // ESC is handled by FloatingMenu via dismissOnEscape prop
      // No need for duplicate handler here - UI layer owns dismissal interactions
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: SLASH_PLUGIN_KEY,

        view() {
          return {
            update(view, prevState) {
              const storage = editor.storage.slashCommands;
              const { from, to } = view.state.selection;
              const { $from } = view.state.selection;

              // Helper: Find slash command at cursor position
              const findSlashCommandAtCursor = () => {
                if (from !== to || editor.isActive('codeBlock')) {
                  return null;
                }

                const parent = $from.parent;
                const cursorPos = $from.parentOffset;

                // Walk backward from cursor to find slash, stopping at hard breaks or spaces
                let textBeforeCursor = '';
                let positionMap: number[] = []; // Map text index to document offset

                parent.forEach((node, offset) => {
                  if (offset >= cursorPos) return; // Skip nodes after cursor

                  if (node.type.name === 'hardBreak') {
                    // Hard break - reset search (start of new line)
                    textBeforeCursor = '';
                    positionMap = [];
                  } else if (node.isText && node.text) {
                    const nodeEnd = offset + node.nodeSize;
                    if (nodeEnd <= cursorPos) {
                      // Entire text node is before cursor
                      for (let i = 0; i < node.text.length; i++) {
                        textBeforeCursor += node.text[i];
                        positionMap.push(offset + i);
                      }
                    } else {
                      // Cursor is inside this text node
                      const charsBeforeCursor = cursorPos - offset;
                      for (let i = 0; i < charsBeforeCursor; i++) {
                        textBeforeCursor += node.text[i];
                        positionMap.push(offset + i);
                      }
                    }
                  }
                });

                // Search backward for slash command
                let slashIndex = -1;
                for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
                  if (textBeforeCursor[i] === '/') {
                    // Check if "/" is at start or after space
                    if (i === 0 || textBeforeCursor[i - 1] === ' ') {
                      slashIndex = i;
                      break;
                    }
                  } else if (textBeforeCursor[i] === ' ') {
                    // Hit a space - stop searching
                    break;
                  }
                }

                if (slashIndex === -1) return null;

                // Extract query
                const textFromSlash = textBeforeCursor.slice(slashIndex);
                const slashCommandMatch = textFromSlash.match(/^\/\w*/);

                if (!slashCommandMatch) return null;

                // Map back to document position
                const slashPos = $from.start() + positionMap[slashIndex];
                const query = slashCommandMatch[0].replace(/^\//, '');

                return { slashPos, query };
              };

              const slashCommandAtCursor = findSlashCommandAtCursor();

              // PHASE 5: Handle slash command detection (open, update, or close)
              if (slashCommandAtCursor) {
                const { slashPos, query } = slashCommandAtCursor;

                // Only proceed if there are matching commands
                const matchingCommands = filterSlashCommands(query);
                if (matchingCommands.length === 0) {
                  if (storage.isOpen) {
                    storage.isOpen = false;
                    storage.startPos = null;
                    storage.query = '';
                    view.dispatch(view.state.tr);
                  }
                  return;
                }

                // Check if we need to open or update the menu
                if (!storage.isOpen) {
                  // Don't auto-open if user explicitly closed the menu
                  if (storage.userClosed) {
                    return;
                  }

                  // Don't auto-open if menu was just manually closed (within 300ms)
                  const now = Date.now();
                  if (
                    storage.manuallyClosedAt &&
                    now - storage.manuallyClosedAt < 300
                  ) {
                    return;
                  }

                  // Only check if selection actually changed
                  const prevSelection = prevState.selection;
                  const cursorMovedForward = from > prevSelection.from;
                  const cursorJumped = Math.abs(from - prevSelection.from) > 1;

                  // Only auto-open on forward movement or jumps (clicks, arrow right)
                  // Don't auto-open on backspace (backward movement) to avoid interference
                  if (
                    (cursorMovedForward || cursorJumped) &&
                    (prevSelection.from !== from || prevSelection.to !== to)
                  ) {
                    storage.isOpen = true;
                    storage.query = query;
                    storage.startPos = slashPos;
                    storage.selectedIndex = 0;
                    storage.manuallyClosedAt = null;
                    view.dispatch(view.state.tr);
                  }
                } else if (storage.startPos !== slashPos) {
                  // Menu is open but we moved to a DIFFERENT slash command - update it
                  storage.query = query;
                  storage.startPos = slashPos;
                  storage.selectedIndex = 0;
                  view.dispatch(view.state.tr);
                }
              } else if (storage.isOpen) {
                // No slash command at cursor but menu is open - close it
                storage.isOpen = false;
                storage.startPos = null;
                storage.query = '';
                storage.userClosed = false; // Reset flag when slash is removed
                storage.manuallyClosedAt = Date.now();
                view.dispatch(view.state.tr);
              } else if (!slashCommandAtCursor) {
                // No slash command present - reset userClosed flag
                storage.userClosed = false;
              }
            },
          };
        },

        props: {
          decorations(state) {
            const storage = editor.storage.slashCommands;

            // Only show decoration when menu is open
            if (!storage.isOpen || storage.startPos === null) {
              return null;
            }

            // PHASE 5: Calculate FULL slash command range (not cursor-dependent)
            const { $from } = state.selection;
            const paragraphText = $from.parent.textContent;
            const slashStartInParagraph = storage.startPos - $from.start();
            const textFromSlash = paragraphText.slice(slashStartInParagraph);

            // Find the full slash command (stops at space or end)
            const match = textFromSlash.match(/^\/\w*/);
            const slashCommandText = match ? match[0] : '/';
            const endPos = storage.startPos + slashCommandText.length;

            // Create two decorations: one for "/" and one for the query text
            const decorations = [];

            // Decoration 1: The "/" symbol (accent color)
            decorations.push(
              Decoration.inline(storage.startPos, storage.startPos + 1, {
                class: 'slash-command-symbol',
              })
            );

            // Decoration 2: The query text after "/" (if any)
            if (slashCommandText.length > 1) {
              decorations.push(
                Decoration.inline(storage.startPos + 1, endPos, {
                  class: 'slash-command-query',
                })
              );
            }

            return DecorationSet.create(state.doc, decorations);
          },

          handleTextInput(view, from, _to, text) {
            // Don't trigger in code blocks
            if (editor.isActive('codeBlock')) {
              return false;
            }

            const { $from } = view.state.selection;

            // Space dismisses menu (allows typing literal "/")
            if (text === ' ' && editor.storage.slashCommands.isOpen) {
              editor.storage.slashCommands.isOpen = false;
              editor.storage.slashCommands.startPos = null;
              editor.storage.slashCommands.query = '';
              view.dispatch(view.state.tr);
              return false; // Let space be inserted
            }

            // Detect "/" at start of line or after space
            if (text === '/') {
              const textBefore = $from.parent.textContent.slice(
                0,
                $from.parentOffset
              );

              if (textBefore === '' || textBefore.endsWith(' ')) {
                // PHASE 5: Open menu when "/" is typed
                // Set storage first (before "/" is actually inserted)
                editor.storage.slashCommands.isOpen = true;
                editor.storage.slashCommands.query = '';
                editor.storage.slashCommands.startPos = from;
                editor.storage.slashCommands.selectedIndex = 0;
                editor.storage.slashCommands.userClosed = false; // Reset on manual "/" typing
                editor.storage.slashCommands.manuallyClosedAt = null;

                // Dispatch after "/" is inserted to trigger React re-render
                setTimeout(() => {
                  // Double-check menu is still open at this position
                  if (
                    editor.storage.slashCommands.isOpen &&
                    editor.storage.slashCommands.startPos === from
                  ) {
                    editor.view.dispatch(editor.view.state.tr);
                  }
                }, 0);

                // Return false to allow "/" insertion
                return false;
              }
            }

            // Track query after "/" (this runs AFTER the "/" is inserted)
            if (editor.storage.slashCommands.isOpen) {
              const textAfterSlash = $from.parent.textContent.slice(
                editor.storage.slashCommands.startPos - $from.start(),
                $from.parentOffset
              );

              const query = textAfterSlash.replace(/^\//, '');
              editor.storage.slashCommands.query = query;

              // Auto-dismiss if no commands match the query
              const matchingCommands = filterSlashCommands(query);
              if (matchingCommands.length === 0) {
                editor.storage.slashCommands.isOpen = false;
                editor.storage.slashCommands.startPos = null;
                editor.storage.slashCommands.query = '';
              }

              view.dispatch(view.state.tr);
            }

            return false;
          },

          handleKeyDown(view, event) {
            const storage = editor.storage.slashCommands;

            // PHASE 5: Handle Backspace to reopen menu intelligently
            if (event.key === 'Backspace' && !storage.isOpen) {
              const { from, to } = view.state.selection;

              // Only check if cursor is collapsed
              if (from === to) {
                // Wait for the backspace to complete, then check if we should reopen
                setTimeout(() => {
                  const { $from: $newFrom } = view.state.selection;
                  const newTextBefore = $newFrom.parent.textContent.slice(
                    0,
                    $newFrom.parentOffset
                  );

                  // Check for slash command pattern: "/" at start or after space
                  const match = newTextBefore.match(/(^|\s)(\/\w*)$/);

                  if (match) {
                    const slashPos = $newFrom.pos - match[2].length;
                    const query = match[2].replace(/^\//, '');

                    // Only reopen if there are matching commands
                    const matchingCommands = filterSlashCommands(query);
                    if (matchingCommands.length > 0) {
                      storage.isOpen = true;
                      storage.query = query;
                      storage.startPos = slashPos;
                      storage.selectedIndex = 0;
                      storage.userClosed = false; // Reset on backspace reopen
                      storage.manuallyClosedAt = null; // Clear manual close flag

                      view.dispatch(view.state.tr);
                    }
                  }
                }, 0);
              }

              return false;
            }

            if (!storage.isOpen) {
              return false;
            }

            // Only handle Backspace here - other keys are handled by addKeyboardShortcuts
            // Close menu on Backspace if deleting the "/"
            if (event.key === 'Backspace') {
              const { from, to } = view.state.selection;
              // If cursor is right after "/" and selection is collapsed
              if (from === storage.startPos + 1 && from === to) {
                // PHASE 5: Close menu state but don't interfere with cursor
                // Just update storage, let backspace happen naturally
                storage.isOpen = false;
                storage.startPos = null;
                storage.query = '';
                // Don't dispatch transaction here - let the natural backspace handle it
                // The view will update on next transaction
                return false; // Let backspace delete the "/" with normal cursor positioning
              }
            }

            return false;
          },
        },
      }),
    ];
  },
});