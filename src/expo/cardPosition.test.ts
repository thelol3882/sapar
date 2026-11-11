import { describe, expect, it } from 'vitest';
import type { AnchorRect, Placement } from '../core';
import { computeCardPosition, type CardPositionInput } from './cardPosition';

const WINDOW = { width: 400, height: 800 };
const CARD = { width: 200, height: 100 };
const INSETS = { top: 20, right: 10, bottom: 30, left: 10 };

function position(anchor: AnchorRect | null, overrides: Partial<CardPositionInput> = {}) {
    return computeCardPosition({ anchor, card: CARD, window: WINDOW, placement: 'bottom', offset: 12, insets: INSETS, ...overrides });
}

const middle: AnchorRect = { x: 150, y: 400, width: 100, height: 40 };

describe('computeCardPosition', () => {
    describe('placements', () => {
        it('puts the card below the anchor, centred on it', () => {
            expect(position(middle)).toEqual({ x: 100, y: 452, fits: true });
        });

        it('puts the card above the anchor', () => {
            expect(position(middle, { placement: 'top' })).toEqual({ x: 100, y: 288, fits: true });
        });

        it('puts the card right of the anchor, centred vertically', () => {
            const anchor = { x: 20, y: 400, width: 50, height: 40 };
            expect(position(anchor, { placement: 'right' })).toEqual({ x: 82, y: 370, fits: true });
        });

        it('puts the card left of the anchor, centred vertically', () => {
            const anchor = { x: 300, y: 400, width: 50, height: 40 };
            expect(position(anchor, { placement: 'left' })).toEqual({ x: 88, y: 370, fits: true });
        });

        it('honours the offset', () => {
            expect(position(middle, { offset: 30 }).y).toBe(470);
        });
    });

    describe('auto', () => {
        it('prefers below', () => {
            expect(position(middle, { placement: 'auto' }).y).toBe(452);
        });

        it('goes above when below does not fit', () => {
            const nearBottom = { x: 150, y: 700, width: 100, height: 40 };
            expect(position(nearBottom, { placement: 'auto' }).y).toBe(588);
        });

        it('stays below when neither side fits', () => {
            const tallCard = { width: 200, height: 700 };
            expect(position(middle, { placement: 'auto', card: tallCard }).y).toBe(70);
        });
    });

    describe('flipping', () => {
        it('flips a bottom placement to top without room below', () => {
            const nearBottom = { x: 150, y: 700, width: 100, height: 40 };
            expect(position(nearBottom).y).toBe(588);
        });

        it('flips a top placement to bottom without room above', () => {
            const nearTop = { x: 150, y: 40, width: 100, height: 40 };
            expect(position(nearTop, { placement: 'top' }).y).toBe(92);
        });

        it('flips a right placement to left without room on the right', () => {
            const nearRight = { x: 330, y: 400, width: 50, height: 40 };
            expect(position(nearRight, { placement: 'right' }).x).toBe(118);
        });

        it('flips a left placement to right without room on the left', () => {
            const nearLeft = { x: 20, y: 400, width: 50, height: 40 };
            expect(position(nearLeft, { placement: 'left' }).x).toBe(82);
        });

        it('keeps the preferred side when it fits exactly', () => {
            const exact = { x: 150, y: 800 - INSETS.bottom - 12 - CARD.height - 40, width: 100, height: 40 };
            expect(position(exact).y).toBe(exact.y + 40 + 12);
        });
    });

    describe('clamping', () => {
        it('keeps the card inside the left inset', () => {
            expect(position({ x: 0, y: 400, width: 20, height: 40 }).x).toBe(10);
        });

        it('keeps the card inside the right inset', () => {
            expect(position({ x: 380, y: 400, width: 20, height: 40 }).x).toBe(190);
        });

        it('keeps a side placement inside the vertical insets', () => {
            const high = { x: 20, y: 0, width: 50, height: 20 };
            expect(position(high, { placement: 'right' }).y).toBe(20);
            const low = { x: 20, y: 780, width: 50, height: 20 };
            expect(position(low, { placement: 'right' }).y).toBe(670);
        });

        it('respects safe-area insets on every edge', () => {
            const safe = { top: 60, right: 40, bottom: 80, left: 40 };
            expect(position({ x: 0, y: 400, width: 20, height: 40 }, { insets: safe }).x).toBe(40);
            expect(position({ x: 380, y: 400, width: 20, height: 40 }, { insets: safe }).x).toBe(160);
            const nearBottom = { x: 150, y: 700, width: 100, height: 40 };
            expect(position(nearBottom, { insets: safe }).y).toBe(588);
        });

        it('pins to the start inset when the card is wider than the free space', () => {
            const wide = { width: 500, height: 100 };
            expect(position(middle, { card: wide }).x).toBe(10);
        });
    });

    describe('without an anchor', () => {
        it('centres the card in the window', () => {
            expect(position(null)).toEqual({ x: 100, y: 350, fits: true });
        });

        it('centres within the free area when the insets are uneven', () => {
            const safe = { top: 100, right: 0, bottom: 0, left: 0 };
            expect(position(null, { insets: safe })).toEqual({ x: 100, y: 350, fits: true });
        });
    });

    describe('fits', () => {
        const fits = (anchor: AnchorRect | null, overrides: Partial<CardPositionInput> = {}) => position(anchor, overrides).fits;

        it('fits when the preferred side has room', () => {
            expect(fits(middle)).toBe(true);
        });

        it('fits when only the opposite side has room', () => {
            expect(fits({ x: 150, y: 700, width: 100, height: 40 })).toBe(true);
        });

        it('fits when the card exactly fills the free space', () => {
            const exact = { x: 150, y: 800 - INSETS.bottom - 12 - CARD.height - 40, width: 100, height: 40 };
            expect(fits(exact)).toBe(true);
        });

        it('does not fit when the card is taller than the space on either side', () => {
            expect(fits(middle, { card: { width: 200, height: 700 } })).toBe(false);
        });

        it('does not fit when the anchor fills the window', () => {
            expect(fits({ x: 0, y: 0, width: 400, height: 800 }, { placement: 'auto' })).toBe(false);
        });

        it('stops fitting when a tab bar in the bottom inset takes the room below', () => {
            const anchor = { x: 150, y: 300, width: 100, height: 40 };
            const card = { width: 200, height: 400 };

            expect(fits(anchor, { card })).toBe(true);
            expect(fits(anchor, { card, insets: { ...INSETS, bottom: 130 } })).toBe(false);
        });

        it('fits without an anchor', () => {
            expect(fits(null)).toBe(true);
        });
    });

    it.each<Placement>(['auto', 'top', 'bottom', 'left', 'right'])('keeps the %s card inside the window', (placement) => {
        const corner = { x: 0, y: 0, width: 30, height: 30 };
        const { x, y } = position(corner, { placement });

        expect(x).toBeGreaterThanOrEqual(INSETS.left);
        expect(y).toBeGreaterThanOrEqual(INSETS.top);
        expect(x + CARD.width).toBeLessThanOrEqual(WINDOW.width - INSETS.right);
        expect(y + CARD.height).toBeLessThanOrEqual(WINDOW.height - INSETS.bottom);
    });
});
