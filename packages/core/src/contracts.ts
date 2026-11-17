/** The I1a catalogue is the single source for request types and runtime schemas. */
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
type Schema<T> = { json: Record<string, unknown>; parse(value: unknown): T };
type Infer<S> = S extends Schema<infer T> ? T : never;
export class Fault extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
const bad = (): never => {
  throw new Fault('INVALID_REQUEST');
};
const scalar = <T>(
  json: Record<string, unknown>,
  check: (x: unknown) => boolean
): Schema<T> => ({ json, parse: (x) => (check(x) ? (x as T) : bad()) });
const literal = <T extends string | number>(value: T) =>
  scalar<T>({ const: value }, (x) => x === value);
const text = (max: number, pattern?: string) =>
  scalar<string>(
    { type: 'string', maxLength: max, ...(pattern ? { pattern } : {}) },
    (x) =>
      typeof x === 'string' &&
      x.length <= max &&
      (!pattern || new RegExp(pattern).test(x))
  );
const id = text(128, '^[a-zA-Z0-9_-]{1,128}$');
const sequence = scalar<number>(
  { type: 'integer', minimum: 1 },
  (x) => Number.isSafeInteger(x) && (x as number) > 0
);
const optional = <T>(s: Schema<T>): Schema<T | undefined> => ({
  json: s.json,
  parse: (x) => (x === undefined ? undefined : s.parse(x)),
});
type Fields<S extends Record<string, Schema<unknown>>> = {
  [K in keyof S as undefined extends Infer<S[K]> ? never : K]: Infer<S[K]>;
} & {
  [K in keyof S as undefined extends Infer<S[K]> ? K : never]?: Exclude<
    Infer<S[K]>,
    undefined
  >;
};
const object = <S extends Record<string, Schema<unknown>>>(
  fields: S
): Schema<Fields<S>> => ({
  json: {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(fields).map(([k, s]) => [k, s.json])
    ),
    required: Object.entries(fields)
      .filter(([, s]) => {
        try {
          return s.parse(undefined) !== undefined;
        } catch {
          return true;
        }
      })
      .map(([k]) => k),
    additionalProperties: false,
  },
  parse(x) {
    if (
      !x ||
      typeof x !== 'object' ||
      Array.isArray(x) ||
      Object.keys(x).some((k) => !Object.hasOwn(fields, k))
    )
      return bad();
    const out = Object.create(null);
    for (const [k, s] of Object.entries(fields)) {
      const v = s.parse((x as Record<string, unknown>)[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  },
});
const union = <S extends readonly Schema<unknown>[]>(
  ...options: S
): Schema<Infer<S[number]>> => ({
  json: { oneOf: options.map((s) => s.json) },
  parse(x) {
    for (const s of options) {
      try {
        return s.parse(x) as Infer<S[number]>;
      } catch {}
    }
    return bad();
  },
});
function jsonValue(x: unknown, depth = 0, count = { n: 0 }): Json {
  if (depth > 32 || ++count.n > 50000) return bad();
  if (
    x === null ||
    typeof x === 'boolean' ||
    (typeof x === 'number' && Number.isFinite(x))
  )
    return x;
  if (typeof x === 'string') return x.length <= 200000 ? x : bad();
  if (Array.isArray(x)) return x.map((v) => jsonValue(v, depth + 1, count));
  if (
    x &&
    typeof x === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(x))
  ) {
    const out = Object.create(null);
    for (const [k, v] of Object.entries(x)) {
      if (['__proto__', 'constructor', 'prototype'].includes(k)) return bad();
      out[k] = jsonValue(v, depth + 1, count);
    }
    return out;
  }
  return bad();
}
const json: Schema<Json> = { json: {}, parse: (x) => jsonValue(x) };
const property = union(
  object({ type: literal('text'), value: union(text(10000), literalNull()) }),
  object({
    type: literal('date'),
    value: union(text(10, '^\\d{4}-\\d{2}-\\d{2}$'), literalNull()),
  }),
  object({
    type: literal('number'),
    value: union(
      scalar<number>(
        { type: 'number' },
        (x) => typeof x === 'number' && Number.isFinite(x)
      ),
      literalNull()
    ),
  }),
  object({
    type: literal('checkbox'),
    value: union(
      scalar<boolean>({ type: 'boolean' }, (x) => typeof x === 'boolean'),
      literalNull()
    ),
  })
);
function literalNull(): Schema<null> {
  return scalar<null>({ type: 'null' }, (x) => x === null);
}
const properties: Schema<Record<string, Infer<typeof property>>> = {
  json: {
    type: 'object',
    maxProperties: 64,
    propertyNames: { minLength: 1, maxLength: 128 },
    additionalProperties: property.json,
  },
  parse(x) {
    if (
      !x ||
      typeof x !== 'object' ||
      Array.isArray(x) ||
      Object.keys(x).length > 64
    )
      return bad();
    const out = Object.create(null);
    for (const [k, v] of Object.entries(x)) {
      if (
        !k ||
        k.length > 128 ||
        ['__proto__', 'constructor', 'prototype'].includes(k)
      )
        return bad();
      out[k] = property.parse(v);
    }
    return out;
  },
};
const content = object({
  format: literal('clutter.page-json'),
  schemaVersion: literal(2),
  value: json,
});
const base = { apiVersion: literal(1), spaceId: id };
const patch = object({
  content: optional(content),
  properties: optional(properties),
});
const head = text(64, '^[a-f0-9]{64}$');
const binary = text(
  700000,
  '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
);
export const MAX_ASSET_BYTES = 256 * 1024;
const mime = union(literal('image/png'), literal('application/pdf'));
const role = union(literal('body'), literal('cover'));
const assetName = text(256, '^.+$');
const assetBytes = scalar<number>(
  { type: 'integer', minimum: 1, maximum: MAX_ASSET_BYTES },
  (x) =>
    Number.isSafeInteger(x) &&
    (x as number) > 0 &&
    (x as number) <= MAX_ASSET_BYTES
);
const assetLink = object({ hash: head, name: assetName, role });
const assetMeta = object({ mime, bytes: assetBytes });
export type AssetLink = Infer<typeof assetLink>;
export type AssetLinks = Record<string, AssetLink>;
export type AssetMeta = Infer<typeof assetMeta>;
export type AssetDescriptor = AssetLink & AssetMeta;
export function parseAssetLinks(value: unknown): AssetLinks {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length > 100
  )
    throw new Fault('INVALID_MEDIA_FIELDS');
  const links = Object.create(null);
  for (const [key, v] of Object.entries(value)) {
    id.parse(key);
    links[key] = assetLink.parse(v);
  }
  return links;
}
export const parseAssetMeta = (value: unknown): AssetMeta =>
  assetMeta.parse(value);
