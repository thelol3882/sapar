import { describe, expect, it } from 'vitest';
import { makeTour } from './fixtures';
import { findMissingAnchors, requiresNavigation } from './steps';
import { createTestAdapter } from './testing';

function steps(...specs: Array<[key: string, anchor?: string, route?: string]>) {
    return makeTour('t', {
        steps: specs.map(([key, anchor, route]) => ({ key, title: key, body: key, anchor, route })),
    }).steps;
}

describe('findMissingAnchors', () => {
    it('peeks every anchored step with a zero timeout and returns the missing keys in order', async () => {
        const adapter = createTestAdapter({ anchors: ['one', 'three'] });

        const missing = await findMissingAnchors(steps(['a', 'one'], ['b', 'two'], ['c', 'three'], ['d', 'four']), adapter, []);

        expect(missing).toEqual(['b', 'd']);
        expect(adapter.resolveRequests).toEqual([
            { key: 'one', timeoutMs: 0 },
            { key: 'two', timeoutMs: 0 },
            { key: 'three', timeoutMs: 0 },
            { key: 'four', timeoutMs: 0 },
        ]);
    });

    it('never peeks centered steps', async () => {
        const adapter = createTestAdapter();

        expect(await findMissingAnchors(steps(['a']), adapter, [])).toEqual([]);
        expect(adapter.resolveRequests).toEqual([]);
    });

    it('cannot tell steps on another route and treats them as present', async () => {
        const adapter = createTestAdapter({ route: '/' });

        const missing = await findMissingAnchors(steps(['a', 'one', '/other'], ['b', 'two', '/']), adapter, []);

        expect(missing).toEqual(['b']);
        expect(adapter.resolveRequests).toEqual([{ key: 'two', timeoutMs: 0 }]);
    });
});

describe('requiresNavigation', () => {
    const [onRoute, elsewhere, anywhere] = steps(['a', undefined, '/ru/settings/?x=1'], ['b', undefined, '/billing'], ['c']);

    it('compares normalized routes', () => {
        const adapter = createTestAdapter({ route: '/settings' });

        expect(requiresNavigation(onRoute!, adapter, ['ru'])).toBe(false);
        expect(requiresNavigation(elsewhere!, adapter, ['ru'])).toBe(true);
    });

    it('never navigates for a step without a route', () => {
        expect(requiresNavigation(anywhere!, createTestAdapter(), [])).toBe(false);
    });
});
