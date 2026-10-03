import type { ImportedRemoteAsset } from '../../vault/asset/importRemoteAsset';
import type { RewriteSummary } from './rewriteRemoteAssetReferences';

/** What "Save to vault" did for one remote image — enough for the UI to say exactly what happened. */
export interface SaveToVaultResult extends RewriteSummary {
  /** Vault-relative reference of the saved copy (`Assets/<file>`). */
  readonly reference: string;
  /** Absolute path of the saved copy. */
  readonly assetPath: string;
  /** True when this URL had been saved before, so the existing file was reused (nothing downloaded). */
  readonly reusedExisting: boolean;
}

/**
 * Save to vault, as a pipeline: download+write -> make the Vault know the new
 * file -> rewrite references. Each step is injected so the ordering guarantees
 * are testable: nothing is rewritten unless the file was saved AND the Vault
 * has registered it, and a failure in either earlier step rejects without
 * touching a single note or folder.
 */
export async function saveRemoteImage(steps: {
  readonly save: () => Promise<ImportedRemoteAsset>;
  /** Resolves once the Vault tracks the file at this absolute path, or throws. */
  readonly register: (absolutePath: string) => Promise<void>;
  readonly rewrite: (imported: ImportedRemoteAsset) => Promise<RewriteSummary>;
}): Promise<SaveToVaultResult> {
  const imported = await steps.save();

  await steps.register(imported.absolutePath);

  const summary = await steps.rewrite(imported);

  return {
    ...summary,
    reference: imported.reference,
    assetPath: imported.absolutePath,
    reusedExisting: imported.reused,
  };
}
