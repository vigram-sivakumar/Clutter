/**
 * DescriptionEditContext - Shared state for description editing
 *
 * Allows ParagraphBlock to render inline editor when triggered from EditorChromeLayer.
 * State lives in EditorChromeLayer, blocks consume it for rendering.
 */

import { createContext, useContext } from 'react';

export interface EditingDescription {
  blockId: string;
  pos: number;
  value: string;
}

export interface DescriptionEditContextValue {
  editingDescription: EditingDescription | null;
  setEditingDescription: (value: EditingDescription | null) => void;
  saveDescription: () => void;
  cancelDescription: () => void;
}

export const DescriptionEditContext =
  createContext<DescriptionEditContextValue | null>(null);

export function useDescriptionEdit(): DescriptionEditContextValue {
  const context = useContext(DescriptionEditContext);

  if (!context) {
    throw new Error(
      'useDescriptionEdit must be used within DescriptionEditContext.Provider'
    );
  }

  return context;
}