const editorBase = { ...base, pageId: id, contextId: id };
const editorApply = object({
  ...editorBase,
  method: literal('editor.apply'),
  operationId: id,
  grant: id,
  baseHead: head,
  update: binary,
  generation: sequence,
});
export const catalogue = {
  'page.list': object({
    ...base,
    method: literal('page.list'),
    afterId: optional(id),
    limit: optional(
      scalar<number>(
        { type: 'integer', minimum: 1, maximum: 100 },
        (x) =>
          Number.isSafeInteger(x) && (x as number) >= 1 && (x as number) <= 100
      )
    ),
  }),
  'media.import': object({
    ...base,
    pageId: id,
    method: literal('media.import'),
    operationId: id,
    expectedHead: head,
    attachmentId: id,
    name: assetName,
    role,
    mime,
    payload: binary,
  }),
  'media.replace': object({
    ...base,
    pageId: id,
    method: literal('media.replace'),
    operationId: id,
    expectedHead: head,
    attachmentId: id,
    name: assetName,
    mime,
    payload: binary,
  }),
  'media.remove': object({
    ...base,
    pageId: id,
    method: literal('media.remove'),
    operationId: id,
    expectedHead: head,
    attachmentId: id,
  }),
  'media.list': object({
    ...base,
    pageId: id,
    method: literal('media.list'),
    atSequence: optional(sequence),
  }),
  'media.read': object({
    ...base,
    pageId: id,
    method: literal('media.read'),
    attachmentId: id,
    atSequence: optional(sequence),
  }),
  'editor.open': object({ ...editorBase, method: literal('editor.open') }),
  'editor.apply': editorApply,
  'editor.protect': object({
    ...editorBase,
    method: literal('editor.protect'),
    operationId: id,
    grant: id,
    baseHead: head,
    update: binary,
    generation: sequence,
    pending: optional(editorApply),
  }),
  'editor.recovery': object({
    ...editorBase,
    method: literal('editor.recovery'),
  }),
  'page.create': object({
    ...base,
    method: literal('page.create'),
    operationId: id,
    pageId: id,
    kind: union(literal('note'), literal('task')),
    content,
    properties,
  }),
  'page.read': object({
    ...base,
    method: literal('page.read'),
    pageId: id,
    atSequence: optional(sequence),
  }),
  'page.update': object({
    ...base,
    method: literal('page.update'),
    operationId: id,
    pageId: id,
    expectedHead: text(64, '^[a-f0-9]{64}$'),
    patch,
  }),
} as const;
export type Command = Infer<(typeof catalogue)[keyof typeof catalogue]>;
export type Mutation = Extract<Command, { operationId: string }>;
export type EditorApply = Extract<Command, { method: 'editor.apply' }>;
export type EditorProtect = Extract<Command, { method: 'editor.protect' }>;
export type PageContent = Pick<
  Extract<Command, { method: 'page.create' }>,
  'content' | 'properties'
