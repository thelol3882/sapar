// Parity port of the backend's routes.py; keep the two in lockstep.

export function normalizeRoute(route: string | null | undefined, locales: readonly string[]): string {
    const path = (route ?? '').split('#')[0]!.split('?')[0]!.trim();
    const segments = path.split('/').filter((segment) => segment !== '');
    if (segments.length > 0 && locales.includes(segments[0]!)) segments.shift();
    return `/${segments.join('/')}`;
}

export function routeMatches(pattern: string, route: string, locales: readonly string[]): boolean {
    const trimmed = pattern.trim();
    if (!pattern) return false;
    if (trimmed === '*') return true;

    const target = normalizeRoute(route, locales);
    if (trimmed.endsWith('/*')) {
        const prefix = normalizeRoute(trimmed.slice(0, -2), locales);
        return prefix === '/' || target === prefix || target.startsWith(`${prefix}/`);
    }
    return normalizeRoute(trimmed, locales) === target;
}

export function isValidRoutePattern(pattern: string): boolean {
    if (!pattern) return false;
    if (pattern === '*') return true;
    const body = pattern.endsWith('/*') ? pattern.slice(0, -2) : pattern;
    return !body.includes('*');
}
