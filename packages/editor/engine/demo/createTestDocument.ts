/**
 * Create Test Document
 *
 * Generates a comprehensive test document with all block types
 * for visual parity testing.
 */

import type { BlocksDocument } from '../serialization/types';

/**
 * Simple ID generator for test blocks
 */
function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a test document with all block types
 */
export function createTestDocument(): BlocksDocument {
  const now = Date.now();

  return {
    version: 2,
    format: 'blocks',
    blocks: [
      // Paragraph
      {
        id: generateTestId(),
        type: 'paragraph',
        parent: null,
        children: [],
        indent: 0,
        content: JSON.stringify({
          root: {
            children: [
              {
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'This is a regular paragraph with some text content.',
                    type: 'text',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'paragraph',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
          },
        }),
        properties: {},
        createdAt: now,
        updatedAt: now,
      },

      // Heading 1
      {
        id: generateTestId(),
        type: 'heading',
        parent: null,
        children: [],
        indent: 0,
        content: JSON.stringify({
          root: {
            children: [
              {
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'Heading 1 - Large and Bold',
                    type: 'text',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'heading',
                tag: 'h1',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
          },
        }),
        properties: {},
        createdAt: now,
        updatedAt: now,
      },

      // Heading 2
      {
        id: generateTestId(),
        type: 'heading',
        parent: null,
        children: [],
        indent: 0,
        content: JSON.stringify({
          root: {
            children: [
              {
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'Heading 2 - Medium and Semibold',
                    type: 'text',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'heading',
                tag: 'h2',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
          },
        }),
        properties: {},
        createdAt: now,
        updatedAt: now,
      },

      // Heading 3
      {
        id: generateTestId(),
        type: 'heading',
        parent: null,
        children: [],
        indent: 0,
        content: JSON.stringify({
          root: {
            children: [
              {
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'Heading 3 - Small and Semibold',
                    type: 'text',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'heading',
                tag: 'h3',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
          },
        }),
        properties: {},
        createdAt: now,
        updatedAt: now,
      },

      // Quote
      {
        id: generateTestId(),
        type: 'quote',
        parent: null,
        children: [],
        indent: 0,
        content: JSON.stringify({
          root: {
            children: [
              {
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'This is a blockquote with an orange 4px marker bar on the left.',
                    type: 'text',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'quote',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
          },
        }),
        properties: {},
        createdAt: now,
        updatedAt: now,
      },

      // Code Block
      {
        id: generateTestId(),
        type: 'code',
        parent: null,
        children: [],
        indent: 0,
        content: JSON.stringify({
          root: {
            children: [
              {
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'function hello() {\n  console.log("Code block with icon and border");\n  return true;\n}',
                    type: 'text',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'code',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
          },
        }),
        properties: {},
        createdAt: now,
        updatedAt: now,
      },

      // Bullet List
      {
        id: generateTestId(),
        type: 'list',
        parent: null,
        children: [],
        indent: 0,
        content: JSON.stringify({
          root: {
            children: [
              {
                children: [
                  {
                    children: [
                      {
                        detail: 0,
                        format: 0,
                        mode: 'normal',
                        style: '',
                        text: 'First bullet point',
                        type: 'text',
                        version: 1,
                      },
                    ],
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    type: 'listitem',
                    value: 1,
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                listType: 'bullet',
                start: 1,
                tag: 'ul',
                type: 'list',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
          },
        }),
        properties: {},
        createdAt: now,
        updatedAt: now,
      },

      // Numbered List
      {
        id: generateTestId(),
        type: 'list',
        parent: null,
        children: [],
        indent: 0,
        content: JSON.stringify({
          root: {
            children: [
              {
                children: [
                  {
                    children: [
                      {
                        detail: 0,
                        format: 0,
                        mode: 'normal',
                        style: '',
                        text: 'First numbered item',
                        type: 'text',
                        version: 1,
                      },
                    ],
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    type: 'listitem',
                    value: 1,
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                listType: 'number',
                start: 1,
                tag: 'ol',
                type: 'list',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
          },
        }),
        properties: {},
        createdAt: now,
        updatedAt: now,
      },

      // Paragraph with formatted text
      {
        id: generateTestId(),
        type: 'paragraph',
        parent: null,
        children: [],
        indent: 0,
        content: JSON.stringify({
          root: {
            children: [
              {
                children: [
                  {
                    detail: 0,
                    format: 1, // bold
                    mode: 'normal',
                    style: '',
                    text: 'Bold text',
                    type: 'text',
                    version: 1,
                  },
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: ', ',
                    type: 'text',
                    version: 1,
                  },
                  {
                    detail: 0,
                    format: 2, // italic
                    mode: 'normal',
                    style: '',
                    text: 'italic text',
                    type: 'text',
                    version: 1,
                  },
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: ', ',
                    type: 'text',
                    version: 1,
                  },
                  {
                    detail: 0,
                    format: 8, // underline
                    mode: 'normal',
                    style: '',
                    text: 'underlined text',
                    type: 'text',
                    version: 1,
                  },
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: ', and ',
                    type: 'text',
                    version: 1,
                  },
                  {
                    detail: 0,
                    format: 16, // code
                    mode: 'normal',
                    style: '',
                    text: 'inline code',
                    type: 'text',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'paragraph',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
          },
        }),
        properties: {},
        createdAt: now,
        updatedAt: now,
      },
    ],
    metadata: {
      createdAt: now,
      updatedAt: now,
      blockCount: 8,
    },
  };
}