>;
export type PageKind = Extract<Command, { method: 'page.create' }>['kind'];
export type PageSnapshot = PageContent & {
  title: string;
  pageId: string;
  kind: PageKind;
  head: string;
  sequence: number;
};
export type PageSummary = Pick<
  PageSnapshot,
  'pageId' | 'kind' | 'title' | 'head' | 'sequence'
>;
export type PageList = { pages: PageSummary[]; next?: string };
export function parsePageList(
  value: unknown,
  limit = 50,
  afterId = ''
): PageList {
  const x = value as PageList;
  if (
    !x ||
    typeof x !== 'object' ||
    Object.keys(x).some((k) => !['pages', 'next'].includes(k)) ||
    !Array.isArray(x.pages) ||
    x.pages.length > limit
  )
    return bad();
  let previous = afterId;
  for (const page of x.pages) {
    object({
      pageId: id,
      kind: union(literal('note'), literal('task')),
      title: text(10000),
      head,
      sequence,
    }).parse(page);
    if (page.pageId <= previous) return bad();
    previous = page.pageId;
  }
  if (x.next !== undefined && (x.pages.length !== limit || x.next !== previous))
    return bad();
  return x;
}
export type EditorCheckout = {
  pageId: string;
  kind: PageKind;
  head: string;
  sequence: number;
  contextId: string;
  grant: string;
  epoch: string;
  payload: string;
  generationFloor: number;
};
export type ProtectedDraft = {
  pageId: string;
  kind: PageKind;
  head: string;
  sequence: number;
  contextId: string;
  generation: number;
  baseHead: string;
  payload: string;
  pending?: EditorApply;
};
export type MediaSnapshot = {
  pageId: string;
  head: string;
  sequence: number;
  assets: Record<string, AssetDescriptor>;
};
export type MediaFile = AssetDescriptor & {
  pageId: string;
  head: string;
  sequence: number;
  attachmentId: string;
  payload: string;
};
export type ResultFor<C extends Command> = C extends { method: 'page.list' }
  ? PageList
  : C extends { method: 'media.list' }
    ? MediaSnapshot
    : C extends { method: 'media.read' }
      ? MediaFile
      : C extends { method: 'page.read' }
        ? PageSnapshot
        : C extends { method: 'editor.open' }
          ? EditorCheckout
          : C extends { method: 'editor.recovery' }
            ? ProtectedDraft
            : Receipt;
export type Receipt = {
  protection?: { contextId: string; generation: number; baseHead: string };
  changedHeads: Record<string, string>;
  operationId: string;
  pageId: string;
  head: string;
  sequence: number;
};
export type Reply<
  T =
    | PageList
    | PageSnapshot
    | Receipt
    | EditorCheckout
    | ProtectedDraft
    | MediaSnapshot
    | MediaFile,
> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; operationId?: string } };
export function parseCommand(value: unknown): Command {
  const x = value as Record<string, unknown>;
  if (!x || typeof x.method !== 'string' || !Object.hasOwn(catalogue, x.method))
    return bad();
  return catalogue[x.method as keyof typeof catalogue].parse(value);
}
export const commandSchema = {
  type: 'object',
  oneOf: Object.values(catalogue).map((s) => s.json),
};
export function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return (
    '{' +
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => JSON.stringify(k) + ':' + stable(v))
      .join(',') +
    '}'
  );
}

/** Binary codec shared by transport/engine adapters; no Buffer or OS import. */
export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function fromBase64(value: string): Uint8Array {
  binary.parse(value);
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  if (toBase64(bytes) !== value) throw new Fault('INVALID_BINARY');
  return bytes;
}
