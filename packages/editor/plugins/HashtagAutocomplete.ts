/**
 * HashtagAutocomplete Plugin - Simple autocomplete for #tags
 * 
 * Shows dropdown with existing tags when typing #
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { HASHTAG_REGEX, insertTag } from '../utils/tagUtils';
import type { EditorTag } from '../types';

export interface HashtagAutocompleteOptions {
  getColors: () => any;
  getTags: () => EditorTag[];
}

export const HashtagAutocomplete = Extension.create<HashtagAutocompleteOptions>({
  name: 'hashtagAutocomplete',
  priority: 1000, // High priority to handle keyboard events before other extensions

  addOptions() {
    return {
      getColors: () => ({}),
      getTags: () => [],
    };
  },

  addStorage() {
    return {
      active: false,
    };
  },

  onUpdate() {
    // Sync plugin state to storage for UI intent system
    const pluginKey = new PluginKey('hashtagAutocomplete');
    const state = pluginKey.getState(this.editor.state);
    if (state) {
      this.storage.active = state.active;
    }
  },

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('hashtagAutocomplete');
    let dropdown: HTMLElement | null = null;
    let currentSuggestions: string[] = [];
    
    // Store functions from options
    const getColors = this.options.getColors;
    const getTags = this.options.getTags;

    // Function to handle tag selection (shared by click and keyboard)
    const selectTag = (view: any, selectedTag: string, queryLength: number) => {
      const { state: editorState } = view;
      const pos = editorState.selection.from;
      const hashPos = pos - queryLength - 1;
      
      // Get the current block node
      const $pos = editorState.doc.resolve(pos);
      const currentBlock = $pos.parent;
      const blockPos = $pos.before($pos.depth);
      
      // Use shared insertTag utility
      const tr = editorState.tr;
      insertTag(tr, hashPos, pos, blockPos, currentBlock.attrs, selectedTag);
      
      view.dispatch(tr);
      
      // Close dropdown
      if (dropdown) {
        dropdown.remove();
        dropdown = null;
      }
    };

    const createDropdown = (suggestions: string[], selectedIndex: number, colors: any, onSelectTag: (tag: string) => void) => {
      const div = document.createElement('div');
      div.className = 'hashtag-autocomplete-dropdown';
      div.style.cssText = `
        position: absolute;
        background-color: ${colors.background.default};
        border: 1px solid ${colors.border.default};
        border-radius: 6px;
        box-shadow: 0 2px 8px ${colors.shadow.md};
        z-index: 1000;
        min-width: 200px;
        max-height: 200px;
        overflow-y: auto;
        padding: 4px;
      `;
      
      // Prevent all mouse events from propagating to editor
      div.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
      div.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };

      suggestions.forEach((tag, index) => {
        const item = document.createElement('div');
        item.textContent = `#${tag}`;
        item.style.cssText = `
          padding: 6px 8px;
          cursor: pointer;
          border-radius: 3px;
          font-size: 14px;
          background-color: ${index === selectedIndex ? colors.background.hover : 'transparent'};
          transition: background-color 150ms;
        `;
        
        item.onmouseenter = () => {
          item.style.backgroundColor = colors.background.hover;
        };
        item.onmouseleave = () => {
          item.style.backgroundColor = index === selectedIndex ? colors.background.hover : 'transparent';
        };
        
        // Use mousedown for immediate response (before focus is lost)
        item.onmousedown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelectTag(tag);
        };
        
        div.appendChild(item);
      });

      return div;
    };

    return [
      new Plugin({
        key: pluginKey,
        
        state: {
          init() {
            return {
              active: false,
              query: '',
              suggestions: [],
              selectedIndex: 0,
              range: null,
            };
          },

          apply(tr, oldState, _oldEditorState, newEditorState) {
            // Check for meta updates (selectedIndex changes)
            const meta = tr.getMeta(pluginKey);
            if (meta?.selectedIndex !== undefined) {
              return { ...oldState, selectedIndex: meta.selectedIndex };
            }

            // Check if we should show autocomplete
            const { selection } = newEditorState;
            if (!selection.empty) {
              if (dropdown) {
                dropdown.remove();
                dropdown = null;
              }
              return { ...oldState, active: false };
            }

            const pos = selection.from;
            const $pos = newEditorState.doc.resolve(pos);
            const textBefore = $pos.parent.textContent.slice(0, $pos.parentOffset);
            
            // Match #word pattern (allow spaces for multi-word tags, allow empty query for autocomplete)
            const match = textBefore.match(/#(\S*(?:\s+\S+)*)$/);
            
            if (match) {
              const query = match[1];
              
              // Get tags from editor context
              const availableTags = getTags();
              const allTags = availableTags.map(t => t.label);
              
              // Filter tags by query
              const suggestions = allTags
                .filter(tag => tag.toLowerCase().startsWith(query.toLowerCase()))
                .slice(0, 10);

              return {
                active: suggestions.length > 0,
                query,
                suggestions,
                selectedIndex: 0,
                range: {
                  from: pos - query.length,
                  to: pos,
                },
              };
            }

            if (dropdown) {
              dropdown.remove();
              dropdown = null;
            }
            return { ...oldState, active: false };
          },
        },

        view(editorView) {
          // Store the view reference in closure so click handlers always have access
          let currentView = editorView;
          let currentState = pluginKey.getState(editorView.state);

          return {
            update(view, prevState) {
              currentView = view; // Update view reference
              const state = pluginKey.getState(view.state);
              currentState = state; // Update state reference
              
              if (!state.active || state.suggestions.length === 0) {
                if (dropdown) {
                  dropdown.remove();
                  dropdown = null;
                  currentSuggestions = [];
                }
                return;
              }

              // Get cursor position
              const { from } = view.state.selection;
              const coords = view.coordsAtPos(from);
              const colors = getColors();

              // Handler for tag selection - uses closure variables
              const onSelectTag = (tag: string) => {
                selectTag(currentView, tag, currentState.query?.length || 0);
              };

              // Check if suggestions changed (not just selectedIndex)
              const suggestionsChanged = 
                !dropdown ||
                currentSuggestions.length !== state.suggestions.length ||
                currentSuggestions.some((tag, i) => tag !== state.suggestions[i]);

              // Create or update dropdown
              if (suggestionsChanged) {
                // Remove old dropdown
                if (dropdown) {
                  dropdown.remove();
                }
                // Create new dropdown with fresh event listeners
                dropdown = createDropdown(state.suggestions, state.selectedIndex, colors, onSelectTag);
                document.body.appendChild(dropdown);
                currentSuggestions = [...state.suggestions];
              } else {
                // Just update selection highlighting without recreating
                const items = dropdown?.querySelectorAll('div');
                items?.forEach((item, index) => {
                  item.style.backgroundColor = index === state.selectedIndex ? colors.background.hover : 'transparent';
                });
              }

              // Position dropdown
              if (dropdown) {
                dropdown.style.left = `${coords.left}px`;
                dropdown.style.top = `${coords.bottom + 4}px`;
              }
            },

            destroy() {
              if (dropdown) {
                dropdown.remove();
                dropdown = null;
                currentSuggestions = [];
              }
            },
          };
        },

        props: {
          handleKeyDown(view, event) {
            const state = pluginKey.getState(view.state);
            
            if (!state.active || state.suggestions.length === 0) {
              return false;
            }

            if (event.key === 'ArrowDown') {
              event.preventDefault();
              const newIndex = (state.selectedIndex + 1) % state.suggestions.length;
              const tr = view.state.tr.setMeta(pluginKey, { selectedIndex: newIndex });
              view.dispatch(tr);
              return true;
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              const newIndex = (state.selectedIndex - 1 + state.suggestions.length) % state.suggestions.length;
              const tr = view.state.tr.setMeta(pluginKey, { selectedIndex: newIndex });
              view.dispatch(tr);
              return true;
            }

            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault();
              event.stopPropagation(); // Prevent other handlers from running
              const selectedTag = state.suggestions[state.selectedIndex];
              
              if (selectedTag && state.range) {
                selectTag(view, selectedTag, state.query.length);
              }
              
              return true;
            }

            if (event.key === 'Escape') {
              if (dropdown) {
                dropdown.remove();
                dropdown = null;
              }
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});

