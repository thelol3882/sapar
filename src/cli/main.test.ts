// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, runSapar } from './fixtures';

describe('sapar', () => {
    it('prints the version from package.json', async () => {
        const manifest = JSON.parse(await readFile(join(import.meta.dirname, '..', '..', 'package.json'), 'utf8'));
        const cwd = await createProject({});

        expect(await runSapar(['--version'], cwd)).toEqual({ code: 0, stdout: manifest.version, stderr: '' });
    });

    it.each([['--help'], ['-h']])('prints general help for %s', async (flag) => {
        const cwd = await createProject({});

        const result = await runSapar([flag], cwd);

        expect(result.code).toBe(0);
        expect(result.stdout).toContain('Usage: sapar <command>');
        expect(result.stdout).toMatch(/init .*\n\s+add .*\n\s+check/);
    });

    it.each([
        ['init', '--yes'],
        ['add', '--all'],
        ['check', '--strict'],
    ])('prints help for `sapar %s --help` without running it', async (command, flag) => {
        const cwd = await createProject({});

        const result = await runSapar([command, flag, '--help'], cwd);

        expect(result.code).toBe(0);
        expect(result.stdout).toContain(`Usage: sapar ${command}`);
    });

    it('prints help to stderr and fails for an unknown command', async () => {
        const cwd = await createProject({});

        const result = await runSapar(['deploy'], cwd);

        expect(result.code).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('Unknown command "deploy"');
        expect(result.stderr).toContain('Usage: sapar <command>');
    });

    it('treats a missing command as unknown', async () => {
        const cwd = await createProject({});

        expect(await runSapar([], cwd)).toMatchObject({ code: 1, stderr: expect.stringContaining('Usage: sapar') });
    });

    it('does not mistake inherited object keys for commands', async () => {
        const cwd = await createProject({});

        expect(await runSapar(['constructor'], cwd)).toMatchObject({ code: 1 });
    });

    it('reports an unknown option as an error', async () => {
        const cwd = await createProject({});

        const result = await runSapar(['add', '--bogus'], cwd);

        expect(result.code).toBe(1);
        expect(result.stderr).toMatch(/^error: .*--bogus/);
    });
});
