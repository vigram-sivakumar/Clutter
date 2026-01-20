/**
 * Floating Toolbar
 * Shows formatting options when text is selected
 *
 * ⚠️ ARCHITECTURAL EXCEPTION:
 * This file imports utilities from @clutter/editor (addTagToBlock, isMultiBlockSelection).
 * These are editor behavior utilities needed for toolbar functionality.
 * This component should move to apps/ or editor package in Phase 5.
 * ESLint exception documented here until migration is complete.
 */

/* eslint-disable no-restricted-imports */
import { useEffect, useState, useRef } from 'react';
import { useEditor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { useTheme } from '../../hooks/useTheme';
import { spacing } from '../../tokens/spacing';
import { sizing } from '../../tokens/sizing';
import { radius } from '../../tokens/radius';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Underline,
  Link,
  Check,
  X,
  ChevronDown,
  Tag,
} from '../../icons';
import { colors as colorTokens } from '../../tokens/colors';
import { Button } from '../ui-buttons/Button';
import { Input } from './Input';
import { FloatingMenu } from './FloatingMenu';
import { addTagToBlock, isMultiBlockSelection } from '@clutter/editor';

interface FloatingToolbarProps {
  editor: ReturnType<typeof useEditor>;
}

// Highlight color options
const HIGHLIGHT_COLORS = [
  'default',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'purple',
  'pink',
  'red',
] as const;

// Toolbar divider component (extracted for reuse)
const ToolbarDivider = () => {
  const { colors } = useTheme();
  return (
    <div
      style={{
        width: 1,
        height: 20,
        backgroundColor: colors.border.default,
      }}
    />
  );
};

