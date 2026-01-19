/**
 * Keyboard Rules: Detection Logic
 *
 * These functions only DETECT context and return boolean/data.
 * They do NOT execute actions or modify the editor state.
 *
 * Purpose: Centralize decision logic while keeping execution in nodes.
 */

import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { findAncestorNode } from './keyboardHelpers';

/**
 * Enter Key Detection Rules
 */
export const EnterRules = {
  /**
   * Detect: Is cursor in an empty paragraph?
   */
  isInEmptyParagraph(editor: Editor): boolean {
    const { $from } = editor.state.selection;
    const para = $from.parent;

    return para.type.name === 'paragraph' && para.textContent === '';
  },

  /**
   * Detect: Is the current block empty? (works for any block type)
   */
  isCurrentBlockEmpty(editor: Editor): boolean {
    const { $from } = editor.state.selection;
    const block = $from.parent;

    return block.textContent === '';
  },

  /**
   * Detect: Is cursor in an empty paragraph inside any wrapper block?
   * Returns: { inWrapper: boolean, wrapper?: {pos, node, depth}, isDirectChild: boolean }
   */
  getEmptyParagraphWrapperContext(editor: Editor): {
    inWrapper: boolean;
    wrapper?: { pos: number; node: PMNode; depth: number };
    isDirectChild: boolean;
  } {
    const { $from } = editor.state.selection;
    const para = $from.parent;

    if (para.type.name !== 'paragraph' || para.textContent !== '') {
      return { inWrapper: false, isDirectChild: false };
    }

    const wrapper = findAncestorNode(editor, [
      'listBlock',
      'toggleBlock',
      'blockquote',
      'callout',
    ]);
    if (!wrapper) {
      return { inWrapper: false, isDirectChild: false };
    }

    // Check if paragraph is a direct child of the wrapper
    const parentOfPara = $from.node($from.depth - 1);
    const isDirectChild = parentOfPara.type.name === wrapper.node.type.name;

    return {
      inWrapper: true,
      wrapper,
      isDirectChild,
    };
  },

  /**
   * Detect: Is cursor in an empty listBlock?
   * Returns: { isEmpty: boolean, listBlock?: {pos, node}, attrs?: any }
   */
  getEmptyListBlockContext(editor: Editor): {
    isEmpty: boolean;
    listBlock?: { pos: number; node: PMNode; depth: number };
    attrs?: any;
  } {
    const listBlock = findAncestorNode(editor, 'listBlock');
    if (!listBlock) {
      return { isEmpty: false };
    }

    // ListBlock now has inline content directly (no nested paragraph)
    const isEmpty = listBlock.node.textContent === '';

    if (!isEmpty) {
      return { isEmpty: false };
    }

    return {
      isEmpty: true,
      listBlock,
      attrs: listBlock.node.attrs,
    };
  },

  /**
   * Detect: Is cursor in an empty listBlock at level 0 inside a wrapper?
   * Returns: { shouldExitWrapper: boolean, wrapper?, listBlock? }
   */
  shouldExitWrapperFromListBlock(editor: Editor): {
    shouldExit: boolean;
    wrapper?: { pos: number; node: PMNode; depth: number };
    listBlock?: { pos: number; node: PMNode; depth: number };
  } {
    const listBlockContext = this.getEmptyListBlockContext(editor);

    if (!listBlockContext.isEmpty) {
      return { shouldExit: false };
    }

    const attrs = listBlockContext.attrs;

    // If indent > 0, should outdent instead
    if (attrs.indent > 0) {
      return { shouldExit: false };
    }

    // Check if inside a wrapper
    const wrapper = findAncestorNode(editor, [
      'toggleBlock',
      'blockquote',
      'callout',
    ]);

    return {
      shouldExit: !!wrapper,
      wrapper,
      listBlock: listBlockContext.listBlock,
    };
  },

  /**
   * Detect: Is cursor in empty heading?
   */
  isInEmptyHeading(editor: Editor): boolean {
    const { $from } = editor.state.selection;
    const heading = $from.parent;

    return heading.type.name === 'heading' && heading.textContent === '';
  },

  /**
   * Detect: Is cursor in toggleBlock header?
   */
  isInToggleHeader(editor: Editor): {
    inHeader: boolean;
    isEmpty?: boolean;
    toggleBlock?: { pos: number; node: PMNode };
    headerParagraph?: PMNode;
  } {
    const { state } = editor;
    const { $from } = state.selection;

    const toggleBlock = findAncestorNode(editor, 'toggleBlock');
    if (!toggleBlock) {
      return { inHeader: false };
    }

    const headerParagraphPos = toggleBlock.pos + 1;
    const headerParagraph = toggleBlock.node.firstChild;

    if (!headerParagraph) {
      return { inHeader: false };
    }

    const isInHeader =
      $from.pos >= headerParagraphPos &&
      $from.pos <= headerParagraphPos + headerParagraph.nodeSize;

    if (!isInHeader) {
      return { inHeader: false };
    }

    return {
      inHeader: true,
      isEmpty: headerParagraph.textContent === '',
      toggleBlock,
      headerParagraph,
    };
  },

  /**
   * Detect: Is cursor in a heading?
   * Returns: { inHeading: boolean, headingPos?, headingNode? }
   */
  isInHeading(editor: Editor): {
    inHeading: boolean;
    headingPos?: number;
    headingNode?: PMNode;
  } {
    const { state } = editor;
    const { $from } = state.selection;

    if ($from.parent.type.name !== 'heading') {
      return { inHeading: false };
    }

    const headingDepth = $from.depth;
    const headingPos = $from.before(headingDepth);
    const headingNode = state.doc.nodeAt(headingPos);

    if (!headingNode) {
      return { inHeading: false };
    }

    return {
      inHeading: true,
      headingPos,
      headingNode,
    };
  },

  /**
   * Detect: Is cursor in a wrapper block (blockquote, callout) with context for Enter behavior?
   * Returns wrapper info, current paragraph, and conditions
   */
  getWrapperBlockContext(
    editor: Editor,
    wrapperType: 'blockquote' | 'callout' | 'toggleHeader'
  ): {
    inWrapper: boolean;
    wrapperPos?: number;
    wrapperNode?: PMNode;
    currentParagraph?: PMNode;
    isEmpty?: boolean;
    isOnlyChild?: boolean;
    isAtEnd?: boolean;
  } {
    const { state } = editor;
    const { selection } = state;
    const { $from, empty } = selection;

    if (!empty) {
      return { inWrapper: false };
    }

    // Find the wrapper ancestor
    let wrapperPos: number | null = null;
    let wrapperNode = null;

    for (let d = $from.depth; d >= 1; d--) {
      const pos = $from.before(d);
      const node = state.doc.nodeAt(pos);
      if (node && node.type.name === wrapperType) {
        wrapperPos = pos;
        wrapperNode = node;
        break;
      }
    }

    if (wrapperPos === null || !wrapperNode) {
      return { inWrapper: false };
    }

    // For inline content blocks, $from.parent is the block itself (callout/blockquote)
    const currentBlock = $from.parent;
    const isEmpty = currentBlock.textContent === '';
    const isOnlyChild = true; // Always true for inline content (no child blocks)
    const isAtEnd = $from.parentOffset === currentBlock.content.size;

    return {
      inWrapper: true,
      wrapperPos,
      wrapperNode,
      currentParagraph: currentBlock, // Keep name for backward compat
      isEmpty,
      isOnlyChild,
      isAtEnd,
    };
  },
};

