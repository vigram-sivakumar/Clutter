import { parseCommand } from './contracts.ts';
import type { Command, PageSnapshot, Receipt, Reply } from './contracts.ts';
export type Transport = (command: Command) => Promise<unknown>;
export class CoreClient {
  private readonly transport: Transport;
  constructor(transport: Transport) {
    this.transport = transport;
  }
  async execute<C extends Command>(
    input: C
  ): Promise<
    Reply<C extends { method: 'page.read' } ? PageSnapshot : Receipt>
  > {
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
        if (c.method === 'page.read') {
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
          !('operationId' in v) ||
          v.operationId !== c.operationId ||
          !v.changedHeads ||
          v.changedHeads[c.pageId] !== v.head ||
          Object.entries(v.changedHeads).some(
            ([k, h]) =>
              !/^[a-zA-Z0-9_-]{1,128}$/.test(k) || !/^[a-f0-9]{64}$/.test(h)
          )
        )
          throw Error('INVALID_REPLY');
      }
      return r as Reply<
        C extends { method: 'page.read' } ? PageSnapshot : Receipt
      >;
    } catch {
      return {
        ok: false,
        error: {
          code:
            c.method === 'page.read'
              ? 'TRANSPORT_UNAVAILABLE'
              : 'OUTCOME_UNKNOWN',
          ...('operationId' in c ? { operationId: c.operationId } : {}),
        },
      };
    }
  }
}
