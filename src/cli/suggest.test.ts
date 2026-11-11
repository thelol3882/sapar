// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { closestMatches, editDistance } from './suggest';

describe('editDistance', () => {
    it('counts single-character edits', () => {
        expect(editDistance('kitten', 'sitting')).toBe(3);
        expect(editDistance('', 'abc')).toBe(3);
        expect(editDistance('same', 'same')).toBe(0);
    });
});

describe('closestMatches', () => {
    it('suggests typos and containing names, nearest first', () => {
        const candidates = ['billing.upgrade_button', 'billing.upgrde', 'nav.home'];
        expect(closestMatches('billing.upgrade', candidates)).toEqual(['billing.upgrade_button', 'billing.upgrde']);
    });

    it('ignores unrelated names', () => {
        expect(closestMatches('billing.upgrade', ['nav.home'])).toEqual([]);
    });
});
