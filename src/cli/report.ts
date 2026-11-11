import type { Platform } from '../core/types';
import type { WriteRecord } from './fs';
import { displayPath } from './paths';

export interface Finding {
    code: string;
    message: string;
    file?: string;
    line?: number;
    suggestions?: string[];
}

export interface CheckStats {
    files: number;
    filesByPlatform: Record<Platform, number>;
    tours: number;
    anchorsDeclared: number;
    anchorsCatalogued: number;
}

export interface CheckReport {
    errors: Finding[];
    warnings: Finding[];
    /** Only filled with `--verbose`. */
    info: Finding[];
    stats: CheckStats;
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

function formatFinding({ code, message, file, line }: Finding): string {
    const location = file === undefined ? '' : `${file}${line === undefined ? '' : `:${line}`}  `;
    return `  ${location}${message} [${code}]`;
}

function formatSection(title: string, findings: readonly Finding[]): string[] {
    return findings.length === 0 ? [] : [`${title} (${findings.length})`, ...findings.map(formatFinding), ''];
}

function formatSummary({ errors, warnings, stats }: CheckReport): string {
    const problems =
        errors.length + warnings.length === 0
            ? 'No problems found.'
            : `Found ${plural(errors.length, 'error')} and ${plural(warnings.length, 'warning')}.`;
    return `${problems} Scanned ${plural(stats.files, 'file')} and ${plural(stats.tours, 'tour')}.`;
}

export function formatCheckText(report: CheckReport): string {
    return [
        ...formatSection('Errors', report.errors),
        ...formatSection('Warnings', report.warnings),
        ...formatSection('Info', report.info),
        formatSummary(report),
    ].join('\n');
}

export const formatCheckJson = (report: CheckReport): string => JSON.stringify(report, null, 2);

export function formatWrites(cwd: string, records: readonly WriteRecord[]): string {
    return records
        .map(({ path, outcome }) => {
            const note = outcome === 'skipped' ? ' (already exists; use --force to overwrite)' : '';
            return `${outcome.padEnd(11)} ${displayPath(cwd, path)}${note}`;
        })
        .join('\n');
}
