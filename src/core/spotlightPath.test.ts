import { describe, expect, it } from 'vitest';
import { spotlightPath } from './spotlightPath';

const window = { width: 400, height: 800 };

describe('spotlightPath', () => {
    it('covers the whole window when there is nothing to highlight', () => {
        expect(spotlightPath({ rect: null, padding: 8, radius: 8, bounds: window })).toBe('M0,0 H400 V800 H0 Z');
    });

    it('cuts a padded rounded hole after the window rectangle', () => {
        const path = spotlightPath({ rect: { x: 100, y: 200, width: 50, height: 30 }, padding: 10, radius: 4, bounds: window });

        expect(path).toBe(
            'M0,0 H400 V800 H0 Z M94,190 H156 A4,4 0 0 1 160,194 V236 A4,4 0 0 1 156,240 H94 A4,4 0 0 1 90,236 V194 A4,4 0 0 1 94,190 Z',
        );
    });

    it('limits the radius to half the shortest side', () => {
        const path = spotlightPath({ rect: { x: 0, y: 0, width: 20, height: 20 }, padding: 0, radius: 99, bounds: window });

        expect(path).toContain('A10,10 0 0 1');
    });
});
