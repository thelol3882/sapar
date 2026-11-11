const TEMPLATE_IMPORT = /(from\s+)(['"])\.\.\/\.\.\/src\/(\w+)\2/g;
const AFTER_COPYING_NOTE = /^\/\/ After copying, change these imports.*\r?\n/m;

/**
 * With the package name `core` is the root export and the rest are subpaths;
 * with a copied folder alias every entry is a folder, core included.
 */
export function importSpecifier(entry: string, importBase: string, packageName: string): string {
    if (importBase !== packageName) return `${importBase}/${entry}`;
    return entry === 'core' ? packageName : `${packageName}/${entry}`;
}

export function rewriteTemplateImports(source: string, importBase: string, packageName: string): string {
    return source
        .replace(AFTER_COPYING_NOTE, '')
        .replace(
            TEMPLATE_IMPORT,
            (_match: string, from: string, quote: string, entry: string) =>
                `${from}${quote}${importSpecifier(entry, importBase, packageName)}${quote}`,
        );
}
