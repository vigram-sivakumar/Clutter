import React, { createContext, useContext } from 'react';
import type { EditorTheme } from '@clutter/shared';

const EditorThemeContext = createContext<EditorTheme | null>(null);

export function EditorThemeProvider({
  theme,
  children,
}: {
  theme: EditorTheme;
  children: React.ReactNode;
}) {
  return (
    <EditorThemeContext.Provider value={theme}>
      {children}
    </EditorThemeContext.Provider>
  );
}

export function useEditorTheme(): EditorTheme {
  const theme = useContext(EditorThemeContext);
  if (!theme) {
    throw new Error(
      'useEditorTheme must be used within <EditorThemeProvider>'
    );
  }
  return theme;
}
