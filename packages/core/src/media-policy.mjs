import { MAX_ASSET_BYTES as MAX_BYTES } from './contracts.ts';
export const id = (s) =>
  typeof s === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(s);
export const exact = (o, keys) => {
  if (
    !o ||
    typeof o !== 'object' ||
    Array.isArray(o) ||
    Object.keys(o).sort().join() !== [...keys].sort().join()
  )
    throw Error('INVALID_MEDIA_FIELDS');
};
export const pageExists = (s, pageId) =>
  Object.hasOwn(s.notes, pageId) || Object.hasOwn(s.tasks, pageId);
export function validateAssociations(s) {
  const used = new Set(),
    covers = new Set();
  if (
    Object.keys(s.assetLinks).length > 100 ||
    Object.keys(s.assets).length > 100
  )
    throw Error('MEDIA_COUNT_LIMIT');
  for (const [digest, meta] of Object.entries(s.assets)) {
    exact(meta, ['bytes', 'mime']);
    if (
      !/^[a-f0-9]{64}$/.test(digest) ||
      !Number.isSafeInteger(meta.bytes) ||
      meta.bytes < 1 ||
      meta.bytes > MAX_BYTES ||
      !['image/png', 'application/pdf'].includes(meta.mime)
    )
      throw Error('INVALID_ASSET_METADATA');
  }
  for (const [attachmentId, link] of Object.entries(s.assetLinks)) {
    exact(link, ['pageId', 'hash', 'name', 'role']);
    if (
      !id(attachmentId) ||
      !id(link.pageId) ||
      typeof link.hash !== 'string' ||
      !pageExists(s, link.pageId) ||
      typeof link.name !== 'string' ||
      !link.name ||
      link.name.length > 256 ||
      !['body', 'cover'].includes(link.role) ||
      !Object.hasOwn(s.assets, link.hash)
    )
      throw Error('INVALID_ASSET_LINK');
    if (link.role === 'cover') {
      if (covers.has(link.pageId) || s.assets[link.hash].mime !== 'image/png')
        throw Error('INVALID_COVER');
      covers.add(link.pageId);
    }
    used.add(link.hash);
  }
  for (const digest of Object.keys(s.assets))
    if (!used.has(digest)) throw Error('INVALID_ASSET_METADATA');
  return s;
}
export function admitImport(c, { hasPage, hasAttachment, pageLinks }) {
  if (!hasPage(c.pageId)) throw Error('PAGE_NOT_FOUND');
  if (hasAttachment(c.attachmentId)) throw Error('DUPLICATE_ATTACHMENT');
  if (c.role === 'cover' && pageLinks.some((l) => l.role === 'cover'))
    throw Error('COVER_EXISTS');
}
