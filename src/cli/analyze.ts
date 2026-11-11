import { KEY_PATTERN } from '../core/define';
import { isValidRoutePattern } from '../core/routes';
import type { Platform } from '../core/types';
import { PLATFORMS, isPlatform } from './config';
import type { SaparConfig } from './config';
import type { CheckReport, Finding } from './report';
import type { FoundTour, Located, ProjectScan } from './scan/model';
import { closestMatches, didYouMean } from './suggest';


interface Place {
    file: string;
    line: number;
}

interface KeyedPlace extends Place {
    key: string;
}

interface LocatedTour extends FoundTour {
    file: string;
}

interface Analysis {
    scan: ProjectScan;
    config: SaparConfig;
    tours: LocatedTour[];
    catalogue: KeyedPlace[];
    uses: KeyedPlace[];
    declarations: Record<Platform, Map<string, KeyedPlace[]>>;
    filesByPlatform: Record<Platform, number>;
}

const at = ({ file, line }: Place): Place => ({ file, line });

const describeTour = (tour: FoundTour): string => (tour.key ? `tour "${tour.key.value}"` : 'a tour');

function keyedPlaces(file: string, located: readonly Located<string>[]): KeyedPlace[] {
    return located.map(({ value, line }) => ({ key: value, file, line }));
}

type NonEmpty<Item> = [Item, ...Item[]];

function groupBy<Item>(items: readonly Item[], keyOf: (item: Item) => string): NonEmpty<Item>[] {
    const groups = new Map<string, NonEmpty<Item>>();
    for (const item of items) {
        const group = groups.get(keyOf(item));
        if (group) group.push(item);
        else groups.set(keyOf(item), [item]);
    }
    return [...groups.values()];
}

const perPlatform = <Value>(build: (platform: Platform) => Value): Record<Platform, Value> => ({
    web: build('web'),
    native: build('native'),
});

function declarationsOn(scan: ProjectScan, platform: Platform): Map<string, KeyedPlace[]> {
    const places = scan.files
        .filter((file) => file.platforms.includes(platform))
        .flatMap((file) => keyedPlaces(file.path, file.anchorUses));
    return new Map(groupBy(places, ({ key }) => key).map((group) => [group[0].key, group]));
}

function buildAnalysis(scan: ProjectScan, config: SaparConfig): Analysis {
    return {
        scan,
        config,
        tours: scan.files.flatMap((file) => file.tours.map((tour) => ({ ...tour, file: file.path }))),
        catalogue: scan.files.flatMap((file) => keyedPlaces(file.path, file.catalogue)),
        uses: scan.files.flatMap((file) => keyedPlaces(file.path, file.anchorUses)),
        declarations: perPlatform((platform) => declarationsOn(scan, platform)),
        filesByPlatform: perPlatform((platform) => scan.files.filter((file) => file.platforms.includes(platform)).length),
    };
}

function targetedPlatforms(tour: FoundTour, config: SaparConfig): Platform[] {
    return tour.platforms?.filter(isPlatform) ?? PLATFORMS.filter((platform) => config.platforms[platform].length > 0);
}

interface Occurrence extends KeyedPlace {
    description: string;
    /** Trailing words that say where it was found, such as ` in tour "welcome"`. */
    context: string;
}

function occurrence(file: string, description: string, located: Located<string> | undefined, context = ''): Occurrence[] {
    return located ? [{ key: located.value, file, line: located.line, description, context }] : [];
}

function tourKeyOccurrences({ tours }: Analysis): Occurrence[] {
    return tours.flatMap((tour) => {
        const context = ` in ${describeTour(tour)}`;
        return [
            ...occurrence(tour.file, 'tour key', tour.key),
            ...tour.steps.flatMap((step) => [
                ...occurrence(tour.file, 'step key', step.key, context),
                ...occurrence(tour.file, 'step anchor', step.anchor, context),
            ]),
        ];
    });
}

