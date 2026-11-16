import { Fault, parseCommand } from './contracts.ts';
import type { Command, PageSnapshot, Receipt, Reply } from './contracts.ts';
import type { PageEngine, Principal, Vault } from './ports.ts';
/** Sole semantic page facade in this namespace. */
class PageOperations {
  private readonly vault: Vault;
  private readonly engine: PageEngine;
  constructor(vault: Vault, engine: PageEngine) {
    this.vault = vault;
    this.engine = engine;
  }
  async execute(c: Command): Promise<PageSnapshot | Receipt> {
    if (c.method === 'page.read') {
      const p = this.vault.load(c.pageId, c.atSequence);
      if (!p) throw new Fault('NOT_FOUND');
      return {
        ...this.engine.project(p),
        pageId: p.pageId,
        kind: p.kind,
        head: p.head,
        sequence: p.sequence,
      };
    }
    const prior = this.vault.outcome(c);
    if (prior) return prior;
    if (c.method === 'page.create') {
      if (this.vault.load(c.pageId)) throw new Fault('ALREADY_EXISTS');
      return this.vault.commit(c, [
        { root: this.engine.create(c.pageId, c.kind, c), expectedHead: null },
      ]);
    }
    const previous = this.vault.load(c.pageId);
    if (!previous) throw new Fault('NOT_FOUND');
    if (previous.head !== c.expectedHead) throw new Fault('CONFLICT');
    if (Object.keys(c.patch).length === 0) throw new Fault('EMPTY_PATCH');
    const content = { ...this.engine.project(previous), ...c.patch };
    return this.vault.commit(c, [
      {
        root: this.engine.update(previous, content),
        expectedHead: c.expectedHead,
      },
    ]);
  }
}
const boundVaults = new WeakSet<Vault>();
/** Running Core composed once with one Vault; no independent business owner. */
export class SpaceService {
  readonly spaceId: string;
  private readonly operations: PageOperations;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(vault: Vault, engine: PageEngine) {
    if (boundVaults.has(vault)) throw new Fault('SERVICE_ALREADY_BOUND');
    boundVaults.add(vault);
    this.spaceId = vault.spaceId;
    this.operations = new PageOperations(vault, engine);
  }
  execute(value: unknown, principal: Principal): Promise<Reply> {
    // Snapshot at admission; callers cannot mutate queued commands or permissions.
    let c: Command;
    try {
      c = parseCommand(value);
      if (
        c.spaceId !== this.spaceId ||
        principal.spaceId !== this.spaceId ||
        !principal.scopes.includes('read') ||
        (c.method !== 'page.read' && !principal.scopes.includes('write'))
      )
        throw new Fault('FORBIDDEN');
    } catch (e) {
      return Promise.resolve({
        ok: false,
        error: { code: e instanceof Fault ? e.code : 'INVALID_REQUEST' },
      });
    }
    const run = async (): Promise<Reply> => {
      try {
        return { ok: true, value: await this.operations.execute(c) };
      } catch (e) {
        const code = e instanceof Fault ? e.code : 'INTERNAL_ERROR';
        return {
          ok: false,
          error: {
            code,
            ...('operationId' in c ? { operationId: c.operationId } : {}),
          },
        };
      }
    };
    const result = this.tail.then(run, run);
    this.tail = result;
    return result;
  }
}
