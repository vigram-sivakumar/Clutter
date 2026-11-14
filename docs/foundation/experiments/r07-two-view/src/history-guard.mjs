import {
  Step,
  AddMarkStep,
  RemoveMarkStep,
  AttrStep,
} from 'prosemirror-transform';
import { sendableSteps } from 'prosemirror-collab';
import { schema } from './schema.mjs';
import { touches, mapRange } from './change-footprint.mjs';

// Local conservative provenance. Known opaque changes protect their model span;
// unknown opaque steps protect the whole document rather than assume ownership.
function footprint(step, doc) {
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep)
    return { from: step.from, to: step.to };
  if (step instanceof AttrStep) {
    const node = doc.nodeAt(step.pos);
    if (node) return { from: step.pos, to: step.pos + node.nodeSize };
  }
  return { from: 0, to: doc.content.size };
}
function ranges(step) {
  const result = [];
  step
    .getMap()
    .forEach((from, to, newFrom, newTo) =>
      result.push({ from, to, newFrom, newTo })
    );
  return result;
}
function advance(tokens, changes, origin) {
  let next = [],
    offset = 0;
  for (const { from, to, newFrom, newTo } of changes) {
    next = next.concat(tokens.slice(offset, from));
    for (let i = newFrom; i < newTo; i++) next.push(origin);
    offset = to;
  }
  return changes.length ? next.concat(tokens.slice(offset)) : tokens;
}
export function historySafety(context, transaction) {
  const authority = context.authority;
  let doc = authority.genesis,
    tokens = Array(doc.content.size).fill('genesis'),
    foreignOpaque = [];
  const replay = (step, origin) => {
    const changes = ranges(step),
      mapping = step.getMap();
    foreignOpaque = foreignOpaque.map((range) => mapRange(range, mapping));
    if (!changes.length && origin !== context.id)
      foreignOpaque.push(footprint(step, doc));
    tokens = advance(tokens, changes, origin);
    const result = step.apply(doc);
    if (result.failed) return false;
    doc = result.doc;
    return true;
  };
  for (let i = 0; i < authority.steps.length; i++)
    if (
      !replay(Step.fromJSON(schema, authority.steps[i]), authority.clients[i])
    )
      return 'UNDO_BLOCKED_PROVENANCE_MISMATCH';
  for (const step of sendableSteps(context.state)?.steps ?? [])
    if (!replay(step, context.id)) return 'UNDO_BLOCKED_PROVENANCE_MISMATCH';
  if (
    tokens.length !== context.state.doc.content.size ||
    !doc.eq(context.state.doc)
  )
    return 'UNDO_BLOCKED_PROVENANCE_MISMATCH';
  for (const step of transaction.steps) {
    const changes = ranges(step);
    for (const { from, to } of changes) {
      for (let i = from; i < to; i++)
        if (tokens[i] !== 'genesis' && tokens[i] !== context.id)
          return 'UNDO_BLOCKED_FOREIGN_CONTENT';
      if (
        from !== to &&
        foreignOpaque.some((range) => touches(range, from, to))
      )
        return 'UNDO_BLOCKED_FOREIGN_OPAQUE_CHANGE';
    }
    if (!changes.length) {
      const span = footprint(step, doc);
      if (foreignOpaque.some((range) => touches(range, span.from, span.to)))
        return 'UNDO_BLOCKED_FOREIGN_OPAQUE_CHANGE';
      if (
        tokens
          .slice(span.from, span.to)
          .some((origin) => origin !== 'genesis' && origin !== context.id)
      )
        return 'UNDO_BLOCKED_OPAQUE_INVERSE';
    }
    if (!replay(step, context.id)) return 'UNDO_BLOCKED_PROVENANCE_MISMATCH';
  }
  return null;
}
