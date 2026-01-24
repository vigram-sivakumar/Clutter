/**
 * HashtagAutocomplete Plugin - Detects # trigger and exposes state
 * 
 * UI is handled by the HashtagMenu React component
 * This plugin only tracks when autocomplete should be active
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorTag } from '../types';

export interface HashtagAutocompleteOptions {
  getTags: () => EditorTag[];
}

export interface HashtagAutocompleteState {
  active: boolean;
  query: string;
  range: { from: number; to: number } | null;
  selectedIndex: number;
}

export const HashtagAutocomplete = Extension.create<HashtagAutocompleteOptions>({
  name: 'hashtagAutocomplete',
  priority: 1000,

  addOptions() {
    return {
      getTags: () => [],
    };
  },

  addStorage() {
    return {
      active: false,
      query: '',
      range: null,
      selectedIndex: 0,
    };
  },

  onUpdate() {
    // Sync plugin state to storage for UI components
    const pluginKey = new PluginKey('hashtagAutocomplete');
    const state = pluginKey.getState(this.editor.state);
    if (state) {
      Object.assign(this.storage, state);
    }
  },

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('hashtagAutocomplete');
    
    return [
      new Plugin({
        key: pluginKey,
        
        state: {
          init(): HashtagAutocompleteState {
            return {
              active: false,
              query: '',
              range: null,
              selectedIndex: 0,
            };
          },

          apply(tr, oldState, _oldEditorState, newEditorState): HashtagAutocompleteState {
            // Check for meta updates (from React component)
            const meta = tr.getMeta(pluginKey);
            if (meta) {
              return { ...oldState, ...meta };
            }

            // Check if selection is empty
            const { selection } = newEditorState;
            if (!selection.empty) {
              return { ...oldState, active: false };
            }

            const pos = selection.from;
            const $pos = newEditorState.doc.resolve(pos);
            const textBefore = $pos.parent.textContent.slice(0, $pos.parentOffset);
            
            // Match #word pattern
            const match = textBefore.match(/#(\S*)$/);
            
            if (match) {
              const query = match[1];
              
              return {
                active: true,
                query,
                range: {
                  from: pos - query.length,
                  to: pos,
                },
                selectedIndex: 0,
              };
            }

            return { ...oldState, active: false };
          },
        },
      }),
    ];
  },
});
