import type * as ts from 'typescript';
import { calleeName, lineOf, visit } from './ast';
import type { SourceContext } from './ast';
import { stringValue } from './constants';
import type { DefinitionFindings, FoundStep, FoundTour, Located } from './model';

const STATIC_VALUE_HINT = ' (use a string literal or a const declared in this file).';

interface Collector extends SourceContext {
    unverifiable: Located<string>[];
}

function noteUnverifiable(collector: Collector, node: ts.Node, explanation: string): void {
    collector.unverifiable.push({ value: explanation, line: lineOf(collector, node) });
}

function propertyValue(collector: Collector, object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
    const { typescript } = collector;
    for (const property of object.properties) {
        if (!typescript.isPropertyAssignment(property) && !typescript.isShorthandPropertyAssignment(property)) continue;
        const propertyName = property.name;
        const isMatch =
            (typescript.isIdentifier(propertyName) || typescript.isStringLiteralLike(propertyName)) &&
            propertyName.text === name;
        if (!isMatch) continue;
        return typescript.isPropertyAssignment(property) ? property.initializer : property.name;
    }
    return undefined;
}

function readString(collector: Collector, node: ts.Expression | undefined, description: string): Located<string> | undefined {
    if (node === undefined) return undefined;
    const value = stringValue(collector, node);
    if (value === undefined) {
        noteUnverifiable(collector, node, `The ${description} is not a string literal, so it was not verified${STATIC_VALUE_HINT}`);
        return undefined;
    }
    return { value, line: lineOf(collector, node) };
}

function readStringProperty(
    collector: Collector,
    object: ts.ObjectLiteralExpression,
    name: string,
    description: string,
): Located<string> | undefined {
    return readString(collector, propertyValue(collector, object, name), description);
}

function readArray(collector: Collector, node: ts.Expression | undefined, description: string): readonly ts.Expression[] {
    if (node === undefined) return [];
    if (!collector.typescript.isArrayLiteralExpression(node)) {
        noteUnverifiable(collector, node, `The ${description} is not an array literal, so it was not verified.`);
        return [];
    }
    return node.elements;
}

function readStrings(collector: Collector, node: ts.Expression, description: string): string[] {
    return readArray(collector, node, description).flatMap(
        (element) => readString(collector, element, `${description} entry`)?.value ?? [],
    );
}

function readStep(collector: Collector, node: ts.Expression): FoundStep | undefined {
    if (!collector.typescript.isObjectLiteralExpression(node)) {
        noteUnverifiable(collector, node, 'A step is not an object literal, so it was not verified.');
        return undefined;
    }
    return {
        key: readStringProperty(collector, node, 'key', 'step key'),
        anchor: readStringProperty(collector, node, 'anchor', 'step anchor'),
        route: readStringProperty(collector, node, 'route', 'step route'),
    };
}

function readTriggerRoute(collector: Collector, trigger: ts.Expression | undefined): Located<string> | undefined {
    if (trigger === undefined || !collector.typescript.isObjectLiteralExpression(trigger)) return undefined;
    return readStringProperty(collector, trigger, 'route', 'trigger route');
}

function readTour(collector: Collector, call: ts.CallExpression): FoundTour | undefined {
    const [input] = call.arguments;
    if (input === undefined || !collector.typescript.isObjectLiteralExpression(input)) {
        noteUnverifiable(collector, call, 'defineTour() is not called with an object literal, so it was not verified.');
        return undefined;
    }

    const platformsValue = propertyValue(collector, input, 'platforms');
    return {
        line: lineOf(collector, call),
        key: readStringProperty(collector, input, 'key', 'tour key'),
        triggerRoute: readTriggerRoute(collector, propertyValue(collector, input, 'trigger')),
        platforms: platformsValue && readStrings(collector, platformsValue, 'platforms'),
        steps: readArray(collector, propertyValue(collector, input, 'steps'), 'steps').flatMap(
            (step) => readStep(collector, step) ?? [],
        ),
    };
}

function readCatalogue(collector: Collector, call: ts.CallExpression): Located<string>[] {
    return readArray(collector, call.arguments[0], 'defineAnchors() argument').flatMap(
        (element) => readString(collector, element, 'anchor key') ?? [],
    );
}

/** `defineAnchors([...])` catalogues and `defineTour({...})` objects, reading string literals only. */
export function findDefinitions(context: SourceContext): DefinitionFindings {
    const collector: Collector = { ...context, unverifiable: [] };
    const findings: DefinitionFindings = { catalogue: [], tours: [], unverifiable: collector.unverifiable };

    visit(context.typescript, context.sourceFile, (node) => {
        if (!context.typescript.isCallExpression(node)) return;
        const callee = calleeName(context, node);
        if (callee === 'defineAnchors') findings.catalogue.push(...readCatalogue(collector, node));
        const tour = callee === 'defineTour' ? readTour(collector, node) : undefined;
        if (tour !== undefined) findings.tours.push(tour);
    });
    return findings;
}
