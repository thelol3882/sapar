// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createProject, packageJson, runSapar } from '../fixtures';
import type { RunResult } from '../fixtures';
import type { CheckReport } from '../report';

const WEB_ONLY = { web: ['src/web'], native: [] };
const BOTH = { web: ['src/web'], native: ['src/native'] };

const step = (key: string, anchor?: string, route?: string): string =>
    `{ key: '${key}', title: 'T', body: 'B'${anchor ? `, anchor: '${anchor}'` : ''}${route ? `, route: '${route}'` : ''} }`;

const tourFile = (key: string, steps: string[], extra = ''): string =>
    `import { defineTour } from '@thelol3882/sapar';
export const tour = defineTour({
    key: '${key}',
    title: 'T',
    ${extra}
    steps: [${steps.join(', ')}],
});
`;

const component = (...keys: string[]): string =>
    `export function C() {\n    return <div>${keys.map((key) => `<b {...useTourAnchor('${key}')} />`).join('')}</div>;\n}\n`;

async function check(
    files: Record<string, string>,
    { platforms = WEB_ONLY, args = [] }: { platforms?: object; args?: string[] } = {},
): Promise<RunResult & { report: CheckReport }> {
    const config = {
        framework: 'next',
        style: 'tailwind',
        source: 'memory',
        componentsDir: 'src/components/tours',
        toursDir: 'src/tours',
        importBase: '@thelol3882/sapar',
        platforms,
    };
    const cwd = await createProject({
        'package.json': packageJson(),
        'sapar.json': JSON.stringify(config),
        'src/tours/.gitkeep': '',
        'src/web/App.tsx': 'export const App = 1;\n',
        ...files,
    });
    const result = await runSapar(['check', '--format', 'json', ...args], cwd);
    return { ...result, report: JSON.parse(result.stdout) };
}

const messages = (findings: CheckReport['errors']): string[] => findings.map(({ message }) => message);
const codes = (findings: CheckReport['errors']): string[] => findings.map(({ code }) => code);

describe('sapar check: a healthy project', () => {
    it('passes, and the text output says so', async () => {
        const cwd = await createProject({
            'package.json': packageJson(),
            'sapar.json': JSON.stringify({
                framework: 'next',
                style: 'tailwind',
                source: 'memory',
                componentsDir: 'c',
                toursDir: 'src/tours',
                importBase: '@thelol3882/sapar',
                platforms: WEB_ONLY,
            }),
            'src/tours/definitions.ts': tourFile('welcome', [step('s1', 'nav.home')]),
            'src/web/Nav.tsx': component('nav.home'),
        });

        const result = await runSapar(['check'], cwd);

        expect(result).toEqual({ code: 0, stdout: 'No problems found. Scanned 2 files and 1 tour.', stderr: '' });
    });

    it('reports the JSON shape with stats', async () => {
        const { code, report } = await check({
            'src/tours/definitions.ts': `import { defineAnchors } from '@thelol3882/sapar';\nexport const anchors = defineAnchors(['nav.home']);\n${tourFile('welcome', [step('s1', 'nav.home')]).split('\n').slice(1).join('\n')}`,
            'src/web/Nav.tsx': component('nav.home'),
        });

        expect(code).toBe(0);
        expect(report).toEqual({
            errors: [],
            warnings: [],
            info: [],
            stats: { files: 3, filesByPlatform: { web: 2, native: 0 }, tours: 1, anchorsDeclared: 1, anchorsCatalogued: 1 },
        });
    });
});

