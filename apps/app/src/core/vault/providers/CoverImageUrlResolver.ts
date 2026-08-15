/**
 * Platform contract for turning an absolute vault file path into a URL
 * the host webview can load in an `<img src>`. Implementations live in
 * vault/providers/ alongside LocalFileSystem (ARCHITECTURE_RULES.md rule 4).
 */
export interface CoverImageUrlResolver {
  toLoadableUrl(absolutePath: string): string;
}
