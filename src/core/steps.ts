import { normalizeRoute } from './routes';
import type { PlatformAdapter, TourStep } from './types';

export const DEFAULT_ANCHOR_TIMEOUT_MS = 3000;
export const DEFAULT_PRESENT_ANCHOR_TIMEOUT_MS = 300;
export const DEFAULT_AUTO_START_TIMEOUT_MS = 10_000;

export function requiresNavigation(
    step: TourStep,
    adapter: PlatformAdapter,
    locales: readonly string[],
): step is TourStep & { route: string } {
    if (step.route === undefined) return false;
    return normalizeRoute(step.route, locales) !== normalizeRoute(adapter.currentRoute(), locales);
}

/**
 * Keys of the steps whose anchor is not on the page right now. Steps on another route cannot be told from here
 * and count as present.
 */
export async function findMissingAnchors(
    steps: readonly TourStep[],
    adapter: PlatformAdapter,
    locales: readonly string[],
): Promise<string[]> {
    async function isMissing(step: TourStep): Promise<boolean> {
        if (step.anchor === undefined || requiresNavigation(step, adapter, locales)) return false;
        return (await adapter.resolveAnchor(step.anchor, { timeoutMs: 0 })) === null;
    }

    const missing = await Promise.all(steps.map(isMissing));
    return steps.filter((_, index) => missing[index]).map((step) => step.key);
}
