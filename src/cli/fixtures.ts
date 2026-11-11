import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach } from 'vitest';
import type { Prompt } from './context';
import { runCli } from './main';

export interface RunResult {
    code: number;
    stdout: string;
    stderr: string;
}

const projects: string[] = [];

afterEach(async () => {
    await Promise.all(projects.splice(0).map((project) => rm(project, { recursive: true, force: true })));
});

export const packageJson = (dependencies: Record<string, string> = {}): string =>
    JSON.stringify({ name: 'host-app', dependencies });

const REFORMAT_WITH_CONFIG = `async (source, options) => {
    if (!options.filepath) throw new Error('filepath is required');
    return source.replace(/    /g, ' '.repeat(options.tabWidth)).replace(/'/g, '"');
}`;

interface FakePrettierOptions {
    /** Source of the `resolveConfig(file)` result expression. */
    config?: string;
    /** Source of the `format(source, options)` function. */
    format?: string;
}

/** Files of a stand-in `prettier` package: two-space indentation and double quotes when a config exists. */
export function fakePrettier({ config = '{ tabWidth: 2 }', format = REFORMAT_WITH_CONFIG }: FakePrettierOptions = {}): Record<string, string> {
    return {
        'node_modules/prettier/package.json': JSON.stringify({ name: 'prettier', version: '0.0.0', main: 'index.js' }),
        'node_modules/prettier/index.js': `module.exports = { resolveConfig: async () => (${config}), format: ${format} };\n`,
    };
}

export async function createProject(files: Record<string, string>): Promise<string> {
    const cwd = await mkdtemp(join(tmpdir(), 'tours-cli-'));
    projects.push(cwd);
    for (const [path, content] of Object.entries(files)) {
        await mkdir(dirname(join(cwd, path)), { recursive: true });
        await writeFile(join(cwd, path), content);
    }
    return cwd;
}

export const readProjectFile = (cwd: string, path: string): Promise<string> => readFile(join(cwd, path), 'utf8');

export async function runSapar(argv: string[], cwd: string, prompt?: Prompt): Promise<RunResult> {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runCli(argv, {
        cwd,
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
        ...(prompt && { prompt }),
    });
    return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}
