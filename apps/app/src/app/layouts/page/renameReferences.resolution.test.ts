import { describe, expect, it } from 'vitest';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { scanEmbed } from '@core/vault/ingest/grammar/embedScanner';
import { scanWikiLink } from '@core/vault/ingest/grammar/wikiLinkScanner';
import { rewriteReferenceTargets } from '@core/application/page/pageReferenceRewrite';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { PageOperations } from '@core/application/page/PageOperations';

import { createPageEmbedResolver } from './resolvePageEmbed';
import { createWikiLinkResolver } from './resolveWikiLink';

const ROOT = '/vault';

function page(id: string, rel: string, body: string) {
  const parsed = new FrontmatterParser().parse(`---\nid: ${id}\n---\n${body}`);
  return new PageBuilder().build({
    parentId: null,
    page: {
      path: `${ROOT}/${rel}`,
      directoryPath: ROOT,
      frontmatter: parsed.frontmatter,
      frontmatterAnalysis: parsed.frontmatterAnalysis,
      content: parsed.body,
      analysis: parsed.analysis,
    },
  });
}

/**
 * The editor's own resolvers (the ones the live WikiLink / note-embed widgets call), run on the exact path
 * text `scanWikiLink` / `scanEmbed` hand them, before and after the rename rewrite.
 */
describe('references rewritten by a note rename resolve in the editor’s resolvers', () => {
  const body = '# Decisions\n\nWe decided.\n^decision-1\n';
  const embeds = ['![[Meeting Notes]]', '![[Meeting Notes#Decisions]]', '![[Meeting Notes|Discussion]]'];
  const links = ['[[Meeting Notes]]', '[[Meeting Notes|Discussion]]', '[[Meeting Notes#Decisions]]', '[[Meeting Notes#^decision-1]]'];

  function resolveAll(vault: Vault, texts: readonly string[]) {
    const wiki = createWikiLinkResolver(vault, {} as PageOperations, {} as FolderOperations);
    const embed = createPageEmbedResolver(vault, { getPage: () => undefined } as unknown as EffectivePageState);

    return texts.map((text) => {
      if (text.startsWith('!')) {
        const match = scanEmbed(text, 0)!;
        const resolution = embed(match.path);
        return { text, status: resolution.status, pageId: 'pageId' in resolution ? resolution.pageId : undefined };
      }

      const match = scanWikiLink(text, 0)!;
      const resolution = wiki(match.path, match.alias);
      return { text, status: resolution.status, pageId: resolution.status === 'resolved' ? resolution.pageId : undefined };
    });
  }

  // Parity, not absolute resolution: today the editor's WikiLink resolver is handed the whole `path` including any
  // `#heading` / `#^block` tail (see renderWikiLink), so `[[Note#Heading]]` is "unresolved" in the editor before
  // AND after a rename, while the index resolves it. That predates the rename rewrite and is deliberately not
  // changed here; this test pins that the rewrite neither fixes nor worsens any form.
  it.each([...links, ...embeds])('%s keeps the resolution status it had, now at the new name', (original) => {
    const vault = new Vault(ROOT, [page('t', 'Meeting Notes.md', body)], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
    const [before] = resolveAll(vault, [original]);

    // The rename: same page id, new path; then the rewrite of the text that pointed at it.
    vault.updatePagePath('t', `${ROOT}/Team Meeting.md`, null);
    const rewritten = rewriteReferenceTargets(original, 'Meeting Notes', 'Team Meeting');
    const [after] = resolveAll(vault, [rewritten]);

    expect(rewritten).toBe(original.replace('Meeting Notes', 'Team Meeting'));
    expect(after!.status).toBe(before!.status);
    expect(after!.pageId).toBe(before!.pageId);
  });

  it('the plain link and embed, and the embed with a heading, resolve to the renamed note', () => {
    const vault = new Vault(ROOT, [page('t', 'Team Meeting.md', body)], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());

    const results = resolveAll(vault, ['[[Team Meeting]]', '![[Team Meeting]]', '![[Team Meeting#Decisions]]', '![[Team Meeting|Discussion]]']);

    expect(results.map((r) => [r.status, r.pageId])).toEqual([
      ['resolved', 't'],
      ['resolved', 't'],
      ['resolved', 't'],
      ['resolved', 't'],
    ]);
  });
});
