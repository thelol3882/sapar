import { describe, expect, it } from 'vitest';
import { measureElement } from './measure';

describe('measureElement', () => {
    it('returns null without an element', () => {
        expect(measureElement(null)).toBeNull();
    });

    it('measures a connected element', () => {
        const element = document.createElement('div');
        document.body.append(element);

        expect(measureElement(element)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
        element.remove();
    });

    it('returns null for a detached element instead of an all-zero rect', () => {
        const element = document.createElement('div');
        document.body.append(element);
        element.remove();

        expect(measureElement(element)).toBeNull();
    });
});
