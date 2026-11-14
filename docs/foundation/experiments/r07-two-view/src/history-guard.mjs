import { Step } from 'prosemirror-transform';
import { sendableSteps } from 'prosemirror-collab';
import { schema } from './schema.mjs';

// Exploratory conservative guard, distinct from the raw PM history candidate.
// Replays position provenance; not an optimized/complete semantic undo engine.
function advance(tokens, step, origin) {
  const changes = [];
  step.getMap().forEach((a, b, c, d) => changes.push({ a, b, c, d }));
  if (!changes.length) return { tokens, opaque: true };
  let next = [];
  let offset = 0;
  for (const { a, b, c, d } of changes) {
    next = next.concat(tokens.slice(offset, a));
    for (let i = c; i < d; i++) next.push(origin);
    offset = b;
  }
  next = next.concat(tokens.slice(offset));
  return { tokens: next, opaque: false };
}
export function historySafety(context, transaction) {
  const a = context.authority;
  let tokens = Array(a.genesis.content.size).fill('genesis'),
    opaqueForeign = false;
  a.steps.forEach((json, i) => {
    const mapped = advance(tokens, Step.fromJSON(schema, json), a.clients[i]);
    tokens = mapped.tokens;
    if (mapped.opaque && a.clients[i] !== context.id) opaqueForeign = true;
  });
  for (const step of sendableSteps(context.state)?.steps ?? [])
    tokens = advance(tokens, step, context.id).tokens;
  if (tokens.length !== context.state.doc.content.size)
    return 'UNDO_BLOCKED_PROVENANCE_MISMATCH';
  if (opaqueForeign) return 'UNDO_BLOCKED_FOREIGN_OPAQUE_CHANGE';
  for (const step of transaction.steps) {
    let unsafe = false;
    step.getMap().forEach((start, end) => {
      for (let i = start; i < end; i++)
        if (tokens[i] !== 'genesis' && tokens[i] !== context.id) unsafe = true;
    });
    if (unsafe) return 'UNDO_BLOCKED_FOREIGN_CONTENT';
    // Mark/attribute inverses do not have text maps. Conservatively refuse when
    // any surviving foreign contribution exists: precise mark ownership is open.
    let mappedRange = false;
    step.getMap().forEach(() => {
      mappedRange = true;
    });
    if (!mappedRange && tokens.some((t) => t !== 'genesis' && t !== context.id))
      return 'UNDO_BLOCKED_OPAQUE_INVERSE';
    tokens = advance(tokens, step, context.id).tokens;
  }
  return null;
}
