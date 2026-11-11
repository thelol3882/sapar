import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Style } from './config';
import { CliError } from './errors';
import { isNotFound, writeFileSafely } from './fs';
import type { WriteRecord } from './fs';
import { rewriteTemplateImports } from './imports';
import type { PackageInfo } from './packageInfo';
import { closestMatches, didYouMean } from './suggest';

const TEMPLATE_DIRECTORIES: Record<Style, string> = { tailwind: 'tailwind', mantine: 'mantine', native: 'expo' };
const TEMPLATE_FILE = /^(?!.*\.test\.)(.+)\.tsx$/;

export interface CopyTemplatesOptions {
    packageInfo: PackageInfo;
    style: Style;
    names: readonly string[];
    destination: string;
    importBase: string;
    force: boolean;
}

const templateDirectory = ({ root }: PackageInfo, style: Style): string =>
    join(root, 'templates', TEMPLATE_DIRECTORIES[style]);

export async function listTemplates(packageInfo: PackageInfo, style: Style): Promise<string[]> {
    let files: string[] = [];
    try {
        files = await readdir(templateDirectory(packageInfo, style));
    } catch (error) {
        if (!isNotFound(error)) throw error;
    }
    const names = files.flatMap((file) => TEMPLATE_FILE.exec(file)?.[1] ?? []).sort();
    if (names.length === 0) throw new CliError(`No templates are available for the "${style}" style.`);
    return names;
}

const comparable = (name: string): string => name.replace(/[-_]/g, '').toLowerCase();

function matchTemplateName(requested: string, available: readonly string[]): string {
    const match = available.find((name) => comparable(name) === comparable(requested));
    if (match !== undefined) return match;

    const message = [`Unknown component "${requested}".`, didYouMean(closestMatches(requested, available)), `Available: ${available.join(', ')}.`];
    throw new CliError(message.filter(Boolean).join(' '));
}

/** Case-insensitive, and kebab-case works too (`whats-new-panel`). */
export function matchTemplateNames(requested: readonly string[], available: readonly string[]): string[] {
    return [...new Set(requested.map((name) => matchTemplateName(name, available)))];
}

export async function copyTemplates(options: CopyTemplatesOptions): Promise<WriteRecord[]> {
    const { packageInfo, style, names, destination, importBase, force } = options;
    const records: WriteRecord[] = [];
    for (const name of names) {
        const source = await readFile(join(templateDirectory(packageInfo, style), `${name}.tsx`), 'utf8');
        const content = rewriteTemplateImports(source, importBase, packageInfo.name);
        records.push(await writeFileSafely(join(destination, `${name}.tsx`), content, force));
    }
    return records;
}