function invalidKeyFindings(analysis: Analysis): Finding[] {
    const occurrences = [
        ...tourKeyOccurrences(analysis),
        ...analysis.catalogue.map((entry) => ({ ...entry, description: 'catalogue anchor', context: '' })),
        ...analysis.uses.map((use) => ({ ...use, description: 'declared anchor', context: '' })),
    ];
    return occurrences
        .filter(({ key }) => !KEY_PATTERN.test(key))
        .map((entry) => ({
            code: 'key_invalid',
            message: `Invalid ${entry.description} "${entry.key}"${entry.context}: use lowercase letters, digits and underscores, dot-separated.`,
            ...at(entry),
        }));
}

function invalidRouteFindings({ tours }: Analysis): Finding[] {
    return tours
        .flatMap((tour) => [
            ...occurrence(tour.file, 'trigger route', tour.triggerRoute, ` of ${describeTour(tour)}`),
            ...tour.steps.flatMap((step) => occurrence(tour.file, 'step route', step.route, ` in ${describeTour(tour)}`)),
        ])
        .filter(({ key }) => !isValidRoutePattern(key))
        .map((entry) => ({
            code: 'route_invalid',
            message: `Invalid ${entry.description} "${entry.key}"${entry.context}: use a path, a prefix ending in /*, or *.`,
            ...at(entry),
        }));
}

function duplicateFindings(code: string, what: string, places: readonly KeyedPlace[]): Finding[] {
    return groupBy(places, ({ key }) => key)
        .filter((group) => group.length > 1)
        .flatMap(([first, ...repeats]) =>
            repeats.map((repeat) => ({
                code,
                message: `Duplicate ${what}: "${repeat.key}" (first at ${first.file}:${first.line}).`,
                ...at(repeat),
            })),
        );
}

function duplicateTourFindings({ tours }: Analysis): Finding[] {
    const places = tours.flatMap((tour) => occurrence(tour.file, 'tour key', tour.key));
    return duplicateFindings('tour_duplicate', 'tour key', places);
}

function duplicateStepFindings({ tours }: Analysis): Finding[] {
    return tours.flatMap((tour) =>
        duplicateFindings(
            'step_duplicate',
            `step key in ${describeTour(tour)}`,
            tour.steps.flatMap((step) => occurrence(tour.file, 'step key', step.key)),
        ),
    );
}

function missingAnchorFinding(analysis: Analysis, tour: LocatedTour, anchor: Located<string>, platform: Platform): Finding {
    const declaredHere = analysis.declarations[platform];
    const elsewhere = PLATFORMS.filter((other) => other !== platform && analysis.declarations[other].has(anchor.value));
    const suggestions = closestMatches(anchor.value, declaredHere.keys());
    const message = [
        `In ${describeTour(tour)}: anchor "${anchor.value}" is not declared on ${platform}.`,
        elsewhere.length > 0 ? `It is declared on ${elsewhere.join(', ')}.` : '',
        didYouMean(suggestions),
    ];
    return { code: 'anchor_missing', message: message.filter(Boolean).join(' '), file: tour.file, line: anchor.line, suggestions };
}

function missingAnchorFindings(analysis: Analysis): Finding[] {
    return analysis.tours.flatMap((tour) =>
        targetedPlatforms(tour, analysis.config)
            .filter((platform) => analysis.filesByPlatform[platform] > 0)
            .flatMap((platform) =>
                tour.steps.flatMap(({ anchor }) =>
                    anchor && !analysis.declarations[platform].has(anchor.value)
                        ? [missingAnchorFinding(analysis, tour, anchor, platform)]
                        : [],
                ),
            ),
    );
}

function uncataloguedFindings({ catalogue, uses }: Analysis): Finding[] {
    const known = new Set(catalogue.map(({ key }) => key));
    if (known.size === 0) return [];
    return uses
        .filter(({ key }) => !known.has(key))
        .map((use) => {
            const suggestions = closestMatches(use.key, known);
            const message = `Anchor "${use.key}" is declared here but missing from defineAnchors([...]). ${didYouMean(suggestions)}`;
            return { code: 'anchor_uncatalogued', message: message.trim(), ...at(use), suggestions };
        });
}

