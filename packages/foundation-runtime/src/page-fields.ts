import type { Json } from './contracts.ts';
type Fields = {
  get: (key: string) => unknown;
  entries: () => IterableIterator<[string, unknown]>;
};
type Document = { getMap: (name: string) => Fields };
/** Read-only projection shared by engine and browser codec; never a save path. */
export function pageFields(
  doc: Document,
  readBody: (fragment: unknown) => Json
) {
  const record = doc.getMap('page');
  return {
    title: record.get('title'),
    body: readBody(record.get('body')),
    properties: Object.fromEntries(
      (record.get('properties') as Fields).entries()
    ),
    links: Object.fromEntries(doc.getMap('links').entries()),
  };
}
