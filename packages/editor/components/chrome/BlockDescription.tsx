/**
 * BlockDescription - Reusable block metadata renderer
 *
 * Pure UI component for rendering/editing block descriptions.
 * Lives in chrome layer (outside contenteditable) but participates in flow layout.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 CRITICAL INVARIANT - DO NOT VIOLATE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This component MUST render outside the ProseMirror DOM tree.
 *
 * ❌ Do NOT move it into NodeViews or contenteditable regions
 * ❌ Do NOT render it inside <NodeViewWrapper> or <NodeViewContent>
 *
 * ✅ Render in ChromeOverlay layers (BlockDescriptionsLayer)
 * ✅ Render in flow layout as sibling to NodeViews (display mode only)
 *
 * Why this matters:
 * - Interactive mode (textarea) assumes PM is disabled (editor.setEditable(false))
 * - Any interactive element inside PM's DOM causes INVALID TRANSACTION errors
 * - This architecture is the only scalable pattern for chrome features
 *
 * See: packages/editor/core/EditorCore.tsx (Modal Editor State)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Architecture:
 * - Not part of ProseMirror document
 * - Not part of NodeViewContent
 * - Isolated focus (no caret interaction)
 * - Pixel-perfect edit ↔ read transition
 *
 * Keyboard UX:
 * - Enter = commit and exit
 * - Shift+Enter = line break (multiline support)
 * - Escape = cancel and exit
 * - Blur = auto-commit
 *
 * Usage:
 * ```tsx
 * // In any block (auto-switches between display and spacer)
 * <NodeViewWrapper>
 *   <NodeViewContent />
 *   {description && (
 *     <BlockDescription
 *       value={description}
 *       mode={isEditingThisBlock ? 'spacer' : 'display'}
 *       onChange={() => {}}  // No-op in display/spacer
 *       onCommit={() => {}}  // No-op in display/spacer
 *       onCancel={() => {}}  // No-op in display/spacer
 *     />
 *   )}
 * </NodeViewWrapper>
 *
 * // Edit mode overlay (in ChromeOverlay - interactive, PM disabled)
 * <ChromeOverlay>
 *   <BlockDescription
 *     value={editingDescription.value}
 *     mode="edit"
 *     onChange={(v) => setEditingDescription({ ...editingDescription, value: v })}
 *     onCommit={saveDescription}
 *     onCancel={cancelDescription}
 *   />
 * </ChromeOverlay>
 * ```
 */

import { useEditorTheme } from '../../theme/EditorThemeContext';
import { useEffect, useRef } from 'react';

/**
 * Description rendering mode (strict union)
 * - 'display': Visible, read-only text in flow layout
 * - 'spacer': Invisible placeholder to reserve space during overlay editing
 * - 'edit': Interactive textarea (should only be used in ChromeOverlay)
 */
export type DescriptionMode = 'display' | 'spacer' | 'edit';

export interface BlockDescriptionProps {
  /** Current description value (null = no description) */
  value: string | null;
  /** Rendering mode - determines behavior and visibility */
  mode: DescriptionMode;
  /** Called when user types (controlled input) - only used in 'edit' mode */
  onChange: (value: string) => void;
  /** Called when user commits (Enter, Blur) - only used in 'edit' mode */
  onCommit: () => void;
  /** Called when user cancels (Escape) - only used in 'edit' mode */
  onCancel: () => void;
}

/**
 * BlockDescription - Block metadata renderer
 *
 * Renders as chrome (outside contenteditable) in flow layout.
 * Switches between read-only display and inline input editor.
 */
export function BlockDescription({
  value,
  mode,
  onChange,
  onCommit,
  onCancel,
}: BlockDescriptionProps) {
  const { colors } = useEditorTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Centralized event stopping helper (defense-in-depth)
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  // Auto-resize textarea to fit content (edit mode only)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || mode !== 'edit') return;

    // Reset height to auto to get correct scrollHeight
    textarea.style.height = 'auto';
    // Set height to scrollHeight to fit content
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value, mode]);

  // Don't render anything if no description and not in edit/spacer mode
  if (!value && mode !== 'edit') {
    return null;
  }

  // Shared style object for pixel-perfect edit ↔ read transition
  // CRITICAL: Both modes MUST share identical typography & box model
  const descriptionTextStyle = {
    fontSize: 12,
    lineHeight: 1.4,
    color: colors.text.tertiary,
    padding: '2px 0',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'content-box' as const,
  };

  return (
    <div onMouseDown={stop} onFocus={stop}>
      {mode === 'edit' ? (
        // Edit mode: multiline textarea (fully neutralized + event isolated)
        <textarea
          ref={textareaRef}
          autoFocus
          value={value ?? ''}
          onChange={(e) => {
            stop(e);
            onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            stop(e); // Critical: Block keyboard events from reaching PM

            // Plain Enter = commit, Shift+Enter = line break
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              // 🔒 ASYNC EXIT: Defer to next tick (timing contract)
              // This ensures PM doesn't see the Enter event as a mutation attempt
              // Even though PM is disabled, this prevents race conditions
              requestAnimationFrame(() => {
                onCommit();
              });
            }

            if (e.key === 'Escape') {
              e.preventDefault();
              // 🔒 ASYNC EXIT: Defer to next tick
              requestAnimationFrame(() => {
                onCancel();
              });
            }
          }}
          onBlur={(e) => {
            stop(e);
            // 🔒 ASYNC EXIT: Defer to next tick
            requestAnimationFrame(() => {
              onCommit();
            });
          }}
          onFocus={stop}
          onMouseDown={stop}
          onClick={stop}
          onInput={stop}
          placeholder="Add a description... (Shift+Enter for line break)"
          style={{
            ...descriptionTextStyle,
            // Aggressive border/outline reset (critical for height match)
            border: 0,
            borderWidth: 0,
            borderStyle: 'none',
            outline: 0,
            outlineWidth: 0,
            outlineStyle: 'none',
            background: 'transparent',
            backgroundColor: 'transparent',
            margin: 0,
            // Force text-like behavior (not form-like)
            display: 'block',
            height: 'auto',
            minHeight: 0,
            maxHeight: 'none',
            verticalAlign: 'baseline',
            // Critical: remove textarea chrome
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'textfield',
            resize: 'none', // Prevent manual resize
            overflow: 'hidden', // Hide scrollbar, auto-expand instead
            whiteSpace: 'pre-wrap', // Preserve line breaks
          }}
        />
      ) : mode === 'spacer' ? (
        // Spacer mode: invisible placeholder (reserves space during edit overlay)
        <div
          contentEditable={false}
          suppressContentEditableWarning
          aria-hidden
          style={{
            ...descriptionTextStyle,
            display: 'block',
            margin: 0,
            visibility: 'hidden', // Invisible but reserves flow space
            pointerEvents: 'none',
            whiteSpace: 'pre-wrap', // Match multiline height
            wordBreak: 'break-word',
          }}
        >
          {value || ' '}{' '}
          {/* Use actual content for accurate multiline height */}
        </div>
      ) : (
        // Display mode: read-only text (supports multiline, selectable)
        <div
          style={{
            ...descriptionTextStyle,
            display: 'block',
            margin: 0,
            cursor: 'default', // Override inherited cursor: text from editor wrapper
            whiteSpace: 'pre-wrap', // Preserve line breaks in display
            wordBreak: 'break-word', // Prevent overflow
          }}
        >
          {value}
        </div>
      )}
    </div>
  );
}
