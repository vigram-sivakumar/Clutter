import type { Json } from './contracts.ts';
type Fields = {
  get: (key: string) => unknown;
  entries: () => IterableIterator<[string, unknown]>;
};
type Document = { getMap: (name: string) => Fields };
/** Read-only display projection. The structured title node is the sole editable fact. */
export function plainTitle(content: Json): string {
  const doc = content as {
    content?: {
      type?: string;
      content?: {
        type?: string;
        text?: string;
        attrs?: { label?: string; value?: string };
      }[];
    }[];
  };
  return (doc.content?.[0]?.content ?? [])
    .map((n) =>
      n.type === 'text'
        ? (n.text ?? '')
        : n.type === 'note_reference'
          ? '@' + (n.attrs?.label ?? '')
          : n.type === 'date'
            ? (n.attrs?.value ?? '')
            : ''
    )
    .join('');
}
export function pageFields(
  doc: Document,
  readContent: (fragment: unknown) => Json
) {
  const record = doc.getMap('page'),
    content = readContent(record.get('content'));
  return {
    title: plainTitle(content),
    content,
    properties: Object.fromEntries(
      (record.get('properties') as Fields).entries()
    ),
    links: Object.fromEntries(doc.getMap('links').entries()),
  };
}
