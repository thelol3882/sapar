import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from './errors';
import { isDirectory, readJsonObject } from './fs';
import { toForwardSlashes } from './paths';

export interface PackageInfo {
    root: string;
    name: string;
    version: string;
}

/** Walks up from this module, so it works from `src/cli` and from the bundled `dist/cli`. */
async function findPackageRoot(directory: string): Promise<string> {
    if (await isDirectory(join(directory, 'templates'))) return directory;
    const parent = dirname(directory);
    if (parent === directory) throw new CliError('Cannot locate the package templates directory.');
    return findPackageRoot(parent);
}

export async function readPackageInfo(): Promise<PackageInfo> {
    const root = await findPackageRoot(dirname(fileURLToPath(import.meta.url)));
    const manifest = await readJsonObject(join(root, 'package.json'));
    const { name, version } = manifest ?? {};
    if (typeof name !== 'string' || typeof version !== 'string') {
        throw new CliError(`${toForwardSlashes(join(root, 'package.json'))} has no name and version.`);
    }
    return { root, name, version };
}
