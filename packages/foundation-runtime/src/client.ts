import { sha256 } from './root-envelope.ts';
import {
  parseCommand,
  fromBase64,
  parseAssetLinks,
  parseAssetMeta,
} from './contracts.ts';
import type {
  Command,
  PageSnapshot,
  Receipt,
  Reply,
  ResultFor,
  EditorCheckout,
  ProtectedDraft,
  MediaSnapshot,
  MediaFile,
} from './contracts.ts';
export type Transport = (command: Command) => Promise<unknown>;
export class CoreClient {
  private readonly transport: Transport;
  readonly subscribe: (
    listener: (hint: { pageIds: string[]; sequence: number }) => void
  ) => () => void;
  constructor(transport: Transport, subscribe?: CoreClient['subscribe']) {
    this.subscribe = subscribe ?? (() => () => {});
    this.transport = transport;
  }
  async execute<C extends Command>(input: C): Promise<Reply<ResultFor<C>>> {
    const c = parseCommand(input);
    try {
      const r = (await this.transport(c)) as Reply;
      if (
        !r ||
        typeof r.ok !== 'boolean' ||
        (r.ok ? !r.value : typeof r.error?.code !== 'string')
      )
        throw Error('INVALID_REPLY');
      if (r.ok) {
        const v = r.value;
        if (
          v.pageId !== c.pageId ||
          !/^[a-f0-9]{64}$/.test(v.head) ||
          !Number.isSafeInteger(v.sequence) ||
          v.sequence < 1
        )
          throw Error('INVALID_REPLY');
        if (c.method === 'media.list') {
          const m = v as MediaSnapshot;
          const links = Object.fromEntries(
            Object.entries(m.assets).map(([id, a]) => {
              parseAssetMeta({ mime: a.mime, bytes: a.bytes });
              return [id, { hash: a.hash, name: a.name, role: a.role }];
            })
          );
          parseAssetLinks(links);
          if (c.atSequence !== undefined && m.sequence > c.atSequence)
            throw Error('INVALID_REPLY');
        } else if (c.method === 'media.read') {
          const m = v as MediaFile;
          parseAssetLinks({
            [m.attachmentId]: { hash: m.hash, name: m.name, role: m.role },
          });
          parseAssetMeta({ mime: m.mime, bytes: m.bytes });
          if (
            m.attachmentId !== c.attachmentId ||
            fromBase64(m.payload).length !== m.bytes ||
            (await sha256(fromBase64(m.payload))) !== m.hash ||
            (c.atSequence !== undefined && m.sequence > c.atSequence)
          )
            throw Error('INVALID_REPLY');
        } else if (c.method === 'page.read') {
          if (
            !('kind' in v) ||
            (c.atSequence !== undefined && v.sequence > c.atSequence)
          )
            throw Error('INVALID_REPLY');
          const page = v as PageSnapshot;
          parseCommand({
            apiVersion: 1,
            spaceId: c.spaceId,
            method: 'page.create',
            operationId: 'reply-validation',
            pageId: page.pageId,
            kind: page.kind,
            title: page.title,
            body: page.body,
            properties: page.properties,
          });
        } else if (
          c.method === 'editor.open' ||
          c.method === 'editor.recovery'
        ) {
          const e = v as EditorCheckout | ProtectedDraft;
          if (
            e.contextId !== c.contextId ||
            typeof e.payload !== 'string' ||
            !['note', 'task'].includes(e.kind)
          )
            throw Error('INVALID_REPLY');
          if ((await sha256(fromBase64(e.payload))) !== e.head)
            throw Error('INVALID_ROOT_DIGEST');
          if (
            c.method === 'editor.open' &&
            (!('grant' in e) ||
              !('epoch' in e) ||
              !/^[a-zA-Z0-9_-]{1,128}$/.test(e.grant) ||
              !/^[a-zA-Z0-9_-]{1,128}$/.test(e.epoch) ||
              !Number.isSafeInteger(e.generationFloor) ||
              e.generationFloor < 0)
          )
            throw Error('INVALID_REPLY');
          if (
            c.method === 'editor.recovery' &&
            (!('generation' in e) ||
              !Number.isSafeInteger(e.generation) ||
              e.generation < 1)
          )
            throw Error('INVALID_REPLY');
          if (c.method === 'editor.recovery' && 'pending' in e && e.pending)
            parseCommand(e.pending);
        } else if (
          !('operationId' in v) ||
          v.operationId !== c.operationId ||
          !v.changedHeads ||
          (c.method === 'editor.protect' &&
            (!v.protection ||
              v.protection.contextId !== c.contextId ||
              v.protection.generation !== c.generation ||
              v.protection.baseHead !== c.baseHead ||
              Object.keys(v.changedHeads).length !== 0)) ||
          (c.method !== 'editor.protect' &&
            v.changedHeads[c.pageId] !== v.head) ||
          Object.entries(v.changedHeads).some(
            ([k, h]) =>
              !/^[a-zA-Z0-9_-]{1,128}$/.test(k) || !/^[a-f0-9]{64}$/.test(h)
          )
        )
          throw Error('INVALID_REPLY');
      }
      return r as Reply<ResultFor<C>>;
    } catch {
      return {
        ok: false,
        error: {
          code: !('operationId' in c)
            ? 'TRANSPORT_UNAVAILABLE'
            : 'OUTCOME_UNKNOWN',
          ...('operationId' in c ? { operationId: c.operationId } : {}),
        },
      };
    }
  }
}
