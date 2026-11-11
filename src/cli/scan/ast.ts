import type * as ts from 'typescript';

export type Typescript = typeof ts;

export interface SourceContext {
    typescript: Typescript;
    sourceFile: ts.SourceFile;
    /** String constants declared at module level, by name. */
    constants: ReadonlyMap<string, string>;
}

export function lineOf({ sourceFile }: SourceContext, node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function visit(typescript: Typescript, node: ts.Node, callback: (node: ts.Node) => void): void {
    callback(node);
    typescript.forEachChild(node, (child) => visit(typescript, child, callback));
}

export function calleeName({ typescript }: SourceContext, call: ts.CallExpression): string | undefined {
    return typescript.isIdentifier(call.expression) ? call.expression.text : undefined;
}
