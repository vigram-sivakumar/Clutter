/**
 * Task Priority Plugin
 * Commits priority when user types !, !!, or !!! and presses Space/Enter/blur
 * - Detects !, !!, or !!! anywhere in task text (start, middle, end)
 * - Priority preview is shown by ListBlock component (no inline decorations)
 * - Triggers on Space/Enter/blur: removes the marks and sets priority attribute
 * - Only activates in task blocks (listType === 'task')
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { updateBlockAttrs } from '../domain/updateBlockAttrs';

export const TASK_PRIORITY_PLUGIN_KEY = new PluginKey('taskPriority');

export const TaskPriority = Extension.create({
  name: 'taskPriority',

  priority: 1000,

  addProseMirrorPlugins() {
    // Helper function to detect and set priority (used by both space and enter)
    const handlePriorityDetection = (view: any, from: number) => {
      const { state } = view;
      const { $from } = state.selection;

      // Find the listBlock node
      let listBlockNode = null;
      let listBlockPos = null;

      for (let d = $from.depth; d >= 1; d--) {
        const node = $from.node(d);
        if (node.type.name === 'listBlock') {
          listBlockNode = node;
          listBlockPos = $from.start(d) - 1;
          break;
        }
      }

      // Only process in task blocks
      if (
        !listBlockNode ||
        !listBlockPos ||
        listBlockNode.attrs.listType !== 'task'
      ) {
        return false;
      }

      // Search backwards from cursor for !{1,3} using actual document positions
      // This correctly handles atomic nodes like mentions
      const exclamationPositions: number[] = [];

      // Check up to 3 characters back
      for (let i = 1; i <= 3; i++) {
        const pos = from - i;

        // Make sure position is valid and within the listBlock
        if (pos < listBlockPos + 1) break;

        try {
          // Get the actual character at this position
          const char = state.doc.textBetween(pos, pos + 1, null, '');

          if (char === '!') {
            exclamationPositions.unshift(pos); // Add to front to maintain order
          } else {
            // Stop when we hit a non-! character
            break;
          }
        } catch (e) {
          break;
        }
      }

      // No exclamation marks found
      if (exclamationPositions.length === 0) return false;

      const priorityLevel = exclamationPositions.length;
      const deleteFrom = exclamationPositions[0];
      const deleteTo = exclamationPositions.at(-1)! + 1;

      // Delete the exclamation marks and set priority attribute
      const tr = state.tr;

      // Delete the exclamation marks
      tr.delete(deleteFrom, deleteTo);

      // Set the priority attribute on the listBlock
      updateBlockAttrs(tr, listBlockPos, {
        priority: priorityLevel,
      });

      view.dispatch(tr);
      return true;
    };

    return [
      new Plugin({
        key: TASK_PRIORITY_PLUGIN_KEY,

        props: {
          handleKeyDown(view, event) {
            // Handle both Space and Enter keys for priority detection
            if (event.key === ' ' || event.key === 'Enter') {
              const { state } = view;
              const { from, $from } = state.selection;

              // For Enter: skip if block is empty (avoid converting empty block)
              if (event.key === 'Enter') {
                const parent = $from.parent;
                if (
                  parent &&
                  parent.type.name === 'listBlock' &&
                  !parent.textContent.trim()
                ) {
                  return false; // Empty block, let Enter create new line normally
                }
              }

              // Try to detect and set priority
              handlePriorityDetection(view, from);

              // Return false to allow the key to work normally
              return false;
            }

            return false;
          },

          handleDOMEvents: {
            blur(view) {
              const { state } = view;
              const { from, $from } = state.selection;

              // Only commit if cursor is at end of a task block
              const parent = $from.parent;
              if (!parent || parent.type.name !== 'listBlock') return false;
              if (parent.attrs.listType !== 'task') return false;

              // Cursor must be at end
              if (from !== $from.end()) return false;

              // Try priority detection
              handlePriorityDetection(view, from);
              return false;
            },
          },
        },
      }),
    ];
  },
});
