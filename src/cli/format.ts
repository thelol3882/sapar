import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { CliContext } from './context';
import type { WriteRecord } from './fs';
import { displayPath } from './paths';
import { formatWrites } from './report';

interface Prettier {
    resolveConfig: (file: string) => Promise<Record<string, unknown> | null>;
    format: (source: string, options: Record<string, unknown>) => Promise<string>;
}

type FormatResult = 'formatted' | 'unconfigured' | 'failed';

const FORMATTED_HINT = 'formatted with Prettier';
const UNFORMATTED_HINT = 'no Prettier config found; files use 4-space indentation and single quotes';

function isPrettier(value: unknown): value is Prettier {
    return (
        typeof value === 'object' &&
        value !== null &&
        'resolveConfig' in value &&
        typeof value.resolveConfig === 'function' &&
        'format' in value &&
        typeof value.format === 'function'
    );
}

function loadProjectPrettier(cwd: string): Prettier | undefined {
    try {
        const module: unknown = createRequire(join(cwd, 'package.json'))('prettier');
        return isPrettier(module) ? module : undefined;
    } catch {
        return undefined;
    }
}

async function formatFile(prettier: Prettier, path: string): Promise<FormatResult> {
    const config = await prettier.resolveConfig(path);
    if (config === null) return 'unconfigured';
    const source = await readFile(path, 'utf8');
    await writeFile(path, await prettier.format(source, { ...config, filepath: path }));
    return 'formatted';
}

async function tryFormatFile(prettier: Prettier, cwd: string, path: string, context: CliContext): Promise<FormatResult> {
    try {
        return await formatFile(prettier, path);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        context.stderr(`warning: could not format ${displayPath(cwd, path)}: ${reason}`);
        return 'failed';
    }
}

function hintFor(results: readonly FormatResult[]): string | undefined {
    if (results.includes('formatted')) return FORMATTED_HINT;
    return results.includes('failed') ? undefined : UNFORMATTED_HINT;
}

/**
 * Formats the files just written with the project's own Prettier, when it has one.
 * Never fails the command; returns the hint line to print, if any.
 */
async function formatWrittenFiles(
    cwd: string,
    records: readonly WriteRecord[],
    context: CliContext,
): Promise<string | undefined> {
    const paths = records.filter(({ outcome }) => outcome !== 'skipped').map(({ path }) => path);
    if (paths.length === 0) return undefined;

    const prettier = loadProjectPrettier(cwd);
    const results: FormatResult[] = [];
    for (const path of paths) {
        results.push(prettier === undefined ? 'unconfigured' : await tryFormatFile(prettier, cwd, path, context));
    }
    return hintFor(results);
}

/** The report of what was written, after formatting the files unless `format` is off. */
export async function reportWrites(
    cwd: string,
    records: readonly WriteRecord[],
    context: CliContext,
    format: boolean,
): Promise<string> {
    const hint = format ? await formatWrittenFiles(cwd, records, context) : undefined;
    return [formatWrites(cwd, records), hint].filter(Boolean).join('\n');
}
