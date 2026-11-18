import { Fault, stable } from './contracts.ts';
type Body = {
  content?: ({ attrs: { blockId: string } } & Record<string, unknown>)[];
};
function reordered(base: Map<string, unknown>, branch: Map<string, unknown>) {
  const shared = [...base.keys()].filter((id) => branch.has(id));
  let i = 0;
  for (const id of branch.keys())
    if (base.has(id) && id !== shared[i++]) return true;
  return false;
}

export function assertBodyRebase(
  base: Body,
  draft: Body,
  latest: Body,
  ownSave = false
) {
  const blocks = (body: Body) =>
    new Map((body.content ?? []).map((block) => [block.attrs.blockId, block]));
  const b = blocks(base),
    d = blocks(draft),
    l = blocks(latest);
  // A Y XML reorder can recreate the moved content. A foreign body change
  // on the other branch could otherwise be applied to an obsolete node.
  if (
    !ownSave &&
    (reordered(b, d) || reordered(b, l)) &&
    stable(base) !== stable(draft) &&
    stable(base) !== stable(latest)
  )
    throw new Fault('EDITOR_REBASE_CONFLICT');
  for (const id of new Set([...b.keys(), ...d.keys()])) {
    const before = b.get(id),
      local = d.get(id),
      remote = l.get(id);
    if (stable(before ?? null) === stable(local ?? null)) continue;
    if (before && local && !remote) throw new Fault('EDITOR_REBASE_CONFLICT');
    if (before && !local && remote && stable(before) !== stable(remote))
      throw new Fault('EDITOR_REBASE_CONFLICT');
  }
}
