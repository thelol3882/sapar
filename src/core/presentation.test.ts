import { describe, expect, it } from 'vitest';
import { resolvePresentation, type Presentation } from './presentation';

const resolve = (presentation: Presentation, compact: boolean, fits: boolean | undefined) =>
    resolvePresentation({ presentation, compact, fits });

describe('resolvePresentation', () => {
    it.each([true, false])('is always anchored when asked, even if compact is %s and the card does not fit', (compact) => {
        expect(resolve('anchored', compact, false)).toBe('anchored');
    });

    it.each([true, false])('is always a sheet when asked, even if compact is %s and the card fits', (compact) => {
        expect(resolve('sheet', compact, true)).toBe('sheet');
    });

    describe('auto', () => {
        it('is anchored while the card is unmeasured', () => {
            expect(resolve('auto', false, undefined)).toBe('anchored');
        });

        it('is anchored when the card fits', () => {
            expect(resolve('auto', false, true)).toBe('anchored');
        });

        it('is a sheet when the card does not fit', () => {
            expect(resolve('auto', false, false)).toBe('sheet');
        });

        it('is a sheet in a compact window, fit or not', () => {
            expect(resolve('auto', true, true)).toBe('sheet');
            expect(resolve('auto', true, undefined)).toBe('sheet');
        });
    });
});
