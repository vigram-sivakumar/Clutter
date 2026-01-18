/**
 * EditorProvider - Injects dependencies into editor
 * 
 * This component is the boundary between:
 * - App (owns state, storage, domain logic)
 * - Editor (behavioral engine, no state ownership)
 * 
 * The app provides implementations through props.
 * The editor consumes through useEditorContext().
 * 
 * This is dependency inversion completed.
 */

import React from 'react';
import { EditorContext, EditorContextValue } from './EditorContext';

export interface EditorProviderProps {
  /** The context value to provide */
  value: EditorContextValue;
  
  /** Editor components */
  children: React.ReactNode;
}

/**
 * EditorProvider
 * 
 * Wraps the editor and provides all external dependencies.
 * 
 * Usage:
 * ```tsx
 * <EditorProvider value={editorContextValue}>
 *   <EditorCore />
 * </EditorProvider>
 * ```
 * 
 * The `value` prop is provided by the app and typically
 * adapts Zustand stores into editor-friendly projections.
 */
export function EditorProvider({ value, children }: EditorProviderProps) {
  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
}

