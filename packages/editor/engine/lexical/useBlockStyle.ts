/**
 * useBlockStyle Hook
 *
 * Determines block-specific styling based on:
 * - Block type from block store
 * - Lexical node type (for heading levels)
 * - Design tokens
 */

import { useState, useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $isElementNode } from 'lexical';
import { $isHeadingNode, $isQuoteNode } from '@lexical/rich-text';
import { $isCodeNode } from '@lexical/code';
import type { BlockType } from '../types/Block';

export interface BlockStyle {
  fontSize?: string;
  fontWeight?: number;
  lineHeight?: number;
  fontFamily?: string;
  backgroundColor?: string;
  borderLeft?: string;
  paddingLeft?: string;
  marginTop?: string;
  marginBottom?: string;
}

export interface BlockStyleConfig {
  contentStyle: BlockStyle;
  placeholderText: string;
}

/**
 * Hook to get block-specific styling
 */
export function useBlockStyle(
  blockType: BlockType | undefined
): BlockStyleConfig {
  const [editor] = useLexicalComposerContext();
  const [headingLevel, setHeadingLevel] = useState<'h1' | 'h2' | 'h3' | null>(
    null
  );

  // Detect heading level from Lexical state
  useEffect(() => {
    const removeUpdateListener = editor.registerUpdateListener(() => {
      editor.getEditorState().read(() => {
        const root = $getRoot();
        const firstChild = root.getFirstChild();

        if (
          firstChild &&
          $isElementNode(firstChild) &&
          $isHeadingNode(firstChild)
        ) {
          setHeadingLevel(firstChild.getTag() as 'h1' | 'h2' | 'h3');
        } else {
          setHeadingLevel(null);
        }
      });
    });

    return removeUpdateListener;
  }, [editor]);

  // Base styles for all blocks
  const baseStyle: BlockStyle = {};

  // Type-specific styles
  let contentStyle: BlockStyle = { ...baseStyle };
  let placeholderText = 'Type here...';

  switch (blockType) {
    case 'heading':
      // Apply heading-specific styles based on level
      if (headingLevel === 'h1') {
        contentStyle = {
          ...baseStyle,
          fontSize: '30px',
          fontWeight: 700,
          lineHeight: 1.3,
          letterSpacing: '-0.02em',
        };
        placeholderText = 'Heading 1';
      } else if (headingLevel === 'h2') {
        contentStyle = {
          ...baseStyle,
          fontSize: '24px',
          fontWeight: 600,
          lineHeight: 1.4,
          letterSpacing: '-0.01em',
        };
        placeholderText = 'Heading 2';
      } else if (headingLevel === 'h3') {
        contentStyle = {
          ...baseStyle,
          fontSize: '20px',
          fontWeight: 600,
          lineHeight: 1.4,
        };
        placeholderText = 'Heading 3';
      } else {
        // Default to h1 if no level detected yet
        contentStyle = {
          ...baseStyle,
          fontSize: '30px',
          fontWeight: 700,
          lineHeight: 1.3,
          letterSpacing: '-0.02em',
        };
        placeholderText = 'Heading';
      }
      break;

    case 'quote':
      contentStyle = {
        ...baseStyle,
        borderLeft: '3px solid rgba(55, 53, 47, 0.16)',
        paddingLeft: '14px',
        marginTop: '4px',
        marginBottom: '4px',
      };
      placeholderText = 'Quote';
      break;

    case 'code':
      contentStyle = {
        ...baseStyle,
        fontFamily:
          '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace',
        fontSize: '14px',
        backgroundColor: 'rgba(135, 131, 120, 0.15)',
        lineHeight: 1.5,
        paddingLeft: '8px',
      };
      placeholderText = '// Code';
      break;

    case 'list':
      contentStyle = {
        ...baseStyle,
      };
      placeholderText = 'List item';
      break;

    case 'paragraph':
    default:
      contentStyle = {
        ...baseStyle,
        fontSize: '16px',
        fontWeight: 400,
        lineHeight: 1.5,
      };
      placeholderText = 'Type here...';
      break;
  }

  return {
    contentStyle,
    placeholderText,
  };
}
