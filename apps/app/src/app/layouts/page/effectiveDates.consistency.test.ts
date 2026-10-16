import { describe, expect, it } from 'vitest';
import { buildPageProperties } from './buildPageProperties';
import { toNoteValues } from '@features/collection/page/toCollectionPageModel';
import { EffectivePageState } from '@core/application/page/EffectivePageState';
import { Vault } from '@core/vault/models/Vault';
import { VaultQuery } from '@core/vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { Workspace } from '@core/workspace/Workspace';
import type { Page } from '@core/vault/models/Page';
import type { PageFileTimes } from '@core/vault/models/effectivePageDates';

const ROOT = '/vault';
const analysis = { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] };

function page(id: string, fileTimes?: PageFileTimes): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path: `${ROOT}/${id}.md`,
      directoryPath: ROOT,
      // The keys declare the rows (ADR-058): `created: true` and `modified: true` are entries of the file.
      frontmatter: { id, created: true, modified: true, entryOrder: ['id', 'created', 'modified'] },
      frontmatterAnalysis: { aliases: [] },
      content: '',
      analysis,
      ...(fileTimes && { fileTimes }),
    },
  });
}

function surfaces(note: Page) {
  const vault = new Vault(ROOT, [note], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const state = new EffectivePageState(
    vault,
    new VaultQuery(vault),
    { getDraft: () => undefined, getSession: () => undefined } as never,
    new Workspace()
  );
  const effective = state.getPage(note.id)!;
  const rows = buildPageProperties(note, { isEffectivelyArchived: false });
  const value = (name: string) => rows.find((row) => row.name === name)?.value;
  const collection = toNoteValues(note.name, effective);

  return {
    properties: { created: value('Created'), lastEdited: value('Last edited') },
    state: { created: effective.createdAt, updated: effective.updatedAt },
    collection: { created: collection.created, updated: collection.updated },
  };
}

describe('Created / Last edited are the same everywhere (ADR-057, ADR-058)', () => {
  it('the file times are the value on every surface, and the collection sorts on those values', () => {
    const fs = { createdAt: '2026-03-01T10:00:00.000Z', modifiedAt: '2026-03-05T12:00:00.000Z' };
    const seen = surfaces(page('a', fs));

    expect(seen.properties).toEqual({ created: fs.createdAt, lastEdited: fs.modifiedAt });
    expect(seen.state).toEqual({ created: fs.createdAt, updated: fs.modifiedAt });
    expect(seen.collection).toEqual({ created: fs.createdAt, updated: fs.modifiedAt });
  });

  it('is empty everywhere when the file system gave no time — the rows are declared, their values are null', () => {
    const seen = surfaces(page('b', { createdAt: null, modifiedAt: null }));

    expect(seen.properties).toEqual({ created: null, lastEdited: null });
    expect(seen.state).toEqual({ created: null, updated: null });
    expect(seen.collection).toEqual({ created: undefined, updated: undefined });
  });

  it('is empty everywhere for a page that was never stat\'d', () => {
    const seen = surfaces(page('c'));

    expect(seen.properties).toEqual({ created: null, lastEdited: null });
    expect(seen.state).toEqual({ created: null, updated: null });
  });
});