/**
 * Backspace Key Detection Rules
 */
export const BackspaceRules = {
  /**
   * Detect: Is cursor at start of paragraph?
   */
  isAtStartOfParagraph(editor: Editor): boolean {
    const { $from } = editor.state.selection;
    return $from.parentOffset === 0;
  },

  /**
   * Detect: Is cursor in an empty paragraph at start?
   */
  isInEmptyParagraphAtStart(editor: Editor): boolean {
    const { $from } = editor.state.selection;
    const para = $from.parent;

    return (
      $from.parentOffset === 0 &&
      para.type.name === 'paragraph' &&
      para.textContent === ''
    );
  },

  /**
   * Detect: Is there a structural block before current paragraph?
   * Returns: { hasStructuralBlock: boolean, blockBefore?: any }
   */
  getStructuralBlockBefore(editor: Editor): {
    hasStructuralBlock: boolean;
    blockBefore?: PMNode;
    blockType?: string;
  } {
    const { state } = editor;
    const { $from } = state.selection;

    const paragraphPos = $from.before($from.depth);
    const beforePos = paragraphPos - 1;

    if (beforePos < 0) {
      return { hasStructuralBlock: false };
    }

    const $before = state.doc.resolve(beforePos);
    const nodeBefore = $before.parent;

    const structuralBlocks = [
      'blockquote',
      'callout',
      'toggleBlock',
      'codeBlock',
    ];

    if (structuralBlocks.includes(nodeBefore.type.name)) {
      return {
        hasStructuralBlock: true,
        blockBefore: nodeBefore,
        blockType: nodeBefore.type.name,
      };
    }

    return { hasStructuralBlock: false };
  },

  /**
   * Detect: Should paragraph inside wrapper let wrapper handle backspace?
   */
  shouldLetWrapperHandleBackspace(editor: Editor): boolean {
    const { $from } = editor.state.selection;

    // Check if we're inside a block that has its own backspace handler
    const ancestor = findAncestorNode(editor, [
      'listBlock',
      'blockquote',
      'callout',
      'toggleBlock',
      'codeBlock',
    ]);

    return !!ancestor;
  },

  /**
   * Detect: Is cursor in empty heading at start?
   * Returns: { isEmpty: boolean, heading?, headingPos? }
   */
  isInEmptyHeadingAtStart(editor: Editor): {
    isEmpty: boolean;
    heading?: PMNode;
    headingPos?: number;
  } {
    const { state } = editor;
    const { $from } = state.selection;

    // Must be at start and in a heading
    if ($from.parentOffset !== 0 || $from.parent.type.name !== 'heading') {
      return { isEmpty: false };
    }

    const heading = $from.parent;
    const isEmpty = heading.textContent === '';

    if (!isEmpty) {
      return { isEmpty: false };
    }

    const headingPos = $from.before($from.depth);

    return {
      isEmpty: true,
      heading,
      headingPos,
    };
  },

  /**
   * Detect: Empty listBlock backspace context
   * Returns: { isEmpty: boolean, listBlock?, attrs?, shouldOutdent, shouldConvertToParagraph }
   */
  getEmptyListBlockBackspaceContext(editor: Editor): {
    isEmpty: boolean;
    listBlock?: { pos: number; node: PMNode; depth: number };
    attrs?: any;
    shouldOutdent: boolean;
    shouldConvertToParagraph: boolean;
  } {
    const { state } = editor;
    const { $from } = state.selection;

    // Must be at start of paragraph
    if ($from.parentOffset !== 0) {
      return {
        isEmpty: false,
        shouldOutdent: false,
        shouldConvertToParagraph: false,
      };
    }

    const listBlock = findAncestorNode(editor, 'listBlock');
    if (!listBlock) {
      return {
        isEmpty: false,
        shouldOutdent: false,
        shouldConvertToParagraph: false,
      };
    }

    const paragraph = listBlock.node.firstChild;
    const isEmpty = !paragraph || paragraph.textContent === '';

    if (!isEmpty) {
      return {
        isEmpty: false,
        shouldOutdent: false,
        shouldConvertToParagraph: false,
      };
    }

    const attrs = listBlock.node.attrs;

    // If indent > 0, should outdent
    if (attrs.indent > 0) {
      return {
        isEmpty: true,
        listBlock,
        attrs,
        shouldOutdent: true,
        shouldConvertToParagraph: false,
      };
    }

    // Level 0: convert to paragraph (consistent behavior inside or outside wrapper)
    return {
      isEmpty: true,
      listBlock,
      attrs,
      shouldOutdent: false,
      shouldConvertToParagraph: true,
    };
  },

  /**
   * Detect: Is cursor at start of empty paragraph in a wrapper block (blockquote, callout)?
   * Returns wrapper info and whether to convert to paragraph
   */
  getWrapperBlockBackspaceContext(
    editor: Editor,
    wrapperType: 'blockquote' | 'callout' | 'toggleHeader'
  ): {
    inWrapper: boolean;
    wrapperPos?: number;
    wrapperNode?: PMNode;
    currentParagraph?: PMNode;
    isEmpty?: boolean;
    isOnlyChild?: boolean;
    shouldConvert?: boolean;
  } {
    const { state } = editor;
    const { selection } = state;
    const { $from, empty } = selection;

    // Only handle if cursor is at start of block and selection is empty
    if (!empty || $from.parentOffset !== 0) {
      return { inWrapper: false };
    }

    // Find the wrapper ancestor
    let wrapperPos: number | null = null;
    let wrapperNode = null;

    for (let d = $from.depth; d >= 1; d--) {
      const pos = $from.before(d);
      const node = state.doc.nodeAt(pos);
      if (node && node.type.name === wrapperType) {
        wrapperPos = pos;
        wrapperNode = node;
        break;
      }
    }

    if (wrapperPos === null || !wrapperNode) {
      return { inWrapper: false };
    }

    // For inline content blocks, $from.parent is the block itself (callout/blockquote)
    const currentBlock = $from.parent;
    const isEmpty = currentBlock.textContent === '';
    const isOnlyChild = true; // Always true for inline content (no child blocks)
    const shouldConvert = isEmpty && isOnlyChild;

    return {
      inWrapper: true,
      wrapperPos,
      wrapperNode,
      currentParagraph: currentBlock, // Keep name for backward compat
      isEmpty,
      isOnlyChild,
      shouldConvert,
    };
  },
};
