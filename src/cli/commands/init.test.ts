// @vitest-environment node
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, fakePrettier, packageJson, readProjectFile, runSapar } from '../fixtures';
import { importedNames, unresolvedPackageImports } from '../packageExports';

const NEXT_TAILWIND = { 'package.json': packageJson({ next: '16', tailwindcss: '4' }), 'src/app/page.tsx': '' };

async function generatedFiles(cwd: string): Promise<string[]> {
    return Promise.all(
        ['src/tours/definitions.ts', 'src/tours/anchors.ts', 'src/tours/SaparProvider.tsx', 'src/components/tours/TourCard.tsx'].map(
            (path) => readProjectFile(cwd, path),
        ),
    );
}

function missingRelativeImports(cwd: string, path: string, content: string): string[] {
    return [...importedNames(content).keys()]
        .filter((specifier) => specifier.startsWith('.'))
        .filter((specifier) => !['.ts', '.tsx'].some((extension) => existsSync(join(cwd, dirname(path), `${specifier}${extension}`))))
        .map((specifier) => `${path}: ${specifier}`);
}

describe('sapar init', () => {
    it('writes a Next + memory setup from detection', async () => {
        const cwd = await createProject(NEXT_TAILWIND);

        const result = await runSapar(['init', '--yes'], cwd);

        expect(result.code).toBe(0);
        expect(JSON.parse(await readProjectFile(cwd, 'sapar.json'))).toEqual({
            framework: 'next',
            style: 'tailwind',
            source: 'memory',
            componentsDir: 'src/components/tours',
            toursDir: 'src/tours',
            importBase: '@thelol3882/sapar',
            platforms: { web: ['src'], native: [] },
        });

        const provider = await readProjectFile(cwd, 'src/tours/SaparProvider.tsx');
        expect(provider).toMatch(/^'use client';/);
        expect(provider).toContain("import { NextSaparProvider } from '@thelol3882/sapar/next';");
        expect(provider).toContain("import { localStorageStore } from '@thelol3882/sapar/web';");
        expect(provider).toContain("import { useMemo, type ReactNode } from 'react';");
        expect(provider).toContain(
            'export function AppSaparProvider({ userId, registeredAt, children }: { userId: string; registeredAt?: Date | string; children: ReactNode })',
        );
        expect(provider).toContain('storage: localStorageStore(),');
        expect(provider).toContain('namespace: `app.sapar.${userId}`,');
        expect(provider).toContain('[userId, registeredAtIso]');
        expect(provider).toContain('<NextSaparProvider source={source}>{children}</NextSaparProvider>');

        const anchors = await readProjectFile(cwd, 'src/tours/anchors.ts');
        expect(anchors).toContain("import { useTourAnchor } from '@thelol3882/sapar/web';");
        expect(await readProjectFile(cwd, 'src/tours/definitions.ts')).toContain("platforms: ['web']");
        expect(await readProjectFile(cwd, 'src/components/tours/TourCard.tsx')).toContain("from '@thelol3882/sapar/web'");
        expect(result.stdout).toContain('Next steps:');
        expect(result.stdout).toContain('<AppSaparProvider userId={...} registeredAt={...} />');
    });

    it('creates the rtk source once at module scope and the hook inside the component', async () => {
        const cwd = await createProject({
            'package.json': packageJson({ next: '16', '@reduxjs/toolkit': '2' }),
            'src/app/page.tsx': '',
        });

        await runSapar(['init', '--yes'], cwd);

        const provider = await readProjectFile(cwd, 'src/tours/SaparProvider.tsx');
        expect(provider).toContain("import { createSaparRtk } from '@thelol3882/sapar/rtk';");
        expect(provider).toContain('// TODO: point this at your RTK Query api slice\nimport { baseApi }');
        expect(provider).toContain('\nconst toursRtk = createSaparRtk(baseApi);');
        expect(provider).toContain('    const source = toursRtk.useSaparSource();');
        expect(provider).not.toContain('memorySource');
    });

    it('writes a React + http setup with a web adapter', async () => {
        const cwd = await createProject({ 'package.json': packageJson({ react: '19' }), 'src/main.tsx': '' });

        await runSapar(['init', '--yes', '--source', 'http', '--components-dir', 'src/ui/tours'], cwd);

        const provider = await readProjectFile(cwd, 'src/tours/SaparProvider.tsx');
        expect(provider).not.toContain('use client');
        expect(provider).toContain("import { SaparProvider } from '@thelol3882/sapar/react';");
        expect(provider).toContain("import { createWebAdapter } from '@thelol3882/sapar/web';");
        expect(provider).toContain("const source = httpSource({ baseUrl: '/api/tours' });");
        expect(provider).toContain('<SaparProvider source={source} adapter={adapter}>{children}</SaparProvider>');
        expect(await readProjectFile(cwd, 'src/ui/tours/TourCard.tsx')).toContain('TourCard');
    });

    it('writes an Expo + memory setup backed by AsyncStorage', async () => {
        const cwd = await createProject({ 'package.json': packageJson({ expo: '55' }), 'app/index.tsx': '' });

        await runSapar(['init', '--yes'], cwd);

        expect(JSON.parse(await readProjectFile(cwd, 'sapar.json'))).toMatchObject({
            framework: 'expo',
            style: 'native',
            componentsDir: 'components/tours',
            toursDir: 'tours',
            platforms: { web: [], native: ['.'] },
        });
        const provider = await readProjectFile(cwd, 'tours/SaparProvider.tsx');
        expect(provider).not.toContain('use client');
        expect(provider).toContain("import AsyncStorage from '@react-native-async-storage/async-storage';");
        expect(provider).toContain("import { ExpoSaparProvider } from '@thelol3882/sapar/expo-router';");
        expect(provider).toContain("import { asyncStorageStore } from '@thelol3882/sapar/expo';");
        expect(provider).toContain('storage: asyncStorageStore(AsyncStorage),');
        expect(provider).toContain('namespace: `app.sapar.${userId}`,');
        expect(await readProjectFile(cwd, 'tours/anchors.ts')).toContain("from '@thelol3882/sapar/expo'");
    });

    it.each([
        ['next', 'memory', { next: '16' }],
        ['next', 'rtk', { next: '16', '@reduxjs/toolkit': '2' }],
        ['react', 'http', { react: '19' }],
        ['expo', 'memory', { expo: '55' }],
    ])('generates only imports the package exports for %s + %s', async (_framework, source, dependencies) => {
        const cwd = await createProject({ 'package.json': packageJson(dependencies), 'src/index.ts': '' });

        const result = await runSapar(['init', '--yes', '--source', source], cwd);
        expect(result.stderr).toBe('');

        for (const content of await generatedFiles(cwd)) {
            expect(await unresolvedPackageImports(content)).toEqual([]);
        }
    });

    it('uses a copied folder alias for every entry', async () => {
        const cwd = await createProject(NEXT_TAILWIND);

        await runSapar(['init', '--yes', '--import-base', '@/shared/tours'], cwd);

        const provider = await readProjectFile(cwd, 'src/tours/SaparProvider.tsx');
        expect(provider).toContain("from '@/shared/tours/next'");
        expect(provider).toContain("from '@/shared/tours/core'");
        expect(await readProjectFile(cwd, 'src/tours/definitions.ts')).toContain("from '@/shared/tours/core'");
        expect(await readProjectFile(cwd, 'src/components/tours/TourCard.tsx')).toContain("from '@/shared/tours/web'");
    });

    it('keeps existing files and reports them as skipped', async () => {
        const cwd = await createProject({ ...NEXT_TAILWIND, 'src/tours/definitions.ts': '// mine\n' });

        const result = await runSapar(['init', '--yes'], cwd);

        expect(await readProjectFile(cwd, 'src/tours/definitions.ts')).toBe('// mine\n');
        expect(result.stdout).toContain('skipped     src/tours/definitions.ts (already exists; use --force to overwrite)');
        expect(result.stdout).toContain('created     src/tours/anchors.ts');
    });

    it('overwrites existing files with --force', async () => {
        const cwd = await createProject({ ...NEXT_TAILWIND, 'src/tours/definitions.ts': '// mine\n' });

        const result = await runSapar(['init', '--yes', '--force'], cwd);

        expect(await readProjectFile(cwd, 'src/tours/definitions.ts')).toContain('defineTour');
        expect(result.stdout).toContain('overwritten src/tours/definitions.ts');
    });

    it('asks with the detected defaults and accepts the answers', async () => {
        const cwd = await createProject(NEXT_TAILWIND);
        const asked: string[] = [];
        const answers: Record<string, string> = { source: 'http' };

        await runSapar(['init'], cwd, async (question, defaultAnswer) => {
            asked.push(`${question} -> ${defaultAnswer}`);
            return answers[question.split(' ')[0]!] ?? defaultAnswer;
        });

        expect(asked).toContain('framework (next/expo/react) -> next');
        expect(asked).toContain('style (tailwind/mantine/native) -> tailwind');
        expect(asked).toContain('components dir -> src/components/tours');
        expect(JSON.parse(await readProjectFile(cwd, 'sapar.json'))).toMatchObject({ source: 'http' });
    });

    it('asks again after an invalid answer', async () => {
        const cwd = await createProject(NEXT_TAILWIND);
        const replies = ['vue'];

        const result = await runSapar(['init'], cwd, async (_question, defaultAnswer) => replies.shift() ?? defaultAnswer);

        expect(result.stderr).toContain('Invalid framework: expected one of next, expo, react, got "vue"');
        expect(JSON.parse(await readProjectFile(cwd, 'sapar.json'))).toMatchObject({ framework: 'next' });
    });

    it('does not ask with --yes, and flags beat detection', async () => {
        const cwd = await createProject(NEXT_TAILWIND);

        const result = await runSapar(['init', '--yes', '--source', 'rtk'], cwd, () => {
            throw new Error('should not prompt');
        });

        expect(result.code).toBe(0);
        expect(JSON.parse(await readProjectFile(cwd, 'sapar.json'))).toMatchObject({ source: 'rtk' });
    });

    it('rejects an unknown framework and a mismatched style', async () => {
        const cwd = await createProject(NEXT_TAILWIND);

        const unknown = await runSapar(['init', '--yes', '--framework', 'vue'], cwd);
        const mismatched = await runSapar(['init', '--yes', '--style', 'native'], cwd);

        expect(unknown).toMatchObject({ code: 1, stderr: expect.stringContaining('Invalid framework: expected one of next, expo, react, got "vue"') });
        expect(mismatched).toMatchObject({ code: 1, stderr: expect.stringContaining('"native" style goes with') });
    });

    describe('--tours-dir', () => {
        const LAYERED = ['--yes', '--tours-dir', 'src/shared/tours', '--components-dir', 'src/features/onboarding'];

        it('writes the generated files there and records it in sapar.json', async () => {
            const cwd = await createProject(NEXT_TAILWIND);

            const result = await runSapar(['init', ...LAYERED], cwd);

            expect(result.code).toBe(0);
            expect(JSON.parse(await readProjectFile(cwd, 'sapar.json'))).toMatchObject({
                componentsDir: 'src/features/onboarding',
                toursDir: 'src/shared/tours',
            });
            expect(existsSync(join(cwd, 'src/tours'))).toBe(false);
            expect(result.stdout).toContain('created     src/shared/tours/definitions.ts');
            expect(result.stdout).toContain('from src/shared/tours/SaparProvider.tsx');
            expect(result.stdout).toContain("from src/shared/tours/anchors");
        });

        it.each([
            ['package name', []],
            ['copied alias', ['--import-base', '@/shared/tours']],
        ])('keeps every generated import resolvable in a layered project (%s)', async (_label, extraFlags) => {
            const cwd = await createProject(NEXT_TAILWIND);

            await runSapar(['init', ...LAYERED, ...extraFlags], cwd);

            const files = {
                'src/shared/tours/definitions.ts': '',
                'src/shared/tours/anchors.ts': '',
                'src/shared/tours/SaparProvider.tsx': '',
                'src/features/onboarding/TourCard.tsx': '',
            };
            for (const path of Object.keys(files)) {
                const content = await readProjectFile(cwd, path);
                expect(missingRelativeImports(cwd, path, content)).toEqual([]);
                expect(await unresolvedPackageImports(content)).toEqual([]);
            }
        });

        it('is asked for next to the components dir, with the detected default', async () => {
            const cwd = await createProject(NEXT_TAILWIND);
            const asked: string[] = [];

            await runSapar(['init'], cwd, async (question, defaultAnswer) => {
                asked.push(`${question} -> ${defaultAnswer}`);
                return question === 'tours dir' ? 'src/shared/tours' : defaultAnswer;
            });

            expect(asked).toContain('tours dir -> src/tours');
            expect(JSON.parse(await readProjectFile(cwd, 'sapar.json'))).toMatchObject({ toursDir: 'src/shared/tours' });
        });

        it('is not asked for when the flag is given', async () => {
            const cwd = await createProject(NEXT_TAILWIND);
            const asked: string[] = [];

            await runSapar(['init', '--tours-dir', 'lib/tours'], cwd, async (question, defaultAnswer) => {
                asked.push(question);
                return defaultAnswer;
            });

            expect(asked).not.toContain('tours dir');
            expect(JSON.parse(await readProjectFile(cwd, 'sapar.json'))).toMatchObject({ toursDir: 'lib/tours' });
        });
    });

    describe('formatting', () => {
        it('formats every written file with the project Prettier and says so', async () => {
            const cwd = await createProject({ ...NEXT_TAILWIND, ...fakePrettier() });

            const result = await runSapar(['init', '--yes'], cwd);

            expect(result.stderr).toBe('');
            expect(result.stdout).toContain('formatted with Prettier');
            const definitions = await readProjectFile(cwd, 'src/tours/definitions.ts');
            expect(definitions).toContain('import { defineAnchors, defineTour } from "@thelol3882/sapar";');
            expect(definitions).toContain('\n  key: "welcome",');
            expect(await readProjectFile(cwd, 'src/components/tours/TourCard.tsx')).not.toContain("'");
            expect(await readProjectFile(cwd, 'sapar.json')).toContain('\n  "framework": "next"');
        });

        it('leaves files as generated and hints when Prettier has no config', async () => {
            const cwd = await createProject({ ...NEXT_TAILWIND, ...fakePrettier({ config: 'null' }) });

            const result = await runSapar(['init', '--yes'], cwd);

            expect(result.stdout).toContain('no Prettier config found; files use 4-space indentation and single quotes');
            expect(await readProjectFile(cwd, 'src/tours/definitions.ts')).toContain("from '@thelol3882/sapar';");
        });

        it('gives the same hint when Prettier is not installed', async () => {
            const cwd = await createProject(NEXT_TAILWIND);

            const result = await runSapar(['init', '--yes'], cwd);

            expect(result.stdout).toContain('no Prettier config found');
            expect(result.stdout).not.toContain('formatted with Prettier');
        });

        it('skips formatting with --no-format, without a hint', async () => {
            const cwd = await createProject({ ...NEXT_TAILWIND, ...fakePrettier() });

            const result = await runSapar(['init', '--yes', '--no-format'], cwd);

            expect(result.stdout).not.toContain('Prettier');
            expect(await readProjectFile(cwd, 'src/tours/definitions.ts')).toContain("from '@thelol3882/sapar';");
        });

        it('does not touch files that were kept', async () => {
            const cwd = await createProject({ ...NEXT_TAILWIND, ...fakePrettier(), 'src/tours/definitions.ts': "// 'mine'\n" });

            await runSapar(['init', '--yes'], cwd);

            expect(await readProjectFile(cwd, 'src/tours/definitions.ts')).toBe("// 'mine'\n");
        });

        it('warns and keeps the generated file when formatting fails', async () => {
            const cwd = await createProject({
                ...NEXT_TAILWIND,
                ...fakePrettier({ format: "async () => { throw new Error('boom'); }" }),
            });

            const result = await runSapar(['init', '--yes'], cwd);

            expect(result.code).toBe(0);
            expect(result.stderr).toContain('warning: could not format src/tours/definitions.ts: boom');
            expect(result.stdout).not.toContain('Prettier');
            expect(await readProjectFile(cwd, 'src/tours/definitions.ts')).toContain("from '@thelol3882/sapar';");
        });
    });

    it('needs a package.json', async () => {
        const cwd = await createProject({});
        expect(await runSapar(['init', '--yes'], cwd)).toMatchObject({ code: 1, stderr: expect.stringContaining('No package.json') });
    });
});
