/**
 * AtMention Plugin - @ trigger for dates and note/folder linking
 *
 * Shows dropdown with date options and link suggestions when typing @
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface AtMentionOptions {
  getColors: () => any;
}

export const AtMention = Extension.create<AtMentionOptions>({
  name: 'atMention',
  priority: 10000, // Very high priority to capture keys before other plugins

  addOptions() {
    return {
      getColors: () => ({}),
    };
  },

  addStorage() {
    return {
      active: false,
      startPos: null, // Position of the @ symbol
      query: '', // User's search query after @
      shouldSelect: false, // Flag to trigger selection on Enter
      navigateDown: false, // Flag for arrow down
      navigateUp: false, // Flag for arrow up
      userClosed: false, // Flag to prevent auto-reopening after user explicitly closed
    };
  },

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('atMention');
    const editor = this.editor;

    return [
      new Plugin({
        key: pluginKey,

        view() {
          return {
            update(view) {
              const { selection } = view.state;
              const storage = editor.storage.atMention;
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

              // Match @ at the end of text (with optional query after it, including spaces)
              const match = textBefore.match(/@([\w\s]*)$/);

              if (match) {
                const query = match[1]; // Capture query (can include spaces)
                const atPos = pos - query.length - 1; // Position of @

                // Only activate if user hasn't explicitly closed the menu
                if (!storage.userClosed) {
                  storage.active = true;
                  storage.startPos = atPos;
                  storage.query = query;
                }
              } else {
                // Reset userClosed when @ is no longer in text (user deleted it or moved away)
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
            const storage = editor.storage.atMention;
            if (!storage || !storage.active) {
              return false;
            }

            // Handle Enter - select current item
            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();

              // Trigger selection via storage flag
              storage.shouldSelect = true;
              view.dispatch(view.state.tr);

              return true;
            }

            // ESC is handled by FloatingMenu via dismissOnEscape prop
            // No need for duplicate handler here - UI layer owns dismissal interactions

            // Arrow key navigation
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              event.stopPropagation();
              storage.navigateDown = true;
              view.dispatch(view.state.tr);
              return true;
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              event.stopPropagation();
              storage.navigateUp = true;
              view.dispatch(view.state.tr);
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
