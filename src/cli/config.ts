import { join } from 'node:path';
import type { Platform } from '../core/types';
import { CliError } from './errors';
import { readJsonObject, writeFileSafely } from './fs';
import { toForwardSlashes } from './paths';
import type { WriteRecord } from './fs';

export const FRAMEWORKS = ['next', 'expo', 'react'] as const;
export const STYLES = ['tailwind', 'mantine', 'native'] as const;
export const SOURCES = ['memory', 'http', 'rtk'] as const;
export const PLATFORMS: readonly Platform[] = ['web', 'native'];

export type Framework = (typeof FRAMEWORKS)[number];
export type Style = (typeof STYLES)[number];
export type Source = (typeof SOURCES)[number];

export interface SaparConfig {
    framework: Framework;
    style: Style;
    source: Source;
    componentsDir: string;
    toursDir: string;
    /** The package name, or the alias of a copied `src` folder such as `@/shared/tours`. */
    importBase: string;
    /** Anchor scan roots per platform, relative to the project root. */
    platforms: Record<Platform, string[]>;
}

export const CONFIG_FILE = 'sapar.json';

export const platformOf = (framework: Framework): Platform => (framework === 'expo' ? 'native' : 'web');

export const isPlatform = (value: string): value is Platform => (PLATFORMS as readonly string[]).includes(value);

export function parseChoice<Choice extends string>(
    label: string,
    value: string,
    choices: readonly Choice[],
): Choice {
    const match = choices.find((choice) => choice === value);
    if (match === undefined) throw new CliError(`Invalid ${label}: expected one of ${choices.join(', ')}, got "${value}".`);
    return match;
}

function readChoice<Choice extends string>(raw: Record<string, unknown>, field: string, choices: readonly Choice[]): Choice {
    return parseChoice(`"${field}" in ${CONFIG_FILE}`, String(raw[field]), choices);
}

function readString(raw: Record<string, unknown>, field: string): string {
    const value = raw[field];
    if (typeof value !== 'string' || value.trim() === '') {
        throw new CliError(`"${field}" in ${CONFIG_FILE} must be a non-empty string.`);
    }
    return value;
}

function readRoots(platforms: Record<string, unknown>, platform: Platform): string[] {
    const roots = platforms[platform] ?? [];
    if (!Array.isArray(roots) || roots.some((root) => typeof root !== 'string')) {
        throw new CliError(`"platforms.${platform}" in ${CONFIG_FILE} must be an array of directories.`);
    }
    return roots.map(String);
}

function readPlatforms(raw: Record<string, unknown>): Record<Platform, string[]> {
    const { platforms } = raw;
    if (typeof platforms !== 'object' || platforms === null || Array.isArray(platforms)) {
        throw new CliError(`"platforms" in ${CONFIG_FILE} must be an object such as { "web": ["src"], "native": [] }.`);
    }
    const roots = Object.fromEntries(Object.entries(platforms));
    return { web: readRoots(roots, 'web'), native: readRoots(roots, 'native') };
}

export function assertStyleMatchesFramework(framework: Framework, style: Style): void {
    if ((framework === 'expo') !== (style === 'native')) {
        throw new CliError('The "native" style goes with the "expo" framework, and only with it.');
    }
}

export function validateConfig(raw: Record<string, unknown>): SaparConfig {
    const framework = readChoice(raw, 'framework', FRAMEWORKS);
    const style = readChoice(raw, 'style', STYLES);
    assertStyleMatchesFramework(framework, style);
    return {
        framework,
        style,
        source: readChoice(raw, 'source', SOURCES),
        componentsDir: readString(raw, 'componentsDir'),
        toursDir: readString(raw, 'toursDir'),
        importBase: readString(raw, 'importBase'),
        platforms: readPlatforms(raw),
    };
}

export async function readConfig(cwd: string): Promise<SaparConfig> {
    const raw = await readJsonObject(join(cwd, CONFIG_FILE));
    if (raw === undefined) throw new CliError(`No ${CONFIG_FILE} in ${toForwardSlashes(cwd)}. Run \`sapar init\` first.`);
    return validateConfig(raw);
}

export function writeConfig(cwd: string, config: SaparConfig, force: boolean): Promise<WriteRecord> {
    return writeFileSafely(join(cwd, CONFIG_FILE), `${JSON.stringify(config, null, 4)}\n`, force);
}
