import { Schema } from 'prosemirror-model';
// One document, one fragment, one history. Body hierarchy is explicit and independent
// of list nesting; free indented roots are valid. Inline semantics share one schema.
const identity = { blockId: { default: null } };
const blockAttrs = {
  ...identity,
  indent: { default: 0 },
  parentId: { default: null },
};
const bodyDOM = (node) => ({
  'data-block-id': node.attrs.blockId,
  'data-indent': node.attrs.indent,
  style: '--block-indent:' + node.attrs.indent,
});
const nodes = {
  doc: { content: 'title block+' },
  title: {
    content: 'inline*',
    marks: 'link',
    attrs: identity,
    toDOM: (node) => [
      'h1',
      { 'data-title': '', 'data-block-id': node.attrs.blockId },
      0,
    ],
    parseDOM: [
      {
        tag: 'h1[data-title]',
        getAttrs: (dom) => ({ blockId: dom.getAttribute('data-block-id') }),
      },
    ],
  },
  paragraph: {
    group: 'block',
    content: 'inline*',
    attrs: blockAttrs,
    toDOM: (node) => ['p', bodyDOM(node), 0],
    parseDOM: [
      {
        tag: 'p',
        getAttrs: (dom) => ({ blockId: dom.getAttribute('data-block-id') }),
      },
    ],
  },
  heading: {
    group: 'block',
    content: 'inline*',
    defining: true,
    attrs: { ...blockAttrs, level: { default: 1 } },
    toDOM: (node) => ['h' + node.attrs.level, bodyDOM(node), 0],
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: 'h' + level + ':not([data-title])',
      getAttrs: (dom) => ({
        blockId: dom.getAttribute('data-block-id'),
        level,
      }),
    })),
  },
  separator: {
    group: 'block',
    atom: true,
    selectable: true,
    attrs: blockAttrs,
    toDOM: (node) => ['hr', { 'data-block-id': node.attrs.blockId }],
    parseDOM: [
      {
        tag: 'hr',
        getAttrs: (dom) => ({ blockId: dom.getAttribute('data-block-id') }),
      },
    ],
  },
  list_item: {
    group: 'block',
    content: 'inline*',
    defining: true,
    attrs: { ...blockAttrs, listStyle: { default: 'unordered' } },
    toDOM: (node) => [
      'div',
      {
        ...bodyDOM(node),
        'data-list-style': node.attrs.listStyle,
        'data-marker': node.attrs.listStyle === 'ordered' ? '1.' : '•',
        class: 'list-block',
      },
      0,
    ],
    parseDOM: [
      {
        tag: 'div[data-list-style]',
        getAttrs: (dom) => ({
          blockId: dom.getAttribute('data-block-id'),
          listStyle: dom.getAttribute('data-list-style'),
          indent: Number(dom.getAttribute('data-indent')) || 0,
        }),
      },
    ],
  },
  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    toDOM: () => ['br'],
    parseDOM: [{ tag: 'br' }],
    leafText: () => '\n',
  },
  text: { group: 'inline' },
  note_reference: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: { pageId: {}, label: {} },
    toDOM: (node) => [
      'span',
      {
        'data-note-reference': node.attrs.pageId,
        'data-label': node.attrs.label,
        contenteditable: 'false',
      },
      '@' + node.attrs.label,
    ],
    parseDOM: [
      {
        tag: 'span[data-note-reference]',
        getAttrs: (dom) => ({
          pageId: dom.getAttribute('data-note-reference'),
          label: dom.getAttribute('data-label') ?? '',
        }),
      },
    ],
    leafText: (node) => '@' + node.attrs.label,
  },
  date: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: { value: {} },
    toDOM: (node) => [
      'span',
      { 'data-date': node.attrs.value, contenteditable: 'false' },
      node.attrs.value,
    ],
    leafText: (node) => node.attrs.value,
    parseDOM: [
      {
        tag: 'span[data-date]',
        getAttrs: (dom) => ({ value: dom.getAttribute('data-date') }),
      },
    ],
  },
};
const marks = {
  link: {
    attrs: { href: {} },
    inclusive: false,
    toDOM: (mark) => [
      'a',
      { href: mark.attrs.href, rel: 'noopener noreferrer' },
      0,
    ],
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom) => ({ href: dom.getAttribute('href') }),
      },
    ],
  },
};
export const noteSchema = new Schema({ nodes, marks });
export const taskSchema = new Schema({ nodes, marks });
export const paragraph = (blockId, text) => ({
  type: 'paragraph',
  attrs: { blockId, indent: 0, parentId: null },
  ...(text ? { content: [{ type: 'text', text }] } : {}),
});
export const title = (blockId, text = '') => ({
  type: 'title',
  attrs: { blockId },
  ...(text ? { content: [{ type: 'text', text }] } : {}),
});
export const document = (...content) => ({ type: 'doc', content });
export const pageContent = (titleText = '', bodyText = '', ids = {}) => ({
  format: 'clutter.page-json',
  schemaVersion: 2,
  value: document(
    title(ids.title ?? 'title', titleText),
    paragraph(ids.body ?? 'paragraph', bodyText)
  ),
});
export function parse(schema, json) {
  const doc = schema.nodeFromJSON(json);
  doc.check();
  return doc;
}