describe('sapar check: anchor declarations', () => {
    it('recognises hooks and every data-sapar spelling, and skips comments', async () => {
        const { report } = await check({
            'src/tours/definitions.ts': tourFile('welcome', [
                step('a', 'hook.direct'),
                step('b', 'hook.wrapper'),
                step('c', 'hook.custom'),
                step('d', 'attr.plain'),
                step('e', 'attr.expression'),
                step('f', 'attr.conditional'),
                step('g', 'attr.template'),
                step('h', 'in.comment'),
            ]),
            'src/web/Screen.tsx': `
// useTourAnchor('in.comment')
/* data-sapar="in.comment" */
export function Screen({ ready }: { ready: boolean }) {
    return (
        <div>
            <a {...useTourAnchor('hook.direct')} />
            <a {...useAnchor('hook.wrapper')} />
            <a {...useBillingAnchor('hook.custom')} />
            <a data-sapar="attr.plain" />
            <a data-sapar={'attr.expression'} />
            <a data-sapar={ready ? 'attr.conditional' : undefined} />
            <a data-sapar={\`attr.template\`} />
        </div>
    );
}
`,
        });

        expect(messages(report.errors)).toEqual([
            expect.stringContaining('anchor "in.comment" is not declared on web'),
        ]);
    });

    it('ignores test files, node_modules, build output and hidden directories', async () => {
        const { report } = await check({
            'src/tours/definitions.ts': tourFile('welcome', [step('s', 'only.in.ignored')]),
            'src/web/Nav.test.tsx': component('only.in.ignored'),
            'src/web/node_modules/pkg/index.tsx': component('only.in.ignored'),
            'src/web/dist/out.js': "useTourAnchor('only.in.ignored');",
            'src/web/.next/page.js': "useTourAnchor('only.in.ignored');",
            'src/web/Real.tsx': component('real.one'),
        });

        expect(codes(report.errors)).toEqual(['anchor_missing']);
        expect(report.stats.anchorsDeclared).toBe(1);
    });

    it('does not guess at non-literal anchor arguments', async () => {
        const { report } = await check({
            'src/tours/definitions.ts': tourFile('welcome', [step('s', 'nav.home')]),
            'src/web/Nav.tsx': `${component('nav.home')}export const useDynamic = (key: string) => useTourAnchor(key);\n`,
        });

        expect(report.errors).toEqual([]);
        expect(report.stats.anchorsDeclared).toBe(1);
    });
});

describe('sapar check: errors', () => {
    it('reports a step anchor that no element declares, with the file and line', async () => {
        const { code, report } = await check({
            'src/tours/definitions.ts': tourFile('welcome', [step('s1', 'nav.home')]),
            'src/web/Nav.tsx': component('nav.other'),
        });

        expect(code).toBe(1);
        expect(report.errors).toEqual([
            {
                code: 'anchor_missing',
                message: 'In tour "welcome": anchor "nav.home" is not declared on web.',
                file: 'src/tours/definitions.ts',
                line: 6,
                suggestions: [],
            },
        ]);
    });

    it('suggests near misses', async () => {
        const { report } = await check({
            'src/tours/definitions.ts': tourFile('welcome', [step('s1', 'billing.upgrade')]),
            'src/web/Billing.tsx': component('billing.upgrade_button', 'billing.upgrad', 'nav.home'),
        });

        expect(report.errors[0]).toMatchObject({
            message: 'In tour "welcome": anchor "billing.upgrade" is not declared on web. Did you mean "billing.upgrad" or "billing.upgrade_button"?',
            suggestions: ['billing.upgrad', 'billing.upgrade_button'],
        });
    });

    it('checks every platform a tour targets and names the one that lacks the anchor', async () => {
        const { code, report } = await check(
            {
                'src/tours/definitions.ts': tourFile('welcome', [step('s1', 'nav.home')]),
                'src/web/Nav.tsx': component('nav.home'),
                'src/native/Nav.tsx': component('nav.other'),
            },
            { platforms: BOTH },
        );

        expect(code).toBe(1);
        expect(messages(report.errors)).toEqual([
            'In tour "welcome": anchor "nav.home" is not declared on native. It is declared on web.',
        ]);
    });

    it('limits the check to the tour platforms when it lists them', async () => {
        const { code, report } = await check(
            {
                'src/tours/definitions.ts': tourFile('welcome', [step('s1', 'nav.home')], "platforms: ['web'],"),
                'src/web/Nav.tsx': component('nav.home'),
                'src/native/Nav.tsx': component('nav.other'),
            },
            { platforms: BOTH },
        );

        expect(code).toBe(0);
        expect(report.errors).toEqual([]);
    });

    it('reports invalid route patterns on triggers and steps', async () => {
        const { report } = await check({
            'src/tours/definitions.ts': tourFile('welcome', [step('s1', undefined, '/a/*/b')], "trigger: { route: '/billing*' },"),
        });

        expect(codes(report.errors)).toEqual(['route_invalid', 'route_invalid']);
        expect(messages(report.errors)).toEqual([
            expect.stringContaining('trigger route "/billing*" of tour "welcome"'),
            expect.stringContaining('step route "/a/*/b" in tour "welcome"'),
        ]);
    });

    it('accepts valid route patterns', async () => {
        const { report } = await check({
            'src/tours/definitions.ts': tourFile('welcome', [step('s1', undefined, '/billing/*')], "trigger: { route: '*' },"),
        });

        expect(report.errors).toEqual([]);
    });

    it('reports keys that break the grammar', async () => {
        const { report } = await check({
            'src/tours/definitions.ts': `import { defineAnchors } from '@thelol3882/sapar';
export const anchors = defineAnchors(['Bad.Catalogue']);
${tourFile('Bad-Tour', [step('Bad Step', 'Bad.Anchor')]).split('\n').slice(1).join('\n')}`,
            'src/web/Nav.tsx': component('Bad.Declared'),
        });

        expect(messages(report.errors.filter(({ code }) => code === 'key_invalid'))).toEqual([
            expect.stringContaining('Invalid tour key "Bad-Tour"'),
            expect.stringContaining('Invalid step key "Bad Step" in tour "Bad-Tour"'),
            expect.stringContaining('Invalid step anchor "Bad.Anchor" in tour "Bad-Tour"'),
            expect.stringContaining('Invalid catalogue anchor "Bad.Catalogue"'),
            expect.stringContaining('Invalid declared anchor "Bad.Declared"'),
        ]);
    });

    it('reports duplicate tour keys across files', async () => {
        const { report } = await check({
            'src/tours/a.ts': tourFile('welcome', [step('s1')]),
            'src/tours/b.ts': tourFile('welcome', [step('s1')]),
        });

        expect(report.errors).toEqual([
            {
                code: 'tour_duplicate',
                message: 'Duplicate tour key: "welcome" (first at src/tours/a.ts:3).',
                file: 'src/tours/b.ts',
                line: 3,
            },
        ]);
    });

    it('reports duplicate step keys inside a tour only', async () => {
        const { report } = await check({
            'src/tours/definitions.ts': tourFile('welcome', [step('intro'), step('intro')]),
            'src/tours/other.ts': tourFile('other', [step('intro')]),
        });

        expect(messages(report.errors)).toEqual([
            expect.stringContaining('Duplicate step key in tour "welcome": "intro"'),
        ]);
    });

    it('reports anchors that are used but missing from the defineAnchors catalogue', async () => {
        const { report } = await check({
            'src/tours/anchors.ts': "import { defineAnchors } from '@thelol3882/sapar';\nexport const anchors = defineAnchors(['nav.home']);\n",
            'src/web/Nav.tsx': component('nav.home', 'nav.hom'),
        });

        expect(report.errors).toEqual([
            expect.objectContaining({
                code: 'anchor_uncatalogued',
                message: 'Anchor "nav.hom" is declared here but missing from defineAnchors([...]). Did you mean "nav.home"?',
                file: 'src/web/Nav.tsx',
                suggestions: ['nav.home'],
            }),
        ]);
    });

    it('does not require a catalogue when none exists', async () => {
        const { report } = await check({ 'src/web/Nav.tsx': component('nav.home') });

        expect(report.errors).toEqual([]);
    });

    it('reports a configured root that is not a directory', async () => {
        const { code, report } = await check(
            { 'src/tours/definitions.ts': tourFile('welcome', [step('s1')]) },
            { platforms: { web: ['src/web', 'src/missing'], native: [] } },
        );

        expect(code).toBe(1);
        expect(report.errors[0]).toMatchObject({ code: 'source_root_missing' });
        expect(report.errors[0]!.message).toContain('"src/missing"');
    });
});

