import type * as ts from 'typescript';
import { calleeName, lineOf, visit } from './ast';
import type { SourceContext } from './ast';
import { stringValue } from './constants';
import type { Located } from './model';

const ANCHOR_HOOK = /^use\w*Anchor$/;
const ANCHOR_ATTRIBUTE = 'data-sapar';

function isLogicalOperator({ typescript }: SourceContext, kind: ts.SyntaxKind): boolean {
    const { AmpersandAmpersandToken, BarBarToken, QuestionQuestionToken } = typescript.SyntaxKind;
    return kind === AmpersandAmpersandToken || kind === BarBarToken || kind === QuestionQuestionToken;
}

/** The literals a JSX value can evaluate to: `{'a.b'}`, `{ready ? 'a.b' : undefined}`, `{flag && 'a.b'}`. */
function literalsIn(context: SourceContext, node: ts.Node | undefined): string[] {
    const { typescript } = context;
    const literal = stringValue(context, node);
    if (literal !== undefined) return [literal];
    if (node === undefined) return [];
    if (typescript.isParenthesizedExpression(node)) return literalsIn(context, node.expression);
    if (typescript.isConditionalExpression(node)) {
        return [...literalsIn(context, node.whenTrue), ...literalsIn(context, node.whenFalse)];
    }
    if (typescript.isBinaryExpression(node) && isLogicalOperator(context, node.operatorToken.kind)) {
        return [...literalsIn(context, node.left), ...literalsIn(context, node.right)];
    }
    return [];
}

function keysDeclaredBy(context: SourceContext, node: ts.Node): string[] {
    const { typescript } = context;
    if (typescript.isCallExpression(node) && ANCHOR_HOOK.test(calleeName(context, node) ?? '')) {
        return literalsIn(context, node.arguments[0]);
    }
    if (typescript.isJsxAttribute(node) && typescript.isIdentifier(node.name) && node.name.text === ANCHOR_ATTRIBUTE) {
        const { initializer } = node;
        return literalsIn(context, initializer && typescript.isJsxExpression(initializer) ? initializer.expression : initializer);
    }
    return [];
}

/** Anchor declarations: `useTourAnchor('key')`-style hooks and `data-sapar` attributes. */
export function findAnchorUses(context: SourceContext): Located<string>[] {
    const uses: Located<string>[] = [];
    visit(context.typescript, context.sourceFile, (node) => {
        keysDeclaredBy(context, node).forEach((key) => uses.push({ value: key, line: lineOf(context, node) }));
    });
    return uses;
}
