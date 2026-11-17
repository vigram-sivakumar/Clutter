import { Fault, stable } from './contracts.ts';
type Body = {
  content?: ({ attrs: { blockId: string } } & Record<string, unknown>)[];
};
export function assertBodyRebase(base: Body, draft: Body, latest: Body) {
  const blocks = (body: Body) =>
    new Map((body.content ?? []).map((block) => [block.attrs.blockId, block]));
  const b = blocks(base),
    d = blocks(draft),
    l = blocks(latest);
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
