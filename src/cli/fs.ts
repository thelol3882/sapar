import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CliError } from './errors';
import { toForwardSlashes } from './paths';

export type WriteOutcome = 'created' | 'overwritten' | 'skipped';

export interface WriteRecord {
    path: string;
    outcome: WriteOutcome;
}

export function isNotFound(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function statOrUndefined(path: string) {
    try {
        return await stat(path);
    } catch (error) {
        if (isNotFound(error)) return undefined;
        throw error;
    }
}

export async function pathExists(path: string): Promise<boolean> {
    return (await statOrUndefined(path)) !== undefined;
}

export async function isDirectory(path: string): Promise<boolean> {
    return (await statOrUndefined(path))?.isDirectory() ?? false;
}

/** Writes `content` unless the file exists and `force` is off. */
export async function writeFileSafely(path: string, content: string, force: boolean): Promise<WriteRecord> {
    const existed = await pathExists(path);
    if (existed && !force) return { path, outcome: 'skipped' };
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    return { path, outcome: existed ? 'overwritten' : 'created' };
}

/** `undefined` when the file does not exist. */
export async function readJsonObject(path: string): Promise<Record<string, unknown> | undefined> {
    let text: string;
    try {
        text = await readFile(path, 'utf8');
    } catch (error) {
        if (isNotFound(error)) return undefined;
        throw error;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new CliError(`${toForwardSlashes(path)} is not valid JSON.`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new CliError(`${toForwardSlashes(path)} must contain a JSON object.`);
    }
    return Object.fromEntries(Object.entries(parsed));
}
