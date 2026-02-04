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
  EditorTheme,
  EditorThemeProvider,
  initOwnershipGate,
  assertStructureIsolation,
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

function EditorErrorFallback({ error }: { error: Error }) {
  return (
    <div style={{ padding: '20px', color: 'red' }}>
      <h3>Editor Error</h3>
      <pre>{error.message}</pre>
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
    const editorTheme: EditorTheme = {
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

    React.useEffect(() => {
      // Only reload when noteId actually changes
      if (loadedNoteIdRef.current === noteId) return;

      // 🚨 CRITICAL: Wait for value before clearing anything
      if (value === undefined) {
        // console.log('[Load] Waiting for value...');
        return;
      }

      const store = useBlockStore.getState();

      // console.log(
      //   '[Load] Loading note:',
      //   noteId,
      //   'value length:',
      //   value.length
      // );

      // ✅ Clear store AFTER confirming value is ready
      store.clear();
      loadedNoteIdRef.current = noteId;

      // Empty document (new note) - ensure at least one block exists
      if (value === '') {
        // console.log('[Load] Empty document - creating initial block');
        // 🚨 CRITICAL: Must create one block to satisfy Lexical invariant
        store.insertBlock(null, 'paragraph');
        return;
      }

      // Load persisted content
      try {
        const parsed = JSON.parse(value);

        if (isBlocksDocument(parsed)) {
          const blocks = deserializeBlocksFromJSON(value);
          if (blocks) {
            store.loadBlocks(blocks);
            // console.log('[Blocks] ✅ Loaded native format:', blocks.length);
          }
        } else if (isLegacyPMDocument(parsed)) {
          const migrationResult = migrateDocument(parsed, {
            preserveBlockIds: true,
            validateTree: true,
          });

          if (migrationResult.success) {
            store.loadBlocks(migrationResult.blocks);
            // console.log('[Migration] ✅ Migrated PM → blocks');
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
    }, [noteId, value]);

    // Persist block changes (with throttling to prevent infinite loops)
    React.useEffect(() => {
      // 🚨 CRITICAL GUARD: Never persist without a valid noteId
      if (!onChange || !noteId) {
        // console.log('[Persist] Skipping subscription - no noteId:', noteId);
        return;
      }

      // console.log('[Persist] Starting subscription for note:', noteId);

      // Throttle persist to max once per 100ms to prevent infinite loops
      let lastPersistTime = 0;
      let lastSerialized = '';
      const PERSIST_THROTTLE_MS = 100;
      let pendingTimeout: NodeJS.Timeout | null = null;

      const unsubscribe = useBlockStore.subscribe((state) => {
        const now = Date.now();
        const timeSinceLastPersist = now - lastPersistTime;

        const doPersist = () => {
          const blocks = state.getAllBlocks();
          const serialized = serializeBlocksToJSON(blocks);

          // 🚫 Skip if content hasn't changed (prevents redundant persists)
          if (serialized === lastSerialized) {
            return;
          }

          // console.log(
          //   '[Block Store] Persisting to note:',
          //   noteId,
          //   '- blocks:',
          //   blocks.length
          // );
          onChange(serialized);
          lastSerialized = serialized;
          lastPersistTime = Date.now();
        };

        // If enough time has passed, persist immediately
        if (timeSinceLastPersist >= PERSIST_THROTTLE_MS) {
          // Clear any pending timeout
          if (pendingTimeout) {
            clearTimeout(pendingTimeout);
            pendingTimeout = null;
          }
          doPersist();
        } else {
          // Schedule persist for later (trailing edge)
          if (pendingTimeout) {
            clearTimeout(pendingTimeout);
          }
          pendingTimeout = setTimeout(() => {
            doPersist();
            pendingTimeout = null;
          }, PERSIST_THROTTLE_MS - timeSinceLastPersist);
        }
      });

      return () => {
        unsubscribe();
        if (pendingTimeout) {
          clearTimeout(pendingTimeout);
        }
      };
    }, [onChange, noteId]); // ✅ Re-subscribe if noteId changes

    // Initialize ownership gate (blocks Lexical from STRUCTURE zones)
    React.useEffect(() => {
      const cleanup = initOwnershipGate();

      // Dev-only: Assert ownership isolation (throws on violations)
      assertStructureIsolation();

      return cleanup;
    }, []);

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
