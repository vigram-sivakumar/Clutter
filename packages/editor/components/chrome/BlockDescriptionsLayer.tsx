/**
 * BlockDescriptionsLayer - Geometry-tracked overlay for block descriptions
 *
 * CRITICAL ARCHITECTURE:
 * This layer is a SIBLING to EditorContent (ProseMirror root), NOT a descendant.
 * Uses absolute positioning with geometry tracking (same pattern as EditorChromeLayer).
 *
 * Why geometry overlay vs flow layout:
 * - ProseMirror owns layout (text flow)
 * - Chrome owns positioning (visual alignment)
 * - Mixing them causes event bubbling into PM
 *
 * Event Isolation:
 * - Input elements live in this overlay (outside PM DOM)
 * - No event bubbling path to ProseMirror
 * - No transaction conflicts
 *
 * Architecture:
 * <EditorRoot>
 *   <PMContainer />                ← ProseMirror (text only)
 *   <BlockDescriptionsLayer />     ← This layer (interactive UI, geometry-tracked)
 *   <EditorChromeLayer />          ← Other chrome (halos, menus)
 * </EditorRoot>
 */

import type { Editor } from '@tiptap/core';
import type { RefObject } from 'react';
import { useEffect, useState } from 'react';
import { useDescriptionEdit } from '../../context/DescriptionEditContext';
import { BlockDescription } from './BlockDescription';

export interface BlockDescriptionsLayerProps {
  editor: Editor;
  containerRef: RefObject<HTMLDivElement>;
}

const DESCRIPTION_CONFIG = {
  GAP: 4, // px - Gap between block and description
  Z_INDEX: 85, // Above content, below menus
} as const;

/**
 * BlockDescriptionsLayer - Renders descriptions as geometry-tracked overlay
 *
 * Follows the Geometry Contract:
 * - Reads block positions via getBoundingClientRect()
 * - Never influences ProseMirror layout
 * - Positions absolutely for visual alignment
 */
export function BlockDescriptionsLayer({
  editor,
  containerRef,
}: BlockDescriptionsLayerProps) {
  const {
    editingDescription,
    setEditingDescription,
    saveDescription,
    cancelDescription,
  } = useDescriptionEdit();

  // Force re-renders on relevant changes
  const [, setRenderTick] = useState(0);

  useEffect(() => {
    if (editingDescription) {
      setRenderTick((t) => t + 1);
    }
  }, [editingDescription]);

  useEffect(() => {
    const handleUpdate = () => {
      setRenderTick((t) => t + 1);
    };

    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
      editor.off('selectionUpdate', handleUpdate);
    };
  }, [editor]);

  if (!containerRef.current) return null;

  // Only show overlay when actively editing (display mode is in NodeView)
  if (!editingDescription) return null;

  // Find the block being edited
  let editingBlockRect: DOMRect | null = null;

  // Supported block types for descriptions
  // NOTE: When adding descriptions to new block types, add the node name here
  const supportedTypes = [
    'paragraph',
    'heading',
    'codeBlock',
    'callout',
    'blockquote',
    'listBlock',
  ];

  // Blocks with styled surfaces (description should appear outside the styled box)
  const styledSurfaceBlocks = ['codeBlock', 'callout'];

  editor.state.doc.descendants((node, pos) => {
    if (
      supportedTypes.includes(node.type.name) &&
      node.attrs.blockId === editingDescription.blockId
    ) {
      const domNode = editor.view.nodeDOM(pos);
      if (domNode && domNode instanceof HTMLElement) {
        // For styled surface blocks, position based on the styled surface element
        // For simple blocks, position based on content (exclude spacer)
        let targetElement: HTMLElement;

        if (styledSurfaceBlocks.includes(node.type.name)) {
          // Find styled surface (marked with data-styled-surface)
          const surface = domNode.querySelector(
            '[data-styled-surface]'
          ) as HTMLElement;
          targetElement = surface || domNode;
        } else {
          // For simple blocks, use content element (excludes spacer)
          const content = domNode.querySelector(
            '[data-node-view-content]'
          ) as HTMLElement;
          targetElement = content || domNode;
        }

        editingBlockRect = targetElement.getBoundingClientRect();
      }
      return false; // Stop traversing
    }
    return true;
  });

  if (!editingBlockRect) return null;

  const containerRect = containerRef.current.getBoundingClientRect();

  // Position input directly below the block being edited
  // Type assertion needed after null check (TS doesn't narrow through closure)
  const blockRect = editingBlockRect as DOMRect;
  const top = blockRect.bottom - containerRect.top;
  const left = blockRect.left - containerRect.left;
  const width = blockRect.width;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none', // Container doesn't block clicks
        zIndex: DESCRIPTION_CONFIG.Z_INDEX,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top,
          left,
          width,
          pointerEvents: 'auto', // Input is interactive
        }}
      >
        <BlockDescription
          value={editingDescription.value}
          mode="edit"
          onChange={(value) =>
            setEditingDescription({ ...editingDescription, value })
          }
          onCommit={saveDescription}
          onCancel={cancelDescription}
        />
      </div>
    </div>
  );
}
