import { join } from 'node:path';
import type { Platform } from '../core/types';
import { platformOf } from './config';
import type { Framework, Source, Style } from './config';
import { CliError } from './errors';
import { isDirectory, readJsonObject } from './fs';
import { toForwardSlashes } from './paths';

export interface ProjectInfo {
    dependencies: ReadonlySet<string>;
    hasSrcDir: boolean;
}

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies'];

function dependencyNames(manifest: Record<string, unknown>): string[] {
    return DEPENDENCY_FIELDS.flatMap((field) => {
        const entries = manifest[field];
        return typeof entries === 'object' && entries !== null ? Object.keys(entries) : [];
    });
}

export async function readProject(cwd: string): Promise<ProjectInfo> {
    const manifest = await readJsonObject(join(cwd, 'package.json'));
    if (manifest === undefined) throw new CliError(`No package.json in ${toForwardSlashes(cwd)}. Run this from your project root.`);
    return {
        dependencies: new Set(dependencyNames(manifest)),
        hasSrcDir: await isDirectory(join(cwd, 'src')),
    };
}

export function detectFramework({ dependencies }: ProjectInfo): Framework {
    if (dependencies.has('next')) return 'next';
    if (dependencies.has('expo')) return 'expo';
    return 'react';
}

export function detectStyle({ dependencies }: ProjectInfo, framework: Framework): Style {
    if (framework === 'expo') return 'native';
    return dependencies.has('@mantine/core') ? 'mantine' : 'tailwind';
}

export function detectSource({ dependencies }: ProjectInfo): Source {
    return dependencies.has('@reduxjs/toolkit') ? 'rtk' : 'memory';
}

export function defaultDirectories({ hasSrcDir }: ProjectInfo): { componentsDir: string; toursDir: string } {
    const base = hasSrcDir ? 'src/' : '';
    return { componentsDir: `${base}components/tours`, toursDir: `${base}tours` };
}

export function defaultPlatforms({ hasSrcDir }: ProjectInfo, framework: Framework): Record<Platform, string[]> {
    const roots = [hasSrcDir ? 'src' : '.'];
    const platform = platformOf(framework);
    return { web: platform === 'web' ? roots : [], native: platform === 'native' ? roots : [] };
}
