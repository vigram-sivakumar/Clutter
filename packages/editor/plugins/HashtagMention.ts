/**
 * HashtagMention Plugin - # trigger for inline tag mentions
 *
 * Shows dropdown with tag suggestions when typing #
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface HashtagMentionOptions {
  getColors: () => any;
}

export const HashtagMention = Extension.create<HashtagMentionOptions>({
  name: 'hashtagTrigger',
  priority: 9999, // High priority (slightly lower than AtMention)

  addOptions() {
    return {
      getColors: () => ({}),
    };
  },

  addStorage() {
    return {
      active: false,
      startPos: null, // Position of the # symbol
      query: '', // User's search query after #
      shouldSelect: false, // Flag to trigger selection on Enter
      navigateDown: false, // Flag for arrow down
      navigateUp: false, // Flag for arrow up
      userClosed: false, // Flag to prevent auto-reopening after user explicitly closed
    };
  },

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('hashtagTrigger');
    const editor = this.editor;

    return [
      new Plugin({
        key: pluginKey,

        view() {
          return {
            update(view) {
              const { selection } = view.state;
              const storage = editor.storage.hashtagTrigger;
              if (!storage) return;

              // Check if we should show dropdown
              if (!selection.empty) {
                storage.active = false;
                storage.startPos = null;
                return;
              }

              const pos = selection.from;
              const $pos = view.state.doc.resolve(pos);
              const textBefore = $pos.parent.textContent.slice(
                0,
                $pos.parentOffset
              );

              // Match # at the end of text (with optional query after it)
              // Allow word characters and spaces in the query
              const match = textBefore.match(/#([\w\s]*)$/);

              if (match) {
                const query = match[1]; // Capture query
                const hashPos = pos - query.length - 1; // Position of #

                // Only activate if user hasn't explicitly closed the menu
                if (!storage.userClosed) {
                  storage.active = true;
                  storage.startPos = hashPos;
                  storage.query = query;
                }
              } else {
                // Reset userClosed when # is no longer in text (user deleted it or moved away)
                storage.active = false;
                storage.startPos = null;
                storage.query = '';
                storage.userClosed = false;
              }
            },
          };
        },

        props: {
          handleKeyDown(view, event) {
            const storage = editor.storage.hashtagTrigger;
            if (!storage || !storage.active) {
              return false;
            }

            // Handle Enter - select current item
            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();

              // Trigger selection via storage flag
              storage.shouldSelect = true;
              // 🔒 CRITICAL: Preserve selection when dispatching signal transaction
              // This empty dispatch notifies React components, but must not clobber cursor
              const tr = view.state.tr;
              tr.setSelection(view.state.selection);
              view.dispatch(tr);

              return true;
            }

            // ESC is handled by FloatingMenu via dismissOnEscape prop
            // No need for duplicate handler here - UI layer owns dismissal interactions

            // Arrow key navigation
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              event.stopPropagation();
              storage.navigateDown = true;
              // 🔒 Preserve selection when dispatching signal transaction
              const tr = view.state.tr;
              tr.setSelection(view.state.selection);
              view.dispatch(tr);
              return true;
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              event.stopPropagation();
              storage.navigateUp = true;
              // 🔒 Preserve selection when dispatching signal transaction
              const tr = view.state.tr;
              tr.setSelection(view.state.selection);
              view.dispatch(tr);
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
