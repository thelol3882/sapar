const MAX_SUGGESTIONS = 3;

export function editDistance(a: string, b: string): number {
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let row = 1; row <= a.length; row++) {
        const current = [row];
        for (let column = 1; column <= b.length; column++) {
            const substitution = previous[column - 1]! + (a[row - 1] === b[column - 1] ? 0 : 1);
            current.push(Math.min(substitution, previous[column]! + 1, current[column - 1]! + 1));
        }
        previous = current;
    }
    return previous[b.length]!;
}

function distanceBetween(target: string, candidate: string): number {
    const [shorter, longer] = target.length <= candidate.length ? [target, candidate] : [candidate, target];
    return longer.includes(shorter) ? 0 : editDistance(target, candidate);
}

/** Near misses of `target`: typos, and names that contain it (`billing.upgrade` for `billing.upgrade_button`). */
export function closestMatches(target: string, candidates: Iterable<string>): string[] {
    const maxDistance = Math.max(2, Math.floor(target.length / 3));
    return [...candidates]
        .map((candidate) => ({ candidate, distance: distanceBetween(target.toLowerCase(), candidate.toLowerCase()) }))
        .filter(({ distance }) => distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate))
        .slice(0, MAX_SUGGESTIONS)
        .map(({ candidate }) => candidate);
}

export function didYouMean(suggestions: readonly string[]): string {
    return suggestions.length > 0 ? `Did you mean ${suggestions.map((key) => `"${key}"`).join(' or ')}?` : '';
}
