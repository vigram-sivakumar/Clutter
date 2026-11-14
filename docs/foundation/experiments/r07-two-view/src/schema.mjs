import { Schema } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';

// A deliberately small semantic fixture schema, not Clutter's canonical format.
export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
    },
    code_block: {
      content: 'text*',
      group: 'block',
      code: true,
      marks: '',
      toDOM: () => ['pre', ['code', 0]],
    },
    task: {
      content: 'paragraph+',
      group: 'block',
      defining: true,
      isolating: true,
      attrs: {
        id: {},
        completed: { default: false },
        properties: { default: {} },
      },
      toDOM: (node) => [
        'section',
        {
          class: 'task',
          'data-task': node.attrs.id,
          'aria-label': 'Task ' + node.attrs.id,
        },
        0,
      ],
    },
    embed: {
      group: 'block',
      atom: true,
      attrs: { target: {}, label: {} },
      toDOM: (node) => [
        'aside',
        {
          class: 'embed',
          contenteditable: 'false',
          'data-target': node.attrs.target,
        },
        'Read-only embed: ' + node.attrs.label,
      ],
    },
    ...tableNodes({ tableGroup: 'block', cellContent: 'paragraph+' }),
  },
  marks: {
    strong: {
      parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
      toDOM: () => ['strong', 0],
    },
    em: { parseDOM: [{ tag: 'em' }, { tag: 'i' }], toDOM: () => ['em', 0] },
    code: { code: true, parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] },
  },
});
export const paragraph = (text) =>
  schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
export function fixture() {
  const cell = (text) => schema.nodes.table_cell.create(null, paragraph(text));
  return schema.nodes.doc.create(null, [
    paragraph('Alpha beta'),
    paragraph('Gamma delta'),
    schema.nodes.task.create(
      {
        id: 't1',
        completed: false,
        properties: { Priority: { type: 'text', value: 'High' } },
      },
      [paragraph('Send proposal'), paragraph('Budget details')]
    ),
    schema.nodes.table.create(null, [
      schema.nodes.table_row.create(null, [cell('One'), cell('Two')]),
      schema.nodes.table_row.create(null, [cell('Three'), cell('Four')]),
    ]),
    schema.nodes.embed.create({
      target: 'original-note',
      label: 'Original note',
    }),
    paragraph('café e\u0301 👩🏽\u200d💻 日本語 مرحبا'),
  ]);
}
export function validateDocument(doc) {
  doc.check();
  const tasks = new Set();
  doc.descendants((node) => {
    if (node.type.name === 'task') {
      if (
        typeof node.attrs.id !== 'string' ||
        !node.attrs.id ||
        tasks.has(node.attrs.id)
      )
        throw new Error('INVALID_TASK_IDENTITY');
      tasks.add(node.attrs.id);
      if (typeof node.attrs.completed !== 'boolean')
        throw new Error('INVALID_TASK_STATE');
    }
  });
}
export function textPosition(doc, text, offset = 0) {
  let found;
  doc.descendants((node, pos) => {
    if (found === undefined && node.isText && node.text.includes(text))
      found = pos + node.text.indexOf(text) + offset;
  });
  if (found === undefined) throw new Error('TEXT_NOT_FOUND: ' + text);
  return found;
}
