import type { Platform } from '../../core/types';

export interface Located<Value> {
    value: Value;
    line: number;
}

export interface FoundStep {
    key?: Located<string>;
    anchor?: Located<string>;
    route?: Located<string>;
}

export interface FoundTour {
    line: number;
    key?: Located<string>;
    triggerRoute?: Located<string>;
    /** Absent when the tour does not say, or says it in a way the scan cannot read. */
    platforms?: string[];
    steps: FoundStep[];
}

export interface DefinitionFindings {
    catalogue: Located<string>[];
    tours: FoundTour[];
    /** Values that are not string literals; `value` is the explanation. */
    unverifiable: Located<string>[];
}

export interface ScannedFile extends DefinitionFindings {
    /** Relative to the project root. */
    path: string;
    /** Empty for files outside the platform roots (the tours directory). */
    platforms: Platform[];
    anchorUses: Located<string>[];
}

export interface ProjectScan {
    files: ScannedFile[];
    /** Configured roots that are not directories. */
    missingRoots: string[];
}
