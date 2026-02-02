/**
 * Node Converters
 *
 * Convert ProseMirror nodes to Lexical JSON format.
 */

import type {
  PMNode,
  PMMark,
  LexicalNode,
  LexicalTextNode,
  LexicalParagraphNode,
  LexicalRoot,
  TextFormat,
} from './types';

/**
 * Convert ProseMirror marks to Lexical format bitmask
 */
export function marksToFormat(marks?: PMMark[]): number {
  if (!marks || marks.length === 0) return 0;

  let format = 0;

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
      case 'strong':
        format |= 1; // TextFormat.Bold
        break;
      case 'italic':
      case 'em':
        format |= 2; // TextFormat.Italic
        break;
      case 'strikethrough':
      case 'strike':
        format |= 4; // TextFormat.Strikethrough
        break;
      case 'underline':
      case 'u':
        format |= 8; // TextFormat.Underline
        break;
      case 'code':
        format |= 16; // TextFormat.Code
        break;
    }
  }

  return format;
}

/**
 * Convert PM text node to Lexical text node
 */
export function convertTextNode(pmNode: PMNode): LexicalTextNode {
  return {
    type: 'text',
    text: pmNode.text || '',
    format: marksToFormat(pmNode.marks),
    mode: 'normal',
    style: '',
    detail: 0,
    version: 1,
  };
}

/**
 * Convert PM inline content to Lexical children
 */
export function convertInlineContent(pmNodes?: PMNode[]): LexicalNode[] {
  if (!pmNodes || pmNodes.length === 0) {
    return [];
  }

  const lexicalNodes: LexicalNode[] = [];

  for (const pmNode of pmNodes) {
    if (pmNode.type === 'text') {
      lexicalNodes.push(convertTextNode(pmNode));
    } else if (pmNode.type === 'hardBreak') {
      // Line break - represented as \n in Lexical
      lexicalNodes.push({
        type: 'linebreak',
        version: 1,
      });
    } else {
      // For other inline nodes (links, etc.), treat as text for now
      // TODO: Handle links, mentions, etc.
      if (pmNode.text) {
        lexicalNodes.push(convertTextNode(pmNode));
      }
    }
  }

  return lexicalNodes;
}

/**
 * Convert PM paragraph to Lexical paragraph
 */
export function convertParagraph(pmNode: PMNode): LexicalParagraphNode {
  return {
    type: 'paragraph',
    children: convertInlineContent(pmNode.content),
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  };
}

/**
 * Convert PM heading to Lexical heading
 */
export function convertHeading(pmNode: PMNode): LexicalNode {
  const level = pmNode.attrs?.headingLevel || 1;
  const tag = `h${level}` as 'h1' | 'h2' | 'h3';

  return {
    type: 'heading',
    tag,
    children: convertInlineContent(pmNode.content),
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  };
}

/**
 * Convert PM list block to Lexical list
 */
export function convertListBlock(pmNode: PMNode): LexicalNode {
  const listType = pmNode.attrs?.listType || 'bullet';
  const checked = pmNode.attrs?.checked;

  // For now, convert to paragraph with marker
  // TODO: Implement proper Lexical list nodes
  const paragraph: LexicalParagraphNode = {
    type: 'paragraph',
    children: convertInlineContent(pmNode.content),
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  };

  return paragraph;
}

/**
 * Convert PM blockquote to Lexical quote
 */
export function convertBlockquote(pmNode: PMNode): LexicalNode {
  return {
    type: 'quote',
    children: convertInlineContent(pmNode.content),
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  };
}

/**
 * Convert PM code block to Lexical code
 */
export function convertCodeBlock(pmNode: PMNode): LexicalNode {
  const language = pmNode.attrs?.language;

  return {
    type: 'code',
    language: language || undefined,
    children: convertInlineContent(pmNode.content),
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  };
}

/**
 * Convert PM callout to Lexical paragraph (for now)
 */
export function convertCallout(pmNode: PMNode): LexicalNode {
  // Callout not implemented in Lexical yet
  // Convert to paragraph and preserve in block metadata
  return convertParagraph(pmNode);
}

/**
 * Convert any PM block node to Lexical content
 */
export function convertBlockContent(pmNode: PMNode): LexicalRoot {
  let lexicalNode: LexicalNode;

  switch (pmNode.type) {
    case 'paragraph':
      lexicalNode = convertParagraph(pmNode);
      break;

    case 'heading':
      lexicalNode = convertHeading(pmNode);
      break;

    case 'listBlock':
      lexicalNode = convertListBlock(pmNode);
      break;

    case 'blockquote':
      lexicalNode = convertBlockquote(pmNode);
      break;

    case 'codeBlock':
      lexicalNode = convertCodeBlock(pmNode);
      break;

    case 'callout':
      lexicalNode = convertCallout(pmNode);
      break;

    default:
      // Unknown node type - convert to paragraph
      lexicalNode = convertParagraph(pmNode);
  }

  // Wrap in Lexical root structure
  return {
    root: {
      children: [lexicalNode],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  };
}

/**
 * Extract plain text from PM node (for fallback)
 */
export function extractPlainText(pmNode: PMNode): string {
  if (pmNode.text) {
    return pmNode.text;
  }

  if (!pmNode.content) {
    return '';
  }

  return pmNode.content.map((child) => extractPlainText(child)).join('');
}