describe('sapar check: warnings', () => {
    it('warns about catalogue anchors no element declares', async () => {
        const { code, report } = await check({
            'src/tours/anchors.ts': "import { defineAnchors } from '@thelol3882/sapar';\nexport const anchors = defineAnchors(['nav.home', 'nav.gone']);\n",
            'src/web/Nav.tsx': component('nav.home'),
        });

        expect(code).toBe(0);
        expect(report.warnings).toEqual([
            expect.objectContaining({ code: 'anchor_undeclared', message: 'Anchor "nav.gone" is in defineAnchors([...]) but no element declares it.' }),
        ]);
    });

    it('warns when two elements claim the same anchor on one platform', async () => {
        const { report } = await check({
            'src/web/A.tsx': component('nav.home'),
            'src/web/B.tsx': component('nav.home'),
        });

        expect(report.warnings).toEqual([
            {
                code: 'anchor_duplicate',
                message: 'Duplicate anchor on web: "nav.home" (first at src/web/A.tsx:2).',
                file: 'src/web/B.tsx',
                line: 2,
            },
        ]);
    });

    it('warns about a platform whose roots hold no source files', async () => {
        const { code, report } = await check(
            { 'src/web/Nav.tsx': component('nav.home'), 'src/native/readme.md': '' },
            { platforms: BOTH },
        );

        expect(code).toBe(0);
        expect(codes(report.warnings)).toEqual(['platform_unverified']);
        expect(report.warnings[0]!.message).toBe('No source files found under src/native, so nothing was verified for native.');
    });

    it('does not report anchors as missing on a platform it could not scan', async () => {
        const { report } = await check(
            {
                'src/tours/definitions.ts': tourFile('welcome', [step('s1', 'nav.home')]),
                'src/web/Nav.tsx': component('nav.home'),
                'src/native/readme.md': '',
            },
            { platforms: BOTH },
        );

        expect(report.errors).toEqual([]);
        expect(codes(report.warnings)).toEqual(['platform_unverified']);
    });

    it('warns when a tour targets a platform that has no roots', async () => {
        const { report } = await check({
            'src/tours/definitions.ts': tourFile('welcome', [step('s1', 'nav.home')], "platforms: ['native'],"),
            'src/web/Nav.tsx': component('nav.home'),
        });

        expect(report.warnings).toEqual([
            {
                code: 'platform_unverified',
                message: '"platforms.native" in sapar.json has no scan roots, so tours targeting native were not verified.',
            },
        ]);
    });

    it('stays quiet about a platform nobody targets and nothing configures', async () => {
        const { report } = await check({ 'src/web/Nav.tsx': component('nav.home') });

        expect(report.warnings).toEqual([]);
    });

    it('is loud when nothing was scanned at all', async () => {
        const { code, report } = await check(
            { 'src/empty/readme.md': '' },
            { platforms: { web: ['src/empty'], native: [] } },
        );

        expect(code).toBe(0);
        expect(report.warnings).toEqual([
            expect.objectContaining({ code: 'nothing_scanned', message: expect.stringContaining('did not verify anything') }),
        ]);
    });

    it('warns about values it can only read statically', async () => {
        const { report } = await check({
            'src/tours/definitions.ts': `import { defineTour } from '@thelol3882/sapar';
import { IMPORTED } from './keys';
const KEY = 'welcome';
const steps = [];
export const a = defineTour({ key: IMPORTED, title: 'T', steps: [{ key: 's', title: 'T', body: 'B', anchor: \`nav.\${KEY}\` }] });
export const b = defineTour({ key: 'b', title: 'T', steps });
export const c = defineTour({ key: 'c', title: 'T', steps: [...steps, makeStep()] });
`,
        });

        expect(codes(report.warnings)).toEqual(Array(5).fill('value_unverifiable'));
        expect(messages(report.warnings)).toEqual([
            'The tour key is not a string literal, so it was not verified (use a string literal or a const declared in this file).',
            'The step anchor is not a string literal, so it was not verified (use a string literal or a const declared in this file).',
            'The steps is not an array literal, so it was not verified.',
            'A step is not an object literal, so it was not verified.',
            'A step is not an object literal, so it was not verified.',
        ]);
        expect(report.warnings[0]).toMatchObject({ file: 'src/tours/definitions.ts', line: 5 });
        expect(report.errors).toEqual([]);
    });
});

