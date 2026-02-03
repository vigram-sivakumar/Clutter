/**
 * Lexical Document Editor
 *
 * Renders a full document using the custom block engine + Lexical.
 *
 * Architecture:
 * - Reads blocks from useBlockStore
 * - Renders one LexicalBlockEditor per block
 * - Manages focus across editors
 * - Handles keyboard navigation (arrows, enter, backspace)
 *
 * This is the PRIMARY editor when USE_LEXICAL_EDITOR flag is on.
 * ProseMirror becomes hidden fallback only.
 */

import React from 'react';
import { useBlockStore } from '../store/blockStore';
import { LexicalBlockEditor } from '../lexical/LexicalBlockEditor';
import { useFocusManager } from '../focus/useFocusManager';
import { BlockChromeWrapper } from '../chrome/BlockChromeWrapper';

interface LexicalDocumentEditorProps {
  /** Optional: Auto-focus first block on mount */
  autoFocus?: boolean;

  /** Optional: Class name for styling */
  className?: string;

  /** Optional: Placeholder for empty document */
  placeholder?: string;
}

/**
 * Main document editor component
 */
export const LexicalDocumentEditor: React.FC<LexicalDocumentEditorProps> = ({
  autoFocus = false,
  className = '',
  placeholder = 'Start writing...',
}) => {
  const rootBlocks = useBlockStore((state) => state.getRootBlocks());
  const insertBlock = useBlockStore((state) => state.insertBlock); // ✅ Subscribed action
  const focusManager = useFocusManager();
  const initializedRef = React.useRef(false);

  // ✅ Create initial block ONCE on mount if empty
  React.useEffect(() => {
    if (initializedRef.current) return; // Already ran
    if (rootBlocks.length > 0) return; // Already has blocks

    initializedRef.current = true;

    // ✅ Use subscribed action (triggers re-render)
    const newBlockId = insertBlock(null, 'paragraph');
    console.log('[LexicalDocumentEditor] Created initial block:', newBlockId);

    // Auto-focus the new block
    if (autoFocus) {
      setTimeout(() => focusManager.focusBlock(newBlockId), 50);
    }
  }, [rootBlocks.length, insertBlock, autoFocus, focusManager]); // ✅ Safe: only runs when empty

  // 🚨 INVARIANT: Block store must NEVER be empty while editor is mounted
  if (rootBlocks.length === 0 && initializedRef.current) {
    console.error(
      '[LexicalDocumentEditor] ❌ INVARIANT VIOLATION: Block store is empty after initialization!'
    );
    console.error(
      '[LexicalDocumentEditor] This breaks typing. A block must exist at all times.'
    );
    // Render placeholder instead of crashing
    return (
      <div
        className={`lexical-document-editor ${className}`}
        style={{ padding: '20px', color: '#999' }}
      >
        Editor initialization error: No blocks available. Please reload.
      </div>
    );
  }

  return (
    <div
      className={`lexical-document-editor ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px', // Match old ProseMirror gap between blocks
      }}
    >
      {rootBlocks.map((block, index) => (
        <BlockChromeWrapper key={block.id} blockId={block.id}>
          <LexicalBlockEditor
            blockId={block.id}
            focusManager={focusManager}
            autoFocus={autoFocus && index === 0}
          />
        </BlockChromeWrapper>
      ))}
    </div>
  );
};
