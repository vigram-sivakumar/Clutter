import type { CoreClient } from '../client.ts';
import { Fault } from '../contracts.ts';
import type {
  Command,
  PageContent,
  PageSnapshot,
  Reply,
  Receipt,
} from '../contracts.ts';
type Update = Extract<Command, { method: 'page.update' }>;
/** View-independent draft lifetime. Actual EditorView/history/protection is I1b. */
export class DesktopSession {
  private readonly client: CoreClient;
  private readonly spaceId: string;
  private readonly nextId: () => string;
  private base: PageSnapshot;
  private draft: PageContent;
  private generation = 0;
  private savedGeneration = 0;
  private pending?: { command: Update; generation: number };
  private inFlight = false;
  constructor(
    client: CoreClient,
    spaceId: string,
    page: PageSnapshot,
    nextId: () => string
  ) {
    this.client = client;
    this.spaceId = spaceId;
    this.base = structuredClone(page);
    this.draft = structuredClone(page);
    this.nextId = nextId;
  }
  get content(): PageContent {
    return structuredClone(this.draft);
  }
  get dirty(): boolean {
    return this.generation !== this.savedGeneration;
  }
  get canClose(): boolean {
    return !this.dirty && !this.pending && !this.inFlight;
  }
  edit(patch: Partial<PageContent>): void {
    this.draft = structuredClone({ ...this.draft, ...patch });
    this.generation++;
  }
  async save(): Promise<Reply<Receipt>> {
    if (this.inFlight) throw new Fault('SAVE_IN_PROGRESS');
    if (!this.dirty && !this.pending) throw new Fault('NO_CHANGES');
    this.pending ??= {
      command: {
        apiVersion: 1,
        method: 'page.update',
        spaceId: this.spaceId,
        pageId: this.base.pageId,
        operationId: this.nextId(),
        expectedHead: this.base.head,
        patch: structuredClone({
          title: this.draft.title,
          body: this.draft.body,
          properties: this.draft.properties,
        }),
      },
      generation: this.generation,
    };
    const p = this.pending;
    this.inFlight = true;
    try {
      const r = await this.client.execute(p.command);
      if (!r.ok) {
        if (r.error.code !== 'OUTCOME_UNKNOWN') this.pending = undefined;
        return r;
      }
      const read = await this.client.execute({
        apiVersion: 1,
        method: 'page.read',
        spaceId: this.spaceId,
        pageId: this.base.pageId,
        atSequence: r.value.sequence,
      });
      if (
        !read.ok ||
        read.value.head !== r.value.head ||
        read.value.sequence !== r.value.sequence
      )
        return {
          ok: false,
          error: {
            code: 'OUTCOME_UNKNOWN',
            operationId: p.command.operationId,
          },
        };
      this.base = read.value;
      this.savedGeneration = p.generation;
      if (this.generation === p.generation)
        this.draft = structuredClone(read.value);
      this.pending = undefined;
      return r;
    } finally {
      this.inFlight = false;
    }
  }
}