describe('sapar check: constants declared in the same file', () => {
    it.each([
        ["const X = 'board.intro';"],
        ["export const X = 'board.intro';"],
        ["const X = 'board.intro' as const;"],
        ['const X = `board.intro`;'],
        ["const X = ('board.intro');"],
        ["const X = 'board.intro' satisfies string;"],
    ])('reads %s wherever a literal is read', async (declaration) => {
        const { report } = await check({
            'src/tours/definitions.ts': `import { defineAnchors, defineTour } from '@thelol3882/sapar';
${declaration}
export const anchors = defineAnchors([X]);
export const tour = defineTour({ key: X, title: 'T', steps: [{ key: X, title: 'T', body: 'B', anchor: X }] });
`,
            'src/web/Board.tsx': `${declaration}
export const Board = () => <section data-sapar={X} {...useTourAnchor(X)} />;
`,
        });

        expect(report.warnings.filter(({ code }) => code === 'value_unverifiable')).toEqual([]);
        expect(report.errors).toEqual([]);
        expect(report.stats).toMatchObject({ tours: 1, anchorsCatalogued: 1, anchorsDeclared: 2 });
    });

    it('resolves a constant in the shorthand property, routes, platforms and the anchor hook', async () => {
        const { report } = await check({
            'src/tours/definitions.ts': `import { defineTour } from '@thelol3882/sapar';
const key = 'board.intro';
const ROUTE = '/board';
const WEB = 'web';
const BAD_ROUTE = '/a/*/b';
export const tour = defineTour({
    key,
    title: 'T',
    platforms: [WEB],
    trigger: { route: ROUTE },
    steps: [{ key: 's', title: 'T', body: 'B', route: BAD_ROUTE }],
});
`,
        });

        expect(report.warnings.filter(({ code }) => code === 'value_unverifiable')).toEqual([]);
        expect(report.errors).toEqual([expect.objectContaining({ code: 'route_invalid', message: expect.stringContaining('"/a/*/b"') })]);
    });

    it('verifies the resolved value: a constant with a bad key is an error', async () => {
        const { report } = await check({
            'src/tours/definitions.ts': `import { defineTour } from '@thelol3882/sapar';
const BOARD_TOUR = 'Board-Intro';
export const tour = defineTour({ key: BOARD_TOUR, title: 'T', steps: [] });
`,
        });

        expect(messages(report.errors)).toEqual([expect.stringContaining('Invalid tour key "Board-Intro"')]);
    });

    it('finds a missing anchor through a constant', async () => {
        const { report } = await check({
            'src/tours/definitions.ts': `import { defineTour } from '@thelol3882/sapar';
const ANCHOR = 'nav.home';
export const tour = defineTour({ key: 'welcome', title: 'T', steps: [{ key: 's', title: 'T', body: 'B', anchor: ANCHOR }] });
`,
            'src/web/Nav.tsx': component('nav.other'),
        });

        expect(codes(report.errors)).toEqual(['anchor_missing']);
    });

    it.each([
        ['an imported constant', "import { KEY } from './keys';"],
        ['a let binding', "let KEY = 'welcome';"],
        ['a constant with a substitution', 'const KEY = `wel${suffix}`;'],
        ['a constant declared inside a function', "function make() { const KEY = 'welcome'; }"],
    ])('stays unverifiable for %s', async (_label, declaration) => {
        const { report } = await check({
            'src/tours/definitions.ts': `import { defineTour } from '@thelol3882/sapar';
${declaration}
export const tour = defineTour({ key: KEY, title: 'T', steps: [] });
`,
        });

        expect(messages(report.warnings)).toEqual([expect.stringContaining('use a string literal or a const declared in this file')]);
    });
});