export const FloatingToolbar = ({ editor }: FloatingToolbarProps) => {
  const { colors, mode } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, bottom: 0 });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedColor, setSelectedColor] =
    useState<(typeof HIGHLIGHT_COLORS)[number]>('yellow'); // Shared for both text color and highlight
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);

  // Show/hide based on selection
  useEffect(() => {
    if (!editor) return;

    const updateToolbar = () => {
      const { state } = editor;
      const { selection } = state;
      const { from, to } = selection;

      // Hide toolbar if block is selected (NodeSelection)
      if (selection instanceof NodeSelection) {
        setIsVisible(false);
        setShowLinkInput(false);
        setShowColorPicker(false);
        return;
      }

      // No selection - hide toolbar and reset all states
      if (from === to) {
        setIsVisible(false);
        setShowLinkInput(false);
        setShowColorPicker(false);
        return;
      }

      // Hide toolbar if selection spans multiple blocks
      // (handles Shift+Click range selection, Cmd+A, dragging across blocks, etc.)
      if (isMultiBlockSelection(editor)) {
        setIsVisible(false);
        setShowLinkInput(false);
        setShowColorPicker(false);
        return;
      }

      const selectedText = state.doc.textBetween(from, to);
      if (selectedText.trim().length === 0) {
        setIsVisible(false);
        setShowLinkInput(false);
        setShowColorPicker(false);
        return;
      }

      // Close link input and dropdowns when selection changes
      // (but keep toolbar visible)
      setShowLinkInput(false);
      setShowColorPicker(false);

      const { view } = editor;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);

      // Calculate selection anchor (pure intent, no layout policy)
      const left = (start.left + end.left) / 2; // Horizontal center
      const top = start.top; // Selection top edge
      const bottom = end.bottom; // Selection bottom edge

      setPosition({
        top,
        left,
        bottom, // Pass bottom for flip calculation in FloatingMenu
      });
      setIsVisible(true);
    };

    editor.on('selectionUpdate', updateToolbar);
    editor.on('focus', updateToolbar);

    // Update position on window resize
    window.addEventListener('resize', updateToolbar);

    return () => {
      editor.off('selectionUpdate', updateToolbar);
      editor.off('focus', updateToolbar);
      window.removeEventListener('resize', updateToolbar);
    };
  }, [editor]);

  // Focus link input when shown
  useEffect(() => {
    if (showLinkInput && linkInputRef.current) {
      linkInputRef.current.focus();
    }
  }, [showLinkInput]);

  if (!editor || !isVisible) return null;

  const preventBlur = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Apply link helper
  const applyLink = () => {
    if (linkUrl.trim()) {
      let finalUrl = linkUrl.trim();
      if (!finalUrl.match(/^https?:\/\//i)) {
        finalUrl = `https://${finalUrl}`;
      }
      (editor.chain().focus() as any).setLink({ href: finalUrl }).run();
    }
    setLinkUrl('');
    setShowLinkInput(false);
  };

  // Get boundary rect from content wrapper for horizontal clamping
  const boundaryRect = editor?.view.dom
    .closest('.content-wrapper')
    ?.getBoundingClientRect();

  return (
    <FloatingMenu
      isOpen={isVisible}
      position={{
        top: position.top,
        bottom: position.bottom, // For flip calculation in FloatingMenu
        left: position.left,
        transform: 'translateX(-50%)',
      }}
      lockScroll={true}
      dismissOnEscape={false}
      boundaryRect={boundaryRect}
    >
      <div
        tabIndex={-1}
        onMouseDown={preventBlur}
        onPointerDown={preventBlur}
        style={{
          backgroundColor: colors.background.default,
          border: `1px solid ${colors.border.default}`,
          borderRadius: radius['12'],
          padding: spacing['4'],
          display: 'flex',
          alignItems: 'center',
          gap: spacing['4'],
          boxShadow: `0 4px 12px ${colors.shadow.md}`,
          userSelect: 'none',
        }}
      >
        {/* Link Input Mode - replaces all buttons */}
        {showLinkInput ? (
          <>
            <Input
              ref={linkInputRef}
              type="text"
              variant="tertiary"
              size="medium"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === 'Escape') {
                  setLinkUrl('');
                  setShowLinkInput(false);
                  editor.commands.focus();
                }
              }}
              placeholder="Enter URL..."
              style={{
                width: '180px',
              }}
            />
            {/* OK button */}
            <Button
              variant="tertiary"
              size="medium"
              icon={<Check />}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                applyLink();
              }}
            />
            {/* Remove link (if already has link) */}
            {editor.isActive('link') && (
              <Button
                variant="tertiary"
                size="medium"
                icon={<X />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  (editor.chain().focus() as any).unsetLink().run();
                  setLinkUrl('');
                  setShowLinkInput(false);
                }}
              />
            )}
            {/* Dismiss */}
            <Button
              variant="tertiary"
              size="medium"
              icon={<X />}
              subtle
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLinkUrl('');
                setShowLinkInput(false);
                editor.commands.focus();
              }}
            />
          </>
        ) : (
          <>
            {/* Highlight - removes text color, applies highlight */}
            <div
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const accent = colorTokens[mode].accent[selectedColor];
                // Remove text color first (mutual exclusivity)
                (editor.chain().focus() as any).unsetTextColor().run();
                if ('bg' in accent) {
                  (editor.chain().focus() as any)
                    .toggleHighlight({
                      color: accent.bg,
                      textColor: accent.text,
                    })
                    .run();
                }
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor:
                  colorTokens[mode].accent[selectedColor]?.bg ||
                  colors.background.secondary,
                color:
                  colorTokens[mode].accent[selectedColor]?.text ||
                  colors.text.default,
                border: `1px solid ${colors.border.default}`,
                borderRadius: radius['3'],
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'opacity 150ms cubic-bezier(0.2, 0, 0, 1)',
                opacity: editor.isActive('highlight') ? 1 : 0.9,
              }}
            >
              A
            </div>

            {/* Text Color - toggle text color (removes highlight if applying) */}
            <Button
              variant="tertiary"
              size="medium"
              active={editor.isActive('textColor')}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (editor.isActive('textColor')) {
                  // Remove text color if already active
                  (editor.chain().focus() as any).unsetTextColor().run();
                } else {
                  // Remove highlight first (mutual exclusivity), then apply text color
                  const accent = colorTokens[mode].accent[selectedColor];
                  (editor.chain().focus() as any).unsetHighlight().run();
                  if ('text' in accent) {
                    (editor.chain().focus() as any)
                      .setTextColor(accent.text)
                      .run();
                  }
                }
              }}
              icon={
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color:
                      colorTokens[mode].accent[selectedColor]?.text ||
                      colors.text.default,
                    fontSize: '16px',
                    fontWeight: 600,
                  }}
                >
                  A
                </div>
              }
            />

            {/* Color Picker Dropdown */}
            <div style={{ position: 'relative' }}>
              <Button
                variant="tertiary"
                size="medium"
                active={showColorPicker}
                icon={<ChevronDown />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowColorPicker(!showColorPicker);
                }}
              />

              {showColorPicker && (
                <div
                  onMouseDown={preventBlur}
                  onPointerDown={preventBlur}
                  style={{
                    position: 'absolute',
                    top: '120%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: spacing['4'],
                    backgroundColor: colors.background.default,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: radius['6'],
                    padding: spacing['6'],
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: spacing['6'],
                    boxShadow: `0 4px 12px ${colors.shadow.md}`,
                    zIndex: sizing.zIndex.dropdown + 1,
                  }}
                >
                  {HIGHLIGHT_COLORS.map((key) => {
                    const accent = colorTokens[mode].accent[key];
                    const bgColor =
                      'bg' in accent ? accent.bg : colors.border.default;
                    const textColor =
                      'text' in accent ? accent.text : colors.text.tertiary;
                    const isSelected = key === selectedColor;
                    return (
                      <div
                        key={key}
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedColor(key);
                          // Context-aware: update whichever style is currently active
                          if (editor.isActive('textColor')) {
                            // Text color is active - update text color
                            if ('text' in accent) {
                              (editor.chain().focus() as any)
                                .setTextColor(accent.text)
                                .run();
                            }
                          } else {
                            // Highlight is active or nothing - apply highlight
                            if ('bg' in accent) {
                              (editor.chain().focus() as any)
                                .setHighlight({
                                  color: accent.bg,
                                  textColor: accent.text,
                                })
                                .run();
                            }
                          }
                          setShowColorPicker(false);
                        }}
                        onMouseDown={preventBlur}
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          backgroundColor: textColor,
                          border: isSelected
                            ? `2px solid ${colors.text.default}`
                            : `1px solid ${bgColor}`,
                          cursor: 'pointer',
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Divider */}
            <ToolbarDivider />

            {/* Bold */}
            <Button
              variant="tertiary"
              size="medium"
              icon={<Bold />}
              active={editor.isActive('bold')}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (editor.chain().focus() as any).toggleBold().run();
              }}
            />

            {/* Italic */}
            <Button
              variant="tertiary"
              size="medium"
              icon={<Italic />}
              active={editor.isActive('italic')}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (editor.chain().focus() as any).toggleItalic().run();
              }}
            />

            {/* Strikethrough */}
            <Button
              variant="tertiary"
              size="medium"
              icon={<Strikethrough />}
              active={editor.isActive('strike')}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (editor.chain().focus() as any).toggleStrike().run();
              }}
            />

            {/* Wavy Underline */}
            <Button
              variant="tertiary"
              size="medium"
              icon={<Underline />}
              active={editor.isActive('wavyUnderline')}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.chain().focus().toggleMark('wavyUnderline').run();
              }}
            />

            {/* Code */}
            <Button
              variant="tertiary"
              size="medium"
              icon={<Code />}
              active={editor.isActive('code')}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (editor.chain().focus() as any).toggleCode().run();
              }}
            />

            {/* Divider */}
            <ToolbarDivider />

            {/* Link */}
            <Button
              variant="tertiary"
              size="medium"
              icon={<Link />}
              active={editor.isActive('link')}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (editor.isActive('link')) {
                  const attrs = editor.getAttributes('link');
                  setLinkUrl(attrs.href || '');
                }
                setShowLinkInput(true);
              }}
            />

            {/* Tag - converts selected text to tag */}
            <Button
              variant="tertiary"
              size="medium"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();

                // Get selected text
                const { state, view } = editor;
                const { from, to, $from } = state.selection;
                const selectedText = state.doc.textBetween(from, to).trim();

                if (selectedText) {
                  const depth = $from.depth;

                  // Don't allow tagging at document level
                  if (depth === 0) {
                    return;
                  }

                  // Use shared utility to add tag to block
                  const tr = addTagToBlock(state, selectedText, depth);

                  if (tr) {
                    // Tag was added, delete the selected text
                    tr.delete(from, to);

                    // Dispatch transaction
                    view.dispatch(tr);
                    editor.commands.focus();
                  }
                }
              }}
              icon={<Tag />}
            />
          </>
        )}
      </div>
    </FloatingMenu>
  );
};
