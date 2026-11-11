// @vitest-environment node
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, fakePrettier, packageJson, readProjectFile, runSapar } from '../fixtures';
import { unresolvedPackageImports } from '../packageExports';

const CONFIG = {
    framework: 'next',
    style: 'tailwind',
    source: 'memory',
    componentsDir: 'src/components/tours',
    toursDir: 'src/tours',
    importBase: '@thelol3882/sapar',
    platforms: { web: ['src'], native: [] },
};

const projectFiles = (config: Record<string, unknown> = {}) => ({
    'package.json': packageJson(),
    'sapar.json': JSON.stringify({ ...CONFIG, ...config }),
});

const TAILWIND_TEMPLATES = ['AnnouncementModal', 'TourCard', 'WhatsNewButton', 'WhatsNewPanel'];

describe('sapar add', () => {
    it('copies a component, rewriting imports to the package name and dropping the note', async () => {
        const cwd = await createProject(projectFiles());

        const result = await runSapar(['add', 'TourCard'], cwd);

        expect(result.code).toBe(0);
        expect(result.stdout).toContain('created     src/components/tours/TourCard.tsx');
        const copied = await readProjectFile(cwd, 'src/components/tours/TourCard.tsx');
        expect(copied).toContain("from '@thelol3882/sapar/web'");
        expect(copied).not.toContain('../../src');
        expect(copied).not.toContain('After copying');
    });

    it('rewrites to a copied folder alias', async () => {
        const cwd = await createProject(projectFiles({ importBase: '@/shared/tours' }));

        await runSapar(['add', 'TourCard'], cwd);

        const copied = await readProjectFile(cwd, 'src/components/tours/TourCard.tsx');
        expect(copied).toContain("from '@/shared/tours/web'");
        expect(copied).not.toContain('../../src');
    });

    it('formats the copied files with the project Prettier', async () => {
        const cwd = await createProject({ ...projectFiles(), ...fakePrettier() });

        const result = await runSapar(['add', 'TourCard'], cwd);

        expect(result.stdout).toBe('created     src/components/tours/TourCard.tsx\nformatted with Prettier');
        expect(await readProjectFile(cwd, 'src/components/tours/TourCard.tsx')).toContain('from "@thelol3882/sapar/web"');
    });

    it('copies as they are with --no-format', async () => {
        const cwd = await createProject({ ...projectFiles(), ...fakePrettier() });

        const result = await runSapar(['add', 'TourCard', '--no-format'], cwd);

        expect(result.stdout).toBe('created     src/components/tours/TourCard.tsx');
        expect(await readProjectFile(cwd, 'src/components/tours/TourCard.tsx')).toContain("from '@thelol3882/sapar/web'");
    });

    it('matches names case-insensitively and in kebab-case', async () => {
        const cwd = await createProject(projectFiles());

        const result = await runSapar(['add', 'whats-new-panel', 'TOURCARD', 'tourcard'], cwd);

        expect(result.stdout.split('\n').slice(0, 2)).toEqual([
            'created     src/components/tours/WhatsNewPanel.tsx',
            'created     src/components/tours/TourCard.tsx',
        ]);
    });

    it('suggests the nearest name for an unknown component', async () => {
        const cwd = await createProject(projectFiles());

        const result = await runSapar(['add', 'TourCrad'], cwd);

        expect(result.code).toBe(1);
        expect(result.stderr).toContain('Unknown component "TourCrad". Did you mean "TourCard"?');
        expect(result.stderr).toContain('Available: AnnouncementModal, TourCard, WhatsNewButton, WhatsNewPanel.');
    });

    it('lists the available components without copying', async () => {
        const cwd = await createProject(projectFiles());

        const result = await runSapar(['add', '--list'], cwd);

        expect(result.stdout.split('\n')).toEqual(TAILWIND_TEMPLATES);
        await expect(readdir(join(cwd, 'src'))).rejects.toThrow();
    });

    it('copies every component with --all, and each one imports only exported names', async () => {
        const cwd = await createProject(projectFiles());

        await runSapar(['add', '--all'], cwd);

        expect((await readdir(join(cwd, 'src/components/tours'))).sort()).toEqual(
            TAILWIND_TEMPLATES.map((name) => `${name}.tsx`),
        );
        for (const name of TAILWIND_TEMPLATES) {
            const copied = await readProjectFile(cwd, `src/components/tours/${name}.tsx`);
            expect(await unresolvedPackageImports(copied)).toEqual([]);
        }
    });

    it('never copies test files', async () => {
        const cwd = await createProject(projectFiles({ style: 'mantine' }));

        const result = await runSapar(['add', '--list'], cwd);

        expect(result.stdout).not.toMatch(/test/i);
    });

    it('keeps an existing file unless forced', async () => {
        const cwd = await createProject({ ...projectFiles(), 'src/components/tours/TourCard.tsx': '// mine\n' });

        const skipped = await runSapar(['add', 'TourCard'], cwd);
        expect(skipped.stdout).toContain('skipped     src/components/tours/TourCard.tsx (already exists; use --force to overwrite)');
        expect(await readProjectFile(cwd, 'src/components/tours/TourCard.tsx')).toBe('// mine\n');

        const forced = await runSapar(['add', 'TourCard', '--force'], cwd);
        expect(forced.stdout).toContain('overwritten src/components/tours/TourCard.tsx');
        expect(await readProjectFile(cwd, 'src/components/tours/TourCard.tsx')).toContain('export function TourCard');
    });

    it('lets --style pick another template set', async () => {
        const cwd = await createProject(projectFiles());

        await runSapar(['add', 'TourCard', '--style', 'mantine'], cwd);

        expect(await readProjectFile(cwd, 'src/components/tours/TourCard.tsx')).toContain('@mantine/core');
    });

    it('needs component names, --all or --list', async () => {
        const cwd = await createProject(projectFiles());

        expect(await runSapar(['add'], cwd)).toMatchObject({ code: 1, stderr: expect.stringContaining('Name the components') });
    });

    it('needs sapar.json', async () => {
        const cwd = await createProject({ 'package.json': packageJson() });

        expect(await runSapar(['add', 'TourCard'], cwd)).toMatchObject({
            code: 1,
            stderr: expect.stringContaining('Run `sapar init` first'),
        });
    });

    it('reports an invalid sapar.json', async () => {
        const cwd = await createProject({ 'sapar.json': JSON.stringify({ ...CONFIG, framework: 'vue' }) });

        const result = await runSapar(['add', '--list'], cwd);

        expect(result.stderr).toContain('Invalid "framework" in sapar.json: expected one of next, expo, react, got "vue".');
    });

    it('honours --cwd', async () => {
        const cwd = await createProject({ 'app/sapar.json': JSON.stringify(CONFIG) });

        const result = await runSapar(['add', 'TourCard', '--cwd', 'app'], cwd);

        expect(result.code).toBe(0);
        expect(await readProjectFile(cwd, 'app/src/components/tours/TourCard.tsx')).toContain('TourCard');
    });
});
