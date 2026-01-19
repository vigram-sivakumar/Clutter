/**
 * Markdown Shortcuts Plugin
 *
 * Uses ProseMirror's handleTextInput to detect markdown patterns.
 * Replaces the ENTIRE block (including wrappers like listBlock).
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { replaceBlock } from '../utils/blockReplacement';
import { createBlockNode } from '../domain/createBlock';

const SHORTCUTS_KEY = new PluginKey('markdownShortcuts');

export const MarkdownShortcuts = Extension.create({
  name: 'markdownShortcuts',
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: SHORTCUTS_KEY,
        props: {
          handleTextInput(view, from, to, text) {
            const { state } = view;
            const $from = state.doc.resolve(from);
            const parent = $from.parent;

            // Work in paragraphs, headings, and inline-content blocks (listBlock, blockquote, callout)
            // NOTE: toggleHeader is excluded - it's a special block type for toggle headers
            const allowedTypes = [
              'paragraph',
              'heading',
              'listBlock',
              'blockquote',
              'callout',
            ];
            if (!allowedTypes.includes(parent.type.name)) {
              return false;
            }

            // Get text before cursor + the new character
            const textBefore = parent.textBetween(0, $from.parentOffset) + text;

            // Check if block ONLY contains the pattern (cursor at end)
            if (parent.textContent.length !== $from.parentOffset) {
              return false;
            }

            // Extract preserved attributes from current block
            // 🔥 FLAT MODEL: Only preserve indent
            // 🔒 BLOCK IDENTITY LAW: NEVER preserve blockId across type changes
            const preservedAttrs = {
              indent: parent.attrs.indent || 0,
            };

            // Determine what to create
            let replacement: any = null;

            // # + space → H1
            if (textBefore === '# ') {
              replacement = createBlockNode(state.schema, {
                type: 'heading',
                headingLevel: 1,
                indent: preservedAttrs.indent,
              });
            }
            // ## + space → H2
            else if (textBefore === '## ') {
              replacement = createBlockNode(state.schema, {
                type: 'heading',
                headingLevel: 2,
                indent: preservedAttrs.indent,
              });
            }
            // ### + space → H3
            else if (textBefore === '### ') {
              replacement = createBlockNode(state.schema, {
                type: 'heading',
                headingLevel: 3,
                indent: preservedAttrs.indent,
              });
            }
            // >> + space → toggle list (flat schema)
            else if (textBefore === '>> ') {
              replacement = createBlockNode(state.schema, {
                type: 'listBlock',
                listType: 'toggle',
                checked: null,
                indent: preservedAttrs.indent,
              });
            }
            // > + space → blockquote
            else if (textBefore === '> ') {
              replacement = createBlockNode(state.schema, {
                type: 'blockquote',
                indent: preservedAttrs.indent,
              });
            }
            // * or - + space → bullet
            else if (textBefore === '* ' || textBefore === '- ') {
              replacement = createBlockNode(state.schema, {
                type: 'listBlock',
                listType: 'bullet',
                checked: null,
                indent: preservedAttrs.indent,
              });
            }
            // 1. + space → numbered
            else if (textBefore === '1. ') {
              replacement = createBlockNode(state.schema, {
                type: 'listBlock',
                listType: 'numbered',
                checked: null,
                indent: preservedAttrs.indent,
              });
            }
            // [] + space → task unchecked
            else if (textBefore === '[] ') {
              replacement = createBlockNode(state.schema, {
                type: 'listBlock',
                listType: 'task',
                checked: false,
                indent: preservedAttrs.indent,
              });
            }
            // [ ] + space → task unchecked
            else if (textBefore === '[ ] ') {
              replacement = createBlockNode(state.schema, {
                type: 'listBlock',
                listType: 'task',
                checked: false,
                indent: preservedAttrs.indent,
              });
            }
            // [x] or [X] + space → task checked
            else if (textBefore === '[x] ' || textBefore === '[X] ') {
              replacement = createBlockNode(state.schema, {
                type: 'listBlock',
                listType: 'task',
                checked: true,
                indent: preservedAttrs.indent,
              });
            }
            // --- → HR (plain) - triggers on third dash
            else if (textBefore === '---') {
              replacement = [
                createBlockNode(state.schema, {
                  type: 'horizontalRule',
                  style: 'plain',
                  indent: preservedAttrs.indent,
                }),
                createBlockNode(state.schema, {
                  type: 'paragraph',
                  indent: preservedAttrs.indent,
                }),
              ];
            }
            // *** → HR (wavy)
            else if (textBefore === '***') {
              replacement = [
                createBlockNode(state.schema, {
                  type: 'horizontalRule',
                  style: 'wavy',
                  indent: preservedAttrs.indent,
                }),
                createBlockNode(state.schema, {
                  type: 'paragraph',
                  indent: preservedAttrs.indent,
                }),
              ];
            }

            if (!replacement) {
              return false;
            }

            // Find the outermost block to replace
            // Walk up from current node to find any wrapper (listBlock, blockquote, callout)
            let blockStart = $from.before($from.depth); // Current block start
            let blockEnd = $from.after($from.depth); // Current block end

            // Check if we're inside a wrapper block
            // NOTE: toggleHeader is excluded - markdown shortcuts should work on children inside toggles
            for (let depth = $from.depth - 1; depth >= 1; depth--) {
              const node = $from.node(depth);
              const wrapperTypes = ['listBlock', 'blockquote', 'callout'];
              if (wrapperTypes.includes(node.type.name)) {
                // Check if this wrapper only contains our empty block
                if (node.content.size === parent.nodeSize) {
                  blockStart = $from.before(depth);
                  blockEnd = $from.after(depth);
                }
                break;
              }
            }

            // Replace the block using shared utility
            replaceBlock(view, blockStart, blockEnd, replacement);
            return true;
          },
        },
      }),
    ];
  },
});
