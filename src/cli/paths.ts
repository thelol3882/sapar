import * as nodePath from 'node:path';
import type { PlatformPath } from 'node:path';

type PathModule = Pick<PlatformPath, 'join' | 'relative' | 'sep'>;

/** Printed paths and reports use `/` on every OS, matching the docs and the tests. */
export function toForwardSlashes(path: string, { sep }: Pick<PlatformPath, 'sep'> = nodePath): string {
    return path.split(sep).join('/');
}

export function displayPath(from: string, to: string, pathModule: PathModule = nodePath): string {
    return toForwardSlashes(pathModule.relative(from, to), pathModule);
}

export function displayJoin(segments: readonly string[], pathModule: PathModule = nodePath): string {
    return toForwardSlashes(pathModule.join(...segments), pathModule);
}
