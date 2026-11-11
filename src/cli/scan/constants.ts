import type * as ts from 'typescript';
import type { SourceContext, Typescript } from './ast';

type StringConstants = ReadonlyMap<string, string>;

function withoutWrappers(typescript: Typescript, node: ts.Node): ts.Node {
    let current = node;
    while (
        typescript.isParenthesizedExpression(current) ||
        typescript.isAsExpression(current) ||
        typescript.isSatisfiesExpression(current)
    ) {
        current = current.expression;
    }
    return current;
}

function literalString(typescript: Typescript, node: ts.Node): string | undefined {
    const unwrapped = withoutWrappers(typescript, node);
    return typescript.isStringLiteralLike(unwrapped) ? unwrapped.text : undefined;
}

/** Module-level `const NAME = 'text'` declarations, also `as const` and substitution-free templates. */
function collectStringConstants(typescript: Typescript, sourceFile: ts.SourceFile): StringConstants {
    const constants = new Map<string, string>();
    for (const statement of sourceFile.statements) {
        if (!typescript.isVariableStatement(statement)) continue;
        if (!(statement.declarationList.flags & typescript.NodeFlags.Const)) continue;
        for (const { name, initializer } of statement.declarationList.declarations) {
            const value = initializer && literalString(typescript, initializer);
            if (typescript.isIdentifier(name) && value !== undefined) constants.set(name.text, value);
        }
    }
    return constants;
}

export function createSourceContext(typescript: Typescript, path: string, text: string): SourceContext {
    const sourceFile = typescript.createSourceFile(path, text, typescript.ScriptTarget.Latest);
    return { typescript, sourceFile, constants: collectStringConstants(typescript, sourceFile) };
}

/** A string literal, or an identifier naming a string constant declared in the same file. */
export function stringValue({ typescript, constants }: SourceContext, node: ts.Node | undefined): string | undefined {
    if (node === undefined) return undefined;
    const unwrapped = withoutWrappers(typescript, node);
    if (typescript.isIdentifier(unwrapped)) return constants.get(unwrapped.text);
    return literalString(typescript, unwrapped);
}
