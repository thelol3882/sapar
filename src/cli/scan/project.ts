import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SaparConfig } from '../config';
import { findAnchorUses } from './anchors';
import type { Typescript } from './ast';
import { createSourceContext } from './constants';
import { findDefinitions } from './definitions';
import { discoverSourceFiles } from './files';
import type { ProjectScan, ScannedFile } from './model';

async function scanFile(typescript: Typescript, cwd: string, path: string): Promise<Omit<ScannedFile, 'path' | 'platforms'>> {
    const text = await readFile(join(cwd, path), 'utf8');
    const context = createSourceContext(typescript, path, text);
    return { anchorUses: findAnchorUses(context), ...findDefinitions(context) };
}

export async function scanProject(typescript: Typescript, cwd: string, config: SaparConfig): Promise<ProjectScan> {
    const { files: discovered, missingRoots } = await discoverSourceFiles(cwd, config);
    const files: ScannedFile[] = [];
    for (const file of discovered) {
        files.push({ ...file, ...(await scanFile(typescript, cwd, file.path)) });
    }
    return { files, missingRoots };
}
