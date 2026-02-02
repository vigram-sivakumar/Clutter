/**
 * UI Components
 * Organized by role in the application
 * See STRUCTURE.md for organization guidelines
 */

// App Layout
export * from './app-layout';

// UI Components
export * from './ui-buttons';
export * from './ui-checkbox';
export * from './ui-inputs';
export * from './ui-modals';
export * from './ui-primitives';

// Legacy exports for backwards compatibility (will be removed)
export { NoteEditor as NotesContainer } from './app-layout/pages/note';

// Explicit re-exports for main app components
export { NoteEditor } from './app-layout/pages/note';
export { ThemeProvider } from './ui-primitives';