describe('sapar check: output and exit codes', () => {
    const failing = {
        'src/tours/definitions.ts': tourFile('welcome', [step('s1', 'nav.home')]),
        'src/web/Nav.tsx': component('nav.other'),
    };

    it('prints errors with file:line and a summary in text mode', async () => {
        const cwd = await createProject({
            'package.json': packageJson(),
            'sapar.json': JSON.stringify({
                framework: 'next', style: 'tailwind', source: 'memory', componentsDir: 'c', toursDir: 'src/tours',
                importBase: '@thelol3882/sapar', platforms: WEB_ONLY,
            }),
            ...failing,
            'src/web/Two.tsx': component('nav.other'),
        });

        const result = await runSapar(['check'], cwd);

        expect(result.code).toBe(1);
        expect(result.stdout).toBe(
            [
                'Errors (1)',
                '  src/tours/definitions.ts:6  In tour "welcome": anchor "nav.home" is not declared on web. [anchor_missing]',
                '',
                'Warnings (1)',
                '  src/web/Two.tsx:2  Duplicate anchor on web: "nav.other" (first at src/web/Nav.tsx:2). [anchor_duplicate]',
                '',
                'Found 1 error and 1 warning. Scanned 3 files and 1 tour.',
            ].join('\n'),
        );
    });

    it('fails on warnings only with --strict', async () => {
        const files = { 'src/web/A.tsx': component('nav.home'), 'src/web/B.tsx': component('nav.home') };

        expect((await check(files)).code).toBe(0);
        expect((await check(files, { args: ['--strict'] })).code).toBe(1);
    });

    it('lists anchors no tour uses only with --verbose', async () => {
        const files = {
            'src/tours/definitions.ts': tourFile('welcome', [step('s1', 'nav.home')]),
            'src/web/Nav.tsx': component('nav.home', 'nav.unused'),
        };

        expect((await check(files)).report.info).toEqual([]);
        const verbose = await check(files, { args: ['--verbose'] });
        expect(verbose.code).toBe(0);
        expect(verbose.report.info).toEqual([
            expect.objectContaining({ code: 'anchor_unused', message: 'Anchor "nav.unused" is declared but no tour uses it.' }),
        ]);
    });

    it('rejects an unknown format', async () => {
        const cwd = await createProject({ 'package.json': packageJson() });

        expect(await runSapar(['check', '--format', 'xml'], cwd)).toMatchObject({
            code: 1,
            stderr: expect.stringContaining('Invalid format: expected one of text, json, got "xml"'),
        });
    });

    it('needs sapar.json', async () => {
        const cwd = await createProject({ 'package.json': packageJson() });

        expect(await runSapar(['check'], cwd)).toMatchObject({ code: 1, stderr: expect.stringContaining('sapar init') });
    });
});