function missingRootFindings({ scan }: Analysis): Finding[] {
    return scan.missingRoots.map((root) => ({
        code: 'source_root_missing',
        message: `Scan root "${root}" from sapar.json is not a directory.`,
    }));
}

function unreadableFindings({ scan }: Analysis): Finding[] {
    return scan.files.flatMap((file) =>
        file.unverifiable.map(({ value, line }) => ({ code: 'value_unverifiable', message: value, file: file.path, line })),
    );
}

function undeclaredCatalogueFindings({ catalogue, uses }: Analysis): Finding[] {
    const used = new Set(uses.map(({ key }) => key));
    return catalogue
        .filter(({ key }) => !used.has(key))
        .map((entry) => ({
            code: 'anchor_undeclared',
            message: `Anchor "${entry.key}" is in defineAnchors([...]) but no element declares it.`,
            ...at(entry),
        }));
}

function duplicateDeclarationFindings({ declarations }: Analysis): Finding[] {
    return PLATFORMS.flatMap((platform) =>
        duplicateFindings('anchor_duplicate', `anchor on ${platform}`, [...declarations[platform].values()].flat()),
    );
}

function platformFindings({ scan, config, tours, filesByPlatform }: Analysis): Finding[] {
    if (scan.files.length === 0) {
        return [
            {
                code: 'nothing_scanned',
                message: 'Scanned 0 files, so sapar check did not verify anything. Check "platforms" and "toursDir" in sapar.json.',
            },
        ];
    }
    const explicitTargets = new Set(tours.flatMap((tour) => tour.platforms ?? []));
    return PLATFORMS.filter(
        (platform) =>
            filesByPlatform[platform] === 0 && (config.platforms[platform].length > 0 || explicitTargets.has(platform)),
    ).map((platform) => ({
        code: 'platform_unverified',
        message:
            config.platforms[platform].length === 0
                ? `"platforms.${platform}" in sapar.json has no scan roots, so tours targeting ${platform} were not verified.`
                : `No source files found under ${config.platforms[platform].join(', ')}, so nothing was verified for ${platform}.`,
    }));
}

function unusedAnchorFindings({ tours, uses }: Analysis): Finding[] {
    const inTours = new Set(tours.flatMap((tour) => tour.steps.flatMap((step) => step.anchor?.value ?? [])));
    return groupBy(uses, ({ key }) => key)
        .filter(([first]) => !inTours.has(first.key))
        .map(([first]) => ({
            code: 'anchor_unused',
            message: `Anchor "${first.key}" is declared but no tour uses it.`,
            ...at(first),
        }));
}

export function analyze(scan: ProjectScan, config: SaparConfig, { verbose }: { verbose: boolean }): CheckReport {
    const analysis = buildAnalysis(scan, config);
    return {
        errors: [
            ...missingRootFindings(analysis),
            ...invalidKeyFindings(analysis),
            ...invalidRouteFindings(analysis),
            ...duplicateTourFindings(analysis),
            ...duplicateStepFindings(analysis),
            ...missingAnchorFindings(analysis),
            ...uncataloguedFindings(analysis),
        ],
        warnings: [
            ...platformFindings(analysis),
            ...undeclaredCatalogueFindings(analysis),
            ...duplicateDeclarationFindings(analysis),
            ...unreadableFindings(analysis),
        ],
        info: verbose ? unusedAnchorFindings(analysis) : [],
        stats: {
            files: scan.files.length,
            filesByPlatform: analysis.filesByPlatform,
            tours: analysis.tours.length,
            anchorsDeclared: analysis.uses.length,
            anchorsCatalogued: analysis.catalogue.length,
        },
    };
}
