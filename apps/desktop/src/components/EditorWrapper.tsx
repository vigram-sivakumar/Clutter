/**
 * Editor Wrapper Component
 *
 * Clean wrapper for the Lexical-based block editor.
 * Handles document loading, persistence, and legacy PM migration.
 */

import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';

// Editor imports
import {
  LexicalDocumentEditor,
  useBlockStore,
  migrateDocument,
  serializeBlocksToJSON,
  deserializeBlocksFromJSON,
  isBlocksDocument,
  isLegacyPMDocument,
  EditorThemeProvider,
} from '@clutter/editor';

// UI imports
import { useTheme } from '@clutter/ui';

interface EditorWrapperProps {
  noteId?: string;
  value?: string;
  onChange?: (_value: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}

export interface EditorWrapperHandle {
  focus: () => void;
}

function EditorErrorFallback({ error }: { error: Error | unknown }) {
  return (
    <div style={{ padding: '20px', color: 'red' }}>
      <h3>Editor Error</h3>
      <pre>{error instanceof Error ? error.message : String(error)}</pre>
    </div>
  );
}

export const EditorWrapper = React.forwardRef<
  EditorWrapperHandle,
  EditorWrapperProps
>(
  (
    {
      noteId,
      value,
      onChange,
      autoFocus = false,
      placeholder = 'Start writing...',
    },
    ref
  ) => {
    // Get theme
    const { colors, mode } = useTheme();
    const editorTheme = {
      colors,
      mode,
    };

    // Expose methods
    React.useImperativeHandle(ref, () => ({
      focus: () => {
        // TODO: Implement focus
      },
    }));

    // 🔒 LOAD PHASE: Hydrate block store on noteId change
    const loadedNoteIdRef = React.useRef<string | undefined>(undefined);
    const isLoadedRef = React.useRef(false);

    React.useEffect(() => {
      // Only reload when noteId actually changes
      if (loadedNoteIdRef.current === noteId) return;

      // 🚨 CRITICAL: Wait for value before clearing anything
      if (value === undefined) {
        console.log('[Load] Waiting for value...');
        isLoadedRef.current = false;
        return;
      }

      const store = useBlockStore.getState();

      console.log(
        '[Load] Loading note:',
        noteId,
        'value length:',
        value.length
      );

      // ✅ Clear store AFTER confirming value is ready
      store.clear();
      loadedNoteIdRef.current = noteId;

      // Empty document (new note) - LexicalDocumentEditor will create initial block
      if (value === '') {
        console.log(
          '[Load] Empty document - LexicalDocumentEditor will create initial block'
        );
        isLoadedRef.current = true;
        return;
      }

      // Load persisted content
      try {
        const parsed = JSON.parse(value);

        if (isBlocksDocument(parsed)) {
          const blocks = deserializeBlocksFromJSON(value);
          if (blocks) {
            store.loadBlocks(blocks);
            console.log('[Blocks] ✅ Loaded native format:', blocks.length);
          }
        } else if (isLegacyPMDocument(parsed)) {
          const migrationResult = migrateDocument(parsed, {
            preserveBlockIds: true,
            validateTree: true,
          });

          if (migrationResult.success) {
            store.loadBlocks(migrationResult.blocks);
            console.log('[Migration] ✅ Migrated PM → blocks');
          } else {
            console.error(
              '[Migration] ❌ Migration failed:',
              migrationResult.errors
            );
          }
        } else {
          console.error('[Load] ❌ Unknown format:', parsed);
        }
      } catch (error) {
        console.error('[Load] ❌ Failed to parse document:', error);
      }

      isLoadedRef.current = true;
    }, [noteId, value]);

    // Persist block changes
    React.useEffect(() => {
      // 🚨 CRITICAL GUARD: Never persist without a valid noteId
      if (!onChange || !noteId) {
        console.log('[Persist] Skipping subscription - no noteId:', noteId);
        return;
      }

      // 🚨 CRITICAL: Don't persist until initial load completes
      if (!isLoadedRef.current) {
        console.log('[Persist] Waiting for initial load to complete...');
        return;
      }

      console.log('[Persist] Starting subscription for note:', noteId);

      const unsubscribe = useBlockStore.subscribe((state) => {
        const blocks = state.getAllBlocks();
        const serialized = serializeBlocksToJSON(blocks);
        console.log(
          '[Block Store] Persisting to note:',
          noteId,
          '- blocks:',
          blocks.length
        );
        onChange(serialized);
      });

      return unsubscribe;
    }, [onChange, noteId, value]); // ✅ Re-run when value changes (load completes)

    return (
      <EditorThemeProvider theme={editorTheme}>
        <ErrorBoundary
          FallbackComponent={EditorErrorFallback}
          resetKeys={[noteId]}
        >
          <LexicalDocumentEditor
            autoFocus={autoFocus}
            placeholder={placeholder}
          />
        </ErrorBoundary>
      </EditorThemeProvider>
    );
  }
);

EditorWrapper.displayName = 'EditorWrapper';
