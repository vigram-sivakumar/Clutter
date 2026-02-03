/**
 * Formatting Toolbar Plugin
 *
 * Shows formatting options when text is selected.
 * Exact visual recreation of old ProseMirror FloatingToolbar.
 *
 * Architecture:
 * - Detects text selection in Lexical
 * - Uses existing FloatingMenu + Button + Input primitives
 * - Editor owns focus (toolbar never calls .focus())
 * - Pull-based positioning (rAF updates)
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import {
  useTheme,
  spacing,
  sizing,
  radius,
  colors as colorTokens,
  Button,
  Input,
  FloatingMenu,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Underline,
  Link as LinkIcon,
  Check,
  X,
  ChevronDown,
} from '@clutter/ui';

export interface FormattingToolbarPluginProps {
  blockId: string;
}

// Highlight color options (exact same as old toolbar)
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

// Toolbar divider component (exact copy from old)
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

export function FormattingToolbarPlugin({
  blockId,
}: FormattingToolbarPluginProps) {
  const [editor] = useLexicalComposerContext();
  const { colors, mode } = useTheme();

  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, bottom: 0 });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedColor, setSelectedColor] =
    useState<(typeof HIGHLIGHT_COLORS)[number]>('yellow');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [hasLink, setHasLink] = useState(false);

  const linkInputRef = useRef<HTMLInputElement>(null);
  const updateScheduledRef = useRef(false);

  // Check if selection has specific format
  const [formats, setFormats] = useState({
    bold: false,
    italic: false,
    strikethrough: false,
    code: false,
    underline: false,
    link: false,
  });

  // Update toolbar visibility and position (pull-based)
  const updateToolbar = useCallback(() => {
    if (updateScheduledRef.current) return;
    updateScheduledRef.current = true;

    requestAnimationFrame(() => {
      updateScheduledRef.current = false;

      editor.getEditorState().read(() => {
        const selection = $getSelection();

        // Hide for non-range selections
        if (!$isRangeSelection(selection)) {
          setIsVisible(false);
          setShowLinkInput(false);
          setShowColorPicker(false);
          return;
        }

        // Hide for collapsed selection
        if (selection.isCollapsed()) {
          setIsVisible(false);
          setShowLinkInput(false);
          setShowColorPicker(false);
          return;
        }

        // Get selected text
        const selectedText = selection.getTextContent();
        if (!selectedText.trim()) {
          setIsVisible(false);
          setShowLinkInput(false);
          setShowColorPicker(false);
          return;
        }

        // Check active formats
        setFormats({
          bold: selection.hasFormat('bold'),
          italic: selection.hasFormat('italic'),
          strikethrough: selection.hasFormat('strikethrough'),
          code: selection.hasFormat('code'),
          underline: selection.hasFormat('underline'),
          link: false, // TODO: Check for link node
        });

        // Calculate position from selection
        const nativeSelection = window.getSelection();
        if (!nativeSelection || nativeSelection.rangeCount === 0) {
          setIsVisible(false);
          return;
        }

        const range = nativeSelection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Selection anchor (pure intent, FloatingMenu applies policy)
        setPosition({
          top: rect.top,
          left: rect.left + rect.width / 2, // Horizontal center
          bottom: rect.bottom,
        });

        setIsVisible(true);

        // Close dropdowns on selection change
        setShowColorPicker(false);
        // Keep link input open if already open
      });
    });
  }, [editor]);

  // Subscribe to selection changes
  useEffect(() => {
    const unregister = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    return unregister;
  }, [editor, updateToolbar]);

  // Update on window resize
  useEffect(() => {
    if (!isVisible) return;

    window.addEventListener('resize', updateToolbar);
    return () => {
      window.removeEventListener('resize', updateToolbar);
    };
  }, [isVisible, updateToolbar]);

  // Focus link input when shown
  useEffect(() => {
    if (showLinkInput && linkInputRef.current) {
      linkInputRef.current.focus();
    }
  }, [showLinkInput]);

  if (!isVisible) return null;

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
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, finalUrl);
    }
    setLinkUrl('');
    setShowLinkInput(false);
  };

  // Remove link helper
  const removeLink = () => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    setLinkUrl('');
    setShowLinkInput(false);
  };

  // Get boundary rect for horizontal clamping
  const editorElement = editor.getRootElement();
  const boundaryRect = editorElement
    ?.closest('.content-wrapper')
    ?.getBoundingClientRect();

  return (
    <FloatingMenu
      isOpen={isVisible}
      position={{
        top: position.top,
        bottom: position.bottom,
        left: position.left,
      }}
      lockScroll={true}
      dismissOnEscape={false}
      boundaryRect={boundaryRect}
      preferAbove={true}
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
              ref={linkInputRef as any}
              type="text"
              variant="tertiary"
              size="medium"
              value={linkUrl}
              onChange={(e) => setLinkUrl((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === 'Escape') {
                  setLinkUrl('');
                  setShowLinkInput(false);
                  editor.focus();
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
            {hasLink && (
              <Button
                variant="tertiary"
                size="medium"
                icon={<X />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeLink();
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
                editor.focus();
              }}
            />
          </>
        ) : (
          <>
            {/* Highlight - TODO: Implement when Lexical supports highlights */}
            <div
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // TODO: Implement highlight toggle when Lexical supports it
                console.log(
                  '[FormattingToolbar] Highlight not yet implemented'
                );
              }}
              onMouseDown={preventBlur}
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
                opacity: 0.9,
              }}
            >
              A
            </div>

            {/* Text Color - TODO: Implement when Lexical supports text color */}
            <Button
              variant="tertiary"
              size="medium"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // TODO: Implement text color when Lexical supports it
                console.log(
                  '[FormattingToolbar] Text color not yet implemented'
                );
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
                          setShowColorPicker(false);
                          // TODO: Apply color when Lexical supports it
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
              active={formats.bold}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
              }}
            />

            {/* Italic */}
            <Button
              variant="tertiary"
              size="medium"
              icon={<Italic />}
              active={formats.italic}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
              }}
            />

            {/* Strikethrough */}
            <Button
              variant="tertiary"
              size="medium"
              icon={<Strikethrough />}
              active={formats.strikethrough}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');
              }}
            />

            {/* Underline */}
            <Button
              variant="tertiary"
              size="medium"
              icon={<Underline />}
              active={formats.underline}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
              }}
            />

            {/* Code */}
            <Button
              variant="tertiary"
              size="medium"
              icon={<Code />}
              active={formats.code}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
              }}
            />

            {/* Divider */}
            <ToolbarDivider />

            {/* Link */}
            <Button
              variant="tertiary"
              size="medium"
              icon={<LinkIcon />}
              active={formats.link}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();

                // TODO: Get current link URL from selection
                setLinkUrl('');
                setShowLinkInput(true);
              }}
            />
          </>
        )}
      </div>
    </FloatingMenu>
  );
}
