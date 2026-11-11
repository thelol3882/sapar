import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import * as ts from 'typescript';

const PACKAGE_ROOT = join(import.meta.dirname, '..', '..');

function namedImports(sourceFile: ts.SourceFile): Map<string, string[]> {
    const imports = new Map<string, string[]>();
    for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const bindings = statement.importClause?.namedBindings;
        if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
        const names = bindings.elements.map((element) => (element.propertyName ?? element.name).text);
        imports.set(statement.moduleSpecifier.text, [...(imports.get(statement.moduleSpecifier.text) ?? []), ...names]);
    }
    return imports;
}

/** Module specifier to the names a source file imports from it. */
export function importedNames(source: string): Map<string, string[]> {
    return namedImports(ts.createSourceFile('generated.tsx', source, ts.ScriptTarget.Latest));
}

const isExported = (statement: ts.Statement): boolean =>
    ts.canHaveModifiers(statement) && (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

function declaredNames(statement: ts.Statement): string[] {
    if (ts.isVariableStatement(statement)) {
        return statement.declarationList.declarations.flatMap((declaration) =>
            ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
        );
    }
    const { name } = statement as ts.Statement & { name?: ts.Node };
    return name !== undefined && ts.isIdentifier(name) ? [name.text] : [];
}

/** Names exported by a module: explicit exports, declarations, and `export *` of relative modules. */
async function exportedNames(file: string): Promise<string[]> {
    const sourceFile = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest);
    const names: string[] = [];
    for (const statement of sourceFile.statements) {
        if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
            names.push(...statement.exportClause.elements.map((element) => element.name.text));
        } else if (ts.isExportDeclaration(statement) && !statement.exportClause && statement.moduleSpecifier) {
            const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
            names.push(...(await exportedNames(join(dirname(file), `${specifier}.ts`))));
        } else if (isExported(statement)) {
            names.push(...declaredNames(statement));
        }
    }
    return names;
}

/** Names exported by `src/<entry>/index.ts`. */
export async function entryExports(entry: string): Promise<Set<string>> {
    return new Set(await exportedNames(join(PACKAGE_ROOT, 'src', entry, 'index.ts')));
}

const PACKAGE_NAME = '@thelol3882/sapar';

function entryOf(specifier: string): string | undefined {
    if (specifier === PACKAGE_NAME) return 'core';
    return specifier.startsWith(`${PACKAGE_NAME}/`) ? specifier.slice(PACKAGE_NAME.length + 1) : undefined;
}

/** Names imported from the package that its entry points do not export; empty when nothing drifted. */
export async function unresolvedPackageImports(source: string): Promise<string[]> {
    const unresolved: string[] = [];
    for (const [specifier, names] of importedNames(source)) {
        const entry = entryOf(specifier);
        if (entry === undefined) continue;
        const exported = await entryExports(entry);
        unresolved.push(...names.filter((name) => !exported.has(name)).map((name) => `${specifier}: ${name}`));
    }
    return unresolved;
}
