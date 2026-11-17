import { Schema } from 'prosemirror-model';
const nodes = {
  doc: { content: 'block*' },
  paragraph: {
    group: 'block',
    content: 'text*',
    attrs: { blockId: { default: null } },
  },
  text: {},
};
export const noteSchema = new Schema({
  nodes: {
    ...nodes,
    task_slot: {
      group: 'block',
      atom: true,
      attrs: { taskId: {}, blockId: {} },
    },
  },
});
export const taskSchema = new Schema({
  nodes: { ...nodes, doc: { content: 'paragraph+' } },
});
export const paragraph = (blockId, text) => ({
  type: 'paragraph',
  attrs: { blockId },
  ...(text ? { content: [{ type: 'text', text }] } : {}),
});
export const slotId = (taskId) => 'slot-' + taskId;
export const slot = (taskId) => ({
  type: 'task_slot',
  attrs: { taskId, blockId: slotId(taskId) },
});
export const document = (...content) => ({ type: 'doc', content });
export function parse(schema, json) {
  const doc = schema.nodeFromJSON(json);
  doc.check();
  return doc;
}
