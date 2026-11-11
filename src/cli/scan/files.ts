import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Platform } from '../../core/types';
import { PLATFORMS } from '../config';
import type { SaparConfig } from '../config';
import { isDirectory } from '../fs';
import { displayPath } from '../paths';

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage']);
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const TEST_FILE = /\.test\./;

export interface DiscoveredFile {
    /** Relative to the project root. */
    path: string;
    platforms: Platform[];
}

export interface Discovery {
    files: DiscoveredFile[];
    missingRoots: string[];
}

interface ScanRoot {
    directory: string;
    platform?: Platform;
}

function isScannedDirectory(name: string): boolean {
    return !name.startsWith('.') && !SKIPPED_DIRECTORIES.has(name);
}

async function listSourceFiles(directory: string): Promise<string[]> {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    const nested = await Promise.all(
        entries.map(async (entry) => {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) return isScannedDirectory(entry.name) ? listSourceFiles(path) : [];
            const isSource = entry.isFile() && SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name);
            return isSource ? [path] : [];
        }),
    );
    return nested.flat();
}

/** Platform roots, plus the tours directory so definitions are found wherever the anchors live. */
function scanRoots(config: SaparConfig): ScanRoot[] {
    return [
        ...PLATFORMS.flatMap((platform) => config.platforms[platform].map((directory) => ({ directory, platform }))),
        { directory: config.toursDir },
    ];
}

export async function discoverSourceFiles(cwd: string, config: SaparConfig): Promise<Discovery> {
    const platformsByFile = new Map<string, Set<Platform>>();
    const missingRoots: string[] = [];

    for (const { directory, platform } of scanRoots(config)) {
        const absolute = resolve(cwd, directory);
        if (!(await isDirectory(absolute))) {
            missingRoots.push(directory);
            continue;
        }
        for (const file of await listSourceFiles(absolute)) {
            const platforms = platformsByFile.get(file) ?? new Set<Platform>();
            if (platform !== undefined) platforms.add(platform);
            platformsByFile.set(file, platforms);
        }
    }

    const files = [...platformsByFile].map(([file, platforms]) => ({
        path: displayPath(cwd, file),
        platforms: [...platforms],
    }));
    return { files, missingRoots };
}
